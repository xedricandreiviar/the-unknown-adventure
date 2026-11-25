-- =============================================================================
-- Barangay Wawa United — COMPLETE SCHEMA (single file, run once)
-- Supabase Dashboard → SQL Editor → New query → paste all → Run
-- This replaces running 00_base_schema.sql + the 4 migration files separately.
-- Safe to run on a fresh project. Uses IF NOT EXISTS / OR REPLACE throughout.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------------

do $$ begin create type public.app_role             as enum ('admin', 'resident');                                                             exception when duplicate_object then null; end $$;
do $$ begin create type public.account_status       as enum ('pending', 'approved', 'rejected', 'suspended');                                   exception when duplicate_object then null; end $$;
do $$ begin create type public.problem_status       as enum ('submitted', 'under_review', 'in_progress', 'resolved', 'rejected');               exception when duplicate_object then null; end $$;
do $$ begin create type public.release_status       as enum ('pending', 'approved', 'ready_for_release', 'released');                           exception when duplicate_object then null; end $$;
do $$ begin create type public.request_status       as enum ('pending', 'in_queue', 'processing', 'completed', 'rejected', 'cancelled');        exception when duplicate_object then null; end $$;
do $$ begin create type public.reservation_status   as enum ('pending', 'approved', 'rejected', 'cancelled', 'completed');                      exception when duplicate_object then null; end $$;
do $$ begin create type public.registry_category    as enum ('pwd', 'senior');                                                                  exception when duplicate_object then null; end $$;
do $$ begin create type public.registry_status      as enum ('pending', 'approved', 'rejected');                                                exception when duplicate_object then null; end $$;
do $$ begin create type public.registry_source      as enum ('online', 'walk_in');                                                              exception when duplicate_object then null; end $$;
do $$ begin create type public.registry_release_status as enum ('scheduled', 'released', 'unclaimed');                                         exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. USER ROLES + has_role()  — must come before every RLS policy that calls it
-- ---------------------------------------------------------------------------

create table if not exists public.user_roles (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role    public.app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin');
$$;

drop policy if exists "Users read own roles"  on public.user_roles;
create policy "Users read own roles"  on public.user_roles for select to authenticated using (user_id = auth.uid());
drop policy if exists "Admins manage roles"   on public.user_roles;
create policy "Admins manage roles"   on public.user_roles for all    to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

grant select, insert, update, delete on public.user_roles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. SHARED updated_at TRIGGER FUNCTION
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;

-- ---------------------------------------------------------------------------
-- 4. PROFILES
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text not null,
  first_name          text not null default '',
  middle_name         text not null default '',
  last_name           text not null default '',
  barangay            text not null default 'Wawa',
  street              text not null default '',
  purok               text not null default '',
  contact_number      text not null default '',
  birthdate           date,
  sex                 text,
  is_senior           boolean not null default false,
  is_pwd              boolean not null default false,
  senior_id_number    text,
  pwd_id_number       text,
  pwd_disability_type text,
  document_path       text,
  status              public.account_status not null default 'pending',
  rejection_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "Users read own profile"    on public.profiles;
create policy "Users read own profile"    on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "Users update own profile"  on public.profiles;
create policy "Users update own profile"  on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "Admins read all profiles"  on public.profiles;
create policy "Admins read all profiles"  on public.profiles for select to authenticated using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "Admins update all profiles" on public.profiles;
create policy "Admins update all profiles" on public.profiles for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "Admins delete profiles"    on public.profiles;
create policy "Admins delete profiles"    on public.profiles for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

grant select, insert, update, delete on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. SERVICES
-- ---------------------------------------------------------------------------

create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  description  text not null default '',
  requirements jsonb not null default '[]',
  fee          numeric(10,2) not null default 0,
  enabled      boolean not null default true,
  sort         integer not null default 0
);
alter table public.services enable row level security;
drop policy if exists "Anyone reads enabled services" on public.services;
create policy "Anyone reads enabled services" on public.services for select using (enabled = true);
drop policy if exists "Admins manage services" on public.services;
create policy "Admins manage services" on public.services for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select on public.services to anon, authenticated;
grant insert, update, delete on public.services to authenticated;

