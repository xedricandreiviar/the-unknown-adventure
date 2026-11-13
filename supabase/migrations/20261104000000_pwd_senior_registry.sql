-- PWD / Senior Citizen registry + benefit (pension) tracking
-- Residents apply online (pending until an admin approves); staff can also encode walk-ins.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'resident');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  );
$$;

drop policy if exists "Users read own roles" on public.user_roles;
create policy "Users read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Admins manage roles" on public.user_roles;
create policy "Admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select, insert, update, delete on public.user_roles to authenticated;

-- ---------------------------------------------------------------------------
-- Registry
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.registry_category as enum ('pwd', 'senior');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.registry_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.registry_source as enum ('online', 'walk_in');
exception when duplicate_object then null; end $$;

create sequence if not exists public.registry_ref_seq;

create table if not exists public.registrants (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default '',
  user_id uuid references auth.users (id) on delete set null, -- null for walk-ins
  category public.registry_category not null,
  status public.registry_status not null default 'pending',
  source public.registry_source not null default 'online',
  full_name text not null check (char_length(trim(full_name)) between 2 and 150),
  birth_date date not null check (birth_date < current_date),
  sex text not null check (sex in ('Male', 'Female')),
  civil_status text,
  address text not null check (char_length(trim(address)) between 5 and 300),
  contact_number text,
  disability_type text,                 -- PWD only
  id_number text,                       -- existing PWD ID / OSCA ID, if any
  pension_applicant boolean not null default false,   -- applying for social pension
  receives_other_pension boolean not null default false, -- SSS/GSIS etc. (affects eligibility)
  rejection_reason text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  encoded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active registration per person per category (rejected ones may re-apply)
create unique index if not exists registrants_unique_active
  on public.registrants (category, lower(trim(full_name)), birth_date)
  where status <> 'rejected';

create index if not exists registrants_user_idx on public.registrants (user_id);
create index if not exists registrants_status_idx on public.registrants (status, category);

-- Reference code, rules, timestamps
create or replace function public.registrants_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.reference_code :=
      'WAWA-' || case new.category when 'pwd' then 'PWD' else 'SC' end
      || '-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.registry_ref_seq')::text, 4, '0');
  end if;

  if new.category = 'senior' and new.birth_date > (current_date - interval '60 years')::date then
    raise exception 'Senior citizens must be at least 60 years old.';
  end if;
  if new.category = 'pwd' and coalesce(trim(new.disability_type), '') = '' then
    raise exception 'Disability type is required for a PWD registration.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists registrants_before_write on public.registrants;
create trigger registrants_before_write
  before insert or update on public.registrants
  for each row execute function public.registrants_before_write();

alter table public.registrants enable row level security;

drop policy if exists "Residents read own registrations" on public.registrants;
create policy "Residents read own registrations" on public.registrants
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Residents apply online" on public.registrants;
create policy "Residents apply online" on public.registrants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and source = 'online'
    and reviewed_by is null
    and encoded_by is null
  );

drop policy if exists "Admins encode registrations" on public.registrants;
create policy "Admins encode registrations" on public.registrants
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins review registrations" on public.registrants;
create policy "Admins review registrations" on public.registrants
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins delete registrations" on public.registrants;
create policy "Admins delete registrations" on public.registrants
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

grant select, insert, update, delete on public.registrants to authenticated;
grant usage, select on sequence public.registry_ref_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Benefit releases (social pension, cash gifts, etc.)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.registry_release_status as enum ('scheduled', 'released', 'unclaimed');
exception when duplicate_object then null; end $$;

create table if not exists public.registry_releases (
  id uuid primary key default gen_random_uuid(),
  registrant_id uuid not null references public.registrants (id) on delete cascade,
  benefit_type text not null check (char_length(trim(benefit_type)) > 0),
  period text,                          -- e.g. "1st Semester 2026"
  amount numeric(10, 2) check (amount is null or amount >= 0),
  status public.registry_release_status not null default 'scheduled',
  release_date date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists registry_releases_registrant_idx on public.registry_releases (registrant_id);

create or replace function public.registry_releases_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.registrants where id = new.registrant_id and status = 'approved'
  ) then
    raise exception 'Benefits can only be recorded for approved registrants.';
  end if;
  return new;
end;
$$;

drop trigger if exists registry_releases_before_write on public.registry_releases;
create trigger registry_releases_before_write
  before insert or update on public.registry_releases
  for each row execute function public.registry_releases_before_write();

alter table public.registry_releases enable row level security;

drop policy if exists "Read own or all (admin) releases" on public.registry_releases;
create policy "Read own or all (admin) releases" on public.registry_releases
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.registrants r
      where r.id = registry_releases.registrant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "Admins manage releases" on public.registry_releases;
create policy "Admins manage releases" on public.registry_releases
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select, insert, update, delete on public.registry_releases to authenticated;

-- ---------------------------------------------------------------------------
-- Public status lookup by reference code (returns status only, no personal data)
-- ---------------------------------------------------------------------------
create or replace function public.track_registration(_code text)
returns table (
  reference_code text,
  category public.registry_category,
  status public.registry_status,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.reference_code, r.category, r.status, r.updated_at
  from public.registrants r
  where r.reference_code = upper(trim(_code))
  limit 1;
$$;

grant execute on function public.track_registration(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- FIRST ADMIN: after you sign up on the website, run this once in the Supabase
-- SQL editor, replacing the email with the staff member's account email:
--
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = 'staff@example.com'
--   on conflict do nothing;
-- ---------------------------------------------------------------------------