-- ---------------------------------------------------------------------------
-- 6. SERVICE REQUESTS
-- ---------------------------------------------------------------------------

create table if not exists public.service_requests (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  user_id          uuid not null references auth.users (id) on delete cascade,
  service_id       uuid not null references public.services (id) on delete restrict,
  status           public.request_status not null default 'pending',
  details          text not null default '',
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.service_requests enable row level security;
drop policy if exists "Users read own requests"   on public.service_requests;
create policy "Users read own requests"   on public.service_requests for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users create requests"     on public.service_requests;
create policy "Users create requests"     on public.service_requests for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Admins manage requests"    on public.service_requests;
create policy "Admins manage requests"    on public.service_requests for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select, insert on public.service_requests to authenticated;
drop trigger if exists service_requests_updated_at on public.service_requests;
create trigger service_requests_updated_at before update on public.service_requests for each row execute function public.set_updated_at();

-- Foreign key to profiles (needed for PostgREST joins)
alter table public.service_requests
  drop constraint if exists service_requests_profile_fkey;
alter table public.service_requests
  add constraint service_requests_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 7. COURT BLOCKS
-- ---------------------------------------------------------------------------

create table if not exists public.court_blocks (
  id         uuid primary key default gen_random_uuid(),
  block_date date not null,
  slot       text,
  reason     text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.court_blocks enable row level security;
drop policy if exists "Anyone reads court blocks"   on public.court_blocks;
create policy "Anyone reads court blocks"   on public.court_blocks for select using (true);
drop policy if exists "Admins manage court blocks"  on public.court_blocks;
create policy "Admins manage court blocks"  on public.court_blocks for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select on public.court_blocks to anon, authenticated;
grant insert, update, delete on public.court_blocks to authenticated;

-- ---------------------------------------------------------------------------
-- 8. COURT RESERVATIONS
-- ---------------------------------------------------------------------------

create table if not exists public.court_reservations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  res_date         date not null,
  slot             text not null,
  purpose          text not null,
  contact_number   text not null,
  status           public.reservation_status not null default 'pending',
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.court_reservations enable row level security;
drop policy if exists "Users read own reservations"  on public.court_reservations;
create policy "Users read own reservations"  on public.court_reservations for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users create reservations"    on public.court_reservations;
create policy "Users create reservations"    on public.court_reservations for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Admins manage reservations"   on public.court_reservations;
create policy "Admins manage reservations"   on public.court_reservations for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select, insert on public.court_reservations to authenticated;
drop trigger if exists court_reservations_updated_at on public.court_reservations;
create trigger court_reservations_updated_at before update on public.court_reservations for each row execute function public.set_updated_at();

alter table public.court_reservations drop constraint if exists court_reservations_profile_fkey;
alter table public.court_reservations add constraint court_reservations_profile_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

create or replace function public.court_slot_status(p_date date, p_slot text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.court_blocks     where block_date = p_date and (slot is null or slot = p_slot)) then 'blocked'
    when exists (select 1 from public.court_reservations where res_date = p_date and slot = p_slot and status in ('pending','approved')) then 'booked'
    else 'available'
  end;
$$;
grant execute on function public.court_slot_status(date, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. ANNOUNCEMENTS
-- ---------------------------------------------------------------------------

create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  category     text not null default 'general',
  image_path   text,
  published    boolean not null default false,
  published_at timestamptz,
  show_from    timestamptz,
  show_until   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists "Anyone reads published announcements" on public.announcements;
create policy "Anyone reads published announcements" on public.announcements for select using (
  published = true and (show_from is null or show_from <= now()) and (show_until is null or show_until >= now())
);
drop policy if exists "Admins manage announcements" on public.announcements;
create policy "Admins manage announcements" on public.announcements for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;
drop trigger if exists announcements_updated_at on public.announcements;
create trigger announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. NOTIFICATIONS
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  body       text not null default '',
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "Users manage own notifications"    on public.notifications;
create policy "Users manage own notifications"    on public.notifications for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Admins manage all notifications"   on public.notifications;
create policy "Admins manage all notifications"   on public.notifications for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select, insert, update, delete on public.notifications to authenticated;

alter table public.notifications drop constraint if exists notifications_profile_fkey;
alter table public.notifications add constraint notifications_profile_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 11. PROBLEM REPORTS
-- ---------------------------------------------------------------------------

create table if not exists public.problem_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  category    text not null,
  description text not null,
  barangay    text not null default 'Wawa',
  street      text not null default '',
  purok       text not null default '',
  photo_path  text,
  status      public.problem_status not null default 'submitted',
  admin_reply text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.problem_reports enable row level security;
drop policy if exists "Users read own reports"   on public.problem_reports;
create policy "Users read own reports"   on public.problem_reports for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users create reports"     on public.problem_reports;
create policy "Users create reports"     on public.problem_reports for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Admins manage reports"    on public.problem_reports;
create policy "Admins manage reports"    on public.problem_reports for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select, insert on public.problem_reports to authenticated;
drop trigger if exists problem_reports_updated_at on public.problem_reports;
create trigger problem_reports_updated_at before update on public.problem_reports for each row execute function public.set_updated_at();

alter table public.problem_reports drop constraint if exists problem_reports_profile_fkey;
alter table public.problem_reports add constraint problem_reports_profile_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 12. BENEFIT RELEASES
-- ---------------------------------------------------------------------------

create table if not exists public.benefit_releases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null,
  description   text not null default '',
  status        public.release_status not null default 'pending',
  date_released date,
  released_by   uuid references auth.users (id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.benefit_releases enable row level security;
drop policy if exists "Users read own benefit releases"  on public.benefit_releases;
create policy "Users read own benefit releases"  on public.benefit_releases for select to authenticated using (user_id = auth.uid());
drop policy if exists "Admins manage benefit releases"   on public.benefit_releases;
create policy "Admins manage benefit releases"   on public.benefit_releases for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select on public.benefit_releases to authenticated;

-- ---------------------------------------------------------------------------
-- 13. FEATURE FLAGS
-- ---------------------------------------------------------------------------

create table if not exists public.feature_flags (
  key     text primary key,
  label   text not null,
  enabled boolean not null default false,
  sort    integer not null default 0
);
alter table public.feature_flags enable row level security;
drop policy if exists "Anyone reads feature flags"    on public.feature_flags;
create policy "Anyone reads feature flags"    on public.feature_flags for select using (true);
drop policy if exists "Admins manage feature flags"   on public.feature_flags;
create policy "Admins manage feature flags"   on public.feature_flags for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select on public.feature_flags to anon, authenticated;
grant insert, update, delete on public.feature_flags to authenticated;

-- ---------------------------------------------------------------------------
-- 14. SITE SETTINGS
-- ---------------------------------------------------------------------------

create table if not exists public.site_settings (
  id            integer primary key default 1,
  hall_address  text not null default 'Barangay Wawa, Taguig City',
  office_hours  text not null default 'Mon–Fri, 8 AM–5 PM',
  office_phone  text not null default '',
  office_email  text not null default '',
  facebook_url  text not null default '',
  court_fee     numeric(10,2) not null default 0,
  updated_at    timestamptz not null default now(),
  constraint site_settings_single_row check (id = 1)
);
insert into public.site_settings (id) values (1) on conflict do nothing;
alter table public.site_settings enable row level security;
drop policy if exists "Anyone reads site settings"    on public.site_settings;
create policy "Anyone reads site settings"    on public.site_settings for select using (true);
drop policy if exists "Admins update site settings"   on public.site_settings;
create policy "Admins update site settings"   on public.site_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 15. PWD / SENIOR REGISTRY  (from migration 20261104)
-- ---------------------------------------------------------------------------

create sequence if not exists public.registry_ref_seq;

create table if not exists public.registrants (
  id                      uuid primary key default gen_random_uuid(),
  reference_code          text not null unique default '',
  user_id                 uuid references auth.users (id) on delete set null,
  category                public.registry_category not null,
  status                  public.registry_status not null default 'pending',
  source                  public.registry_source not null default 'online',
  full_name               text not null check (char_length(trim(full_name)) between 2 and 150),
  birth_date              date not null check (birth_date < current_date),
  sex                     text not null check (sex in ('Male', 'Female')),
  civil_status            text,
  address                 text not null check (char_length(trim(address)) between 5 and 300),
  contact_number          text,
  disability_type         text,
  id_number               text,
  pension_applicant       boolean not null default false,
  receives_other_pension  boolean not null default false,
  applicant_type          text not null default 'self',
  rep_full_name           text,
  rep_relationship        text,
  rep_contact_number      text,
  id_expiry               date,
  chk_name_dob            boolean not null default false,
  chk_residency           boolean not null default false,
  chk_photo_match         boolean not null default false,
  chk_disability          boolean not null default false,
  chk_representative      boolean not null default false,
  rejection_reason        text,
  reviewed_by             uuid references auth.users (id) on delete set null,
  reviewed_at             timestamptz,
  encoded_by              uuid references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint registrants_applicant_type_chk check (applicant_type in ('self', 'representative')),
  constraint registrants_rep_fields_chk check (
    applicant_type = 'self'
    or (coalesce(trim(rep_full_name), '') <> '' and coalesce(trim(rep_relationship), '') <> '')
  )
);

create unique index if not exists registrants_unique_active
  on public.registrants (category, lower(trim(full_name)), birth_date)
  where status <> 'rejected';

create unique index if not exists registrants_unique_id_number
  on public.registrants (category, upper(trim(id_number)))
  where id_number is not null and trim(id_number) <> '' and status <> 'rejected';

create index if not exists registrants_user_idx   on public.registrants (user_id);
create index if not exists registrants_status_idx on public.registrants (status, category);

create or replace function public.registrants_before_write()
returns trigger language plpgsql set search_path = public as $$
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
create trigger registrants_before_write before insert or update on public.registrants for each row execute function public.registrants_before_write();

alter table public.registrants enable row level security;
drop policy if exists "Residents read own registrations" on public.registrants;
create policy "Residents read own registrations" on public.registrants for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "Residents apply online" on public.registrants;
create policy "Residents apply online" on public.registrants for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and source = 'online' and reviewed_by is null and encoded_by is null);
drop policy if exists "Admins encode registrations" on public.registrants;
create policy "Admins encode registrations" on public.registrants for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "Admins review registrations" on public.registrants;
create policy "Admins review registrations" on public.registrants for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "Admins delete registrations" on public.registrants;
create policy "Admins delete registrations" on public.registrants for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));
grant select, insert, update, delete on public.registrants to authenticated;
grant usage, select on sequence public.registry_ref_seq to authenticated;

-- ---------------------------------------------------------------------------
-- 16. REGISTRY RELEASES  (from migrations 20261104 + 20261107)
-- ---------------------------------------------------------------------------

create table if not exists public.registry_releases (
  id                   uuid primary key default gen_random_uuid(),
  registrant_id        uuid not null references public.registrants (id) on delete cascade,
  benefit_type         text not null check (char_length(trim(benefit_type)) > 0),
  benefit_year         integer not null default (extract(year from (now() at time zone 'Asia/Manila'))::integer),
  period               text,
  amount               numeric(10, 2) check (amount is null or amount >= 0),
  status               public.registry_release_status not null default 'scheduled',
  release_date         date,
  notes                text,
  claimed_by_type      text,
  claimant_name        text,
  claimant_relationship text,
  id_presented         boolean not null default false,
  claimed_at           timestamptz,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint registry_releases_claimed_by_chk check (claimed_by_type in ('self', 'representative'))
);

create unique index if not exists registry_releases_unique_per_year
  on public.registry_releases (registrant_id, benefit_type, benefit_year);
create index if not exists registry_releases_registrant_idx on public.registry_releases (registrant_id);

alter table public.registry_releases enable row level security;
drop policy if exists "Read own or all (admin) releases" on public.registry_releases;
create policy "Read own or all (admin) releases" on public.registry_releases for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or exists (
    select 1 from public.registrants r where r.id = registry_releases.registrant_id and r.user_id = auth.uid()
  ));
drop policy if exists "Admins manage releases" on public.registry_releases;
create policy "Admins manage releases" on public.registry_releases for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select, insert, update, delete on public.registry_releases to authenticated;

-- ---------------------------------------------------------------------------
-- 17. REGISTRANT DOCUMENTS  (from migration 20261108)
-- ---------------------------------------------------------------------------

create table if not exists public.registrant_documents (
  id                  uuid primary key default gen_random_uuid(),
  registrant_id       uuid not null references public.registrants (id) on delete cascade,
  doc_type            text not null check (doc_type in (
                        'valid_id','birth_certificate','residency_proof','id_photo',
                        'disability_proof','authorization_letter','representative_id')),
  storage_path        text not null unique,
  file_name           text not null,
  mime_type           text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  size_bytes          integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by         uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  verified_by         uuid references auth.users (id) on delete set null,
  verified_at         timestamptz,
  note                text
);
create index if not exists registrant_documents_registrant_idx on public.registrant_documents (registrant_id);
alter table public.registrant_documents enable row level security;
drop policy if exists "Read own or all documents" on public.registrant_documents;
create policy "Read own or all documents" on public.registrant_documents for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or exists (
    select 1 from public.registrants r where r.id = registrant_documents.registrant_id and r.user_id = auth.uid()
  ));
drop policy if exists "Owner uploads documents" on public.registrant_documents;
create policy "Owner uploads documents" on public.registrant_documents for insert to authenticated
  with check (uploaded_by = auth.uid() and verification_status = 'pending' and verified_by is null and exists (
    select 1 from public.registrants r where r.id = registrant_documents.registrant_id and r.user_id = auth.uid() and r.status = 'pending'
  ));
drop policy if exists "Admins manage documents" on public.registrant_documents;
create policy "Admins manage documents" on public.registrant_documents for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
grant select, insert, update, delete on public.registrant_documents to authenticated;

-- ---------------------------------------------------------------------------
-- 18. REGISTRY AUDIT LOG  (from migration 20261108)
-- ---------------------------------------------------------------------------

create table if not exists public.registry_audit (
  id            uuid primary key default gen_random_uuid(),
  registrant_id uuid not null references public.registrants (id) on delete cascade,
  actor         uuid,
  action        text not null,
  details       text,
  created_at    timestamptz not null default now()
);
create index if not exists registry_audit_registrant_idx on public.registry_audit (registrant_id, created_at desc);
alter table public.registry_audit enable row level security;
drop policy if exists "Admins read audit" on public.registry_audit;
create policy "Admins read audit" on public.registry_audit for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
grant select on public.registry_audit to authenticated;

-- ---------------------------------------------------------------------------
-- 19. REGISTRY FUNCTIONS  (from migrations 20261104 + 20261107 + 20261108)
-- ---------------------------------------------------------------------------

create or replace function public._has_verified_doc(_rid uuid, _types text[])
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from public.registrant_documents d
    where d.registrant_id = _rid and d.verification_status = 'verified' and d.doc_type = any(_types));
$$;

create or replace function public.registrant_blockers(_registrant_id uuid)
returns text[] language plpgsql stable set search_path = public as $$
declare r public.registrants; b text[] := '{}'; begin
  select * into r from public.registrants where id = _registrant_id;
  if not found then return array['Registrant not found']; end if;
  if r.category = 'senior' then
    if not public._has_verified_doc(r.id, array['birth_certificate','valid_id']) then b := b || 'Verified proof of age (birth certificate or valid ID)'; end if;
  else
    if not public._has_verified_doc(r.id, array['valid_id'])          then b := b || 'Verified valid government ID'; end if;
    if not public._has_verified_doc(r.id, array['disability_proof'])   then b := b || 'Verified proof of disability'; end if;
    if not r.chk_disability then b := b || 'Cross-check: disability certificate is valid'; end if;
    if r.id_expiry is not null and r.id_expiry < current_date then b := b || 'The PWD ID is expired'; end if;
  end if;
  if not public._has_verified_doc(r.id, array['residency_proof']) then b := b || 'Verified proof of residence'; end if;
  if not public._has_verified_doc(r.id, array['id_photo'])        then b := b || 'Verified ID photo'; end if;
  if not r.chk_name_dob    then b := b || 'Cross-check: name and birth date match the documents'; end if;
  if not r.chk_residency   then b := b || 'Cross-check: address matches the proof of residence'; end if;
  if not r.chk_photo_match then b := b || 'Cross-check: face matches the ID photo and IDs'; end if;
  if r.applicant_type = 'representative' then
    if not public._has_verified_doc(r.id, array['authorization_letter']) then b := b || 'Verified authorization letter'; end if;
    if not public._has_verified_doc(r.id, array['representative_id'])    then b := b || 'Verified valid ID of the representative'; end if;
    if not r.chk_representative then b := b || 'Cross-check: authorization letter is signed'; end if;
  end if;
  return b;
end;
$$;
grant execute on function public.registrant_blockers(uuid) to authenticated;

create or replace function public.senior_gift_amount(_age integer)
returns numeric language sql immutable as $$
  select case when _age >= 100 then 100000 when _age >= 90 then 10000 when _age >= 80 then 5000 when _age >= 70 then 4000 when _age >= 60 then 3000 else null end::numeric;
$$;
grant execute on function public.senior_gift_amount(integer) to anon, authenticated;

drop function if exists public.track_registration(text);
drop function if exists public.track_registration(text, integer);
create or replace function public.track_registration(_code text, _year integer default null)
returns table (reference_code text, category public.registry_category, status public.registry_status,
               benefit_year integer, senior_gift_amount numeric, incentives jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with y as (select coalesce(_year, extract(year from (now() at time zone 'Asia/Manila'))::integer) as yr)
  select r.reference_code, r.category, r.status, y.yr,
    case when r.category = 'senior' then public.senior_gift_amount(y.yr - extract(year from r.birth_date)::integer) end,
    coalesce((select jsonb_agg(jsonb_build_object('type',b.benefit_type,'status',b.status,'amount',b.amount,'date',b.release_date) order by b.created_at)
              from public.registry_releases b where b.registrant_id = r.id and b.benefit_year = y.yr), '[]'::jsonb),
    greatest(r.updated_at, coalesce((select max(b2.created_at) from public.registry_releases b2 where b2.registrant_id = r.id), r.updated_at))
  from public.registrants r, y where r.reference_code = upper(trim(_code)) limit 1;
$$;
grant execute on function public.track_registration(text, integer) to anon, authenticated;

-- Approval gate: cannot approve until all blockers are cleared
create or replace function public.registrants_verify_before_approve()
returns trigger language plpgsql set search_path = public as $$
declare blockers text[]; begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception 'New registrations must start as pending.'; end if;
    return new;
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    blockers := public.registrant_blockers(new.id);
    if coalesce(array_length(blockers, 1), 0) > 0 then
      raise exception 'Cannot approve yet. Still needed: %', array_to_string(blockers, '; ');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists registrants_verify_before_approve on public.registrants;
create trigger registrants_verify_before_approve before insert or update on public.registrants for each row execute function public.registrants_verify_before_approve();

-- Benefit release validation
create or replace function public.registry_releases_before_write()
returns trigger language plpgsql set search_path = public as $$
declare cat public.registry_category; begin
  select category into cat from public.registrants where id = new.registrant_id and status = 'approved';
  if cat is null then raise exception 'Benefits can only be recorded for approved registrants.'; end if;
  if new.benefit_type like 'PWD %'    and cat <> 'pwd'    then raise exception 'This benefit is only for PWD registrants.'; end if;
  if new.benefit_type like 'Senior %' and cat <> 'senior' then raise exception 'This benefit is only for senior citizen registrants.'; end if;
  return new;
end;
$$;
drop trigger if exists registry_releases_before_write on public.registry_releases;
create trigger registry_releases_before_write before insert or update on public.registry_releases for each row execute function public.registry_releases_before_write();

-- Claim validation
create or replace function public.registry_releases_claim_check()
returns trigger language plpgsql set search_path = public as $$
declare becoming_released boolean := false; begin
  if new.status = 'released' then
    becoming_released := (tg_op = 'INSERT') or (old.status is distinct from 'released');
  end if;
  if becoming_released then
    if not coalesce(new.id_presented, false) then raise exception 'Confirm that the physical ID was presented.'; end if;
    if new.claimed_by_type is null then raise exception 'Select who claimed the benefit.'; end if;
    if new.claimed_by_type = 'representative' then
      if coalesce(trim(new.claimant_name), '') = '' or coalesce(trim(new.claimant_relationship), '') = '' then
        raise exception 'Enter the representative''s name and relationship.';
      end if;
      if not public._has_verified_doc(new.registrant_id, array['authorization_letter'])
         or not public._has_verified_doc(new.registrant_id, array['representative_id']) then
        raise exception 'A representative needs a verified authorization letter and ID on file.';
      end if;
    end if;
    new.claimed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists registry_releases_claim_check on public.registry_releases;
create trigger registry_releases_claim_check before insert or update on public.registry_releases for each row execute function public.registry_releases_claim_check();

-- Audit triggers
create or replace function public.audit_registrants()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.registry_audit (registrant_id, actor, action, details) values (new.id, auth.uid(), 'Registered', new.source::text || ' · ' || new.applicant_type);
  elsif new.status is distinct from old.status then
    insert into public.registry_audit (registrant_id, actor, action, details) values (new.id, auth.uid(), 'Status: ' || old.status::text || ' → ' || new.status::text, new.rejection_reason);
  elsif (new.chk_name_dob, new.chk_residency, new.chk_photo_match, new.chk_disability, new.chk_representative)
        is distinct from (old.chk_name_dob, old.chk_residency, old.chk_photo_match, old.chk_disability, old.chk_representative) then
    insert into public.registry_audit (registrant_id, actor, action, details) values (new.id, auth.uid(), 'Cross-check updated', null);
  end if;
  return null;
end;
$$;
drop trigger if exists audit_registrants on public.registrants;
create trigger audit_registrants after insert or update on public.registrants for each row execute function public.audit_registrants();

create or replace function public.audit_registrant_documents()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.registry_audit (registrant_id, actor, action, details) values (new.registrant_id, auth.uid(), 'Document uploaded', new.doc_type);
  elsif new.verification_status is distinct from old.verification_status then
    insert into public.registry_audit (registrant_id, actor, action, details)
    values (new.registrant_id, auth.uid(), 'Document ' || new.verification_status, new.doc_type || coalesce(': ' || new.note, ''));
  end if;
  return null;
end;
$$;
drop trigger if exists audit_registrant_documents on public.registrant_documents;
create trigger audit_registrant_documents after insert or update on public.registrant_documents for each row execute function public.audit_registrant_documents();

create or replace function public.audit_registry_releases()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.registry_audit (registrant_id, actor, action, details)
    values (new.registrant_id, auth.uid(), 'Benefit scheduled', new.benefit_type || ' ' || new.benefit_year::text);
  elsif new.status is distinct from old.status then
    insert into public.registry_audit (registrant_id, actor, action, details)
    values (new.registrant_id, auth.uid(), 'Benefit ' || new.status::text,
      new.benefit_type || ' ' || new.benefit_year::text ||
      case when new.status = 'released' and new.claimed_by_type = 'representative'
        then ' · claimed by representative ' || coalesce(new.claimant_name, '')
           when new.status = 'released' then ' · claimed by beneficiary' else '' end);
  end if;
  return null;
end;
$$;
drop trigger if exists audit_registry_releases on public.registry_releases;
create trigger audit_registry_releases after insert or update on public.registry_releases for each row execute function public.audit_registry_releases();

-- ---------------------------------------------------------------------------
-- 20. STORAGE BUCKETS
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "uploads owner read"   on storage.objects;
create policy "uploads owner read"   on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (public.has_role(auth.uid(), 'admin') or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists "uploads owner insert" on storage.objects;
create policy "uploads owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "uploads admin delete" on storage.objects;
create policy "uploads admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and public.has_role(auth.uid(), 'admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registry-docs', 'registry-docs', false, 5242880, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "registry-docs read"         on storage.objects;
create policy "registry-docs read"         on storage.objects for select to authenticated
  using (bucket_id = 'registry-docs' and (public.has_role(auth.uid(), 'admin') or exists (
    select 1 from public.registrants r where r.id::text = (storage.foldername(name))[1] and r.user_id = auth.uid()
  )));
drop policy if exists "registry-docs upload"       on storage.objects;
create policy "registry-docs upload"       on storage.objects for insert to authenticated
  with check (bucket_id = 'registry-docs' and (public.has_role(auth.uid(), 'admin') or exists (
    select 1 from public.registrants r where r.id::text = (storage.foldername(name))[1] and r.user_id = auth.uid() and r.status = 'pending'
  )));
drop policy if exists "registry-docs admin delete" on storage.objects;
create policy "registry-docs admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'registry-docs' and public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 21. SEED DATA
-- ---------------------------------------------------------------------------

insert into public.services (code, name, description, requirements, fee, sort) values
  ('barangay-clearance', 'Barangay Clearance',           'General-purpose clearance for employment, business, or personal use.', '["Valid government-issued ID","Cedula / Community Tax Certificate"]', 100, 1),
  ('barangay-indigency', 'Certificate of Indigency',     'Certifies that you are a low-income resident of Barangay Wawa.',       '["Valid government-issued ID","Proof of residence"]', 0, 2),
  ('barangay-residency', 'Certificate of Residency',     'Proves that you are a registered resident of Barangay Wawa.',          '["Valid government-issued ID","Proof of residence (utility bill, etc.)"]', 100, 3),
  ('business-clearance', 'Business Clearance',           'Required before obtaining a mayor''s permit.',                         '["DTI / SEC registration","Valid government-issued ID","Cedula"]', 300, 4),
  ('blotter-report',     'Blotter Report',               'Official record of a complaint or incident at the barangay level.',    '["Valid government-issued ID","Written account of the incident"]', 0, 5),
  ('lot-ownership',      'Certificate of Lot Ownership', 'Certifies that you own or occupy a parcel of land in Barangay Wawa.', '["Tax declaration","Valid government-issued ID"]', 100, 6)
on conflict (code) do nothing;

insert into public.feature_flags (key, label, enabled, sort) values
  ('court_booking',    'Court booking',         true, 1),
  ('service_requests', 'Service requests',      true, 2),
  ('problem_reports',  'Problem reports',       true, 3),
  ('pwd_registry',     'PWD / Senior registry', true, 4),
  ('announcements',    'Announcements',         true, 5)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 22. RELOAD SCHEMA CACHE
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';

-- =============================================================================
-- DONE. All tables, functions, triggers, RLS policies, buckets, and seed data
-- are now in place.
--
-- Last step — make yourself admin (replace the email):
--
--   update public.profiles set status = 'approved' where email = 'you@example.com';
--   insert into public.user_roles (user_id, role)
--   select id, 'admin'::public.app_role from auth.users where email = 'you@example.com'
--   on conflict do nothing;
-- =============================================================================
