-- =============================================================================
-- Barangay Wawa United — Base Schema
-- Run this FIRST on your new Supabase project, before the numbered migrations.
-- Supabase Dashboard → SQL Editor → New query → paste all → Run
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUMS  (must come before tables that reference them)
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.app_role as enum ('admin', 'resident');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('pending', 'approved', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.problem_status as enum ('submitted', 'under_review', 'in_progress', 'resolved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.release_status as enum ('pending', 'approved', 'ready_for_release', 'released');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending', 'in_queue', 'processing', 'completed', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reservation_status as enum ('pending', 'approved', 'rejected', 'cancelled', 'completed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. USER ROLES + has_role()  (must come before every table that uses it in RLS)
-- ---------------------------------------------------------------------------

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- has_role() must be created BEFORE any RLS policy that calls it
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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin');
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
-- 3. SHARED TRIGGER FUNCTION (updated_at)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. PROFILES
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text not null default '',
  middle_name text not null default '',
  last_name text not null default '',
  barangay text not null default 'Wawa',
  street text not null default '',
  purok text not null default '',
  contact_number text not null default '',
  birthdate date,
  sex text,
  is_senior boolean not null default false,
  is_pwd boolean not null default false,
  senior_id_number text,
  pwd_id_number text,
  pwd_disability_type text,
  document_path text,
  status public.account_status not null default 'pending',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles" on public.profiles
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins update all profiles" on public.profiles;
create policy "Admins update all profiles" on public.profiles
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins delete profiles" on public.profiles;
create policy "Admins delete profiles" on public.profiles
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

grant select, insert, update, delete on public.profiles to authenticated;

-- Auto-create profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. SERVICES
-- ---------------------------------------------------------------------------

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  requirements jsonb not null default '[]',
  fee numeric(10,2) not null default 0,
  enabled boolean not null default true,
  sort integer not null default 0
);

alter table public.services enable row level security;

drop policy if exists "Anyone reads enabled services" on public.services;
create policy "Anyone reads enabled services" on public.services
  for select using (enabled = true);

drop policy if exists "Admins manage services" on public.services;
create policy "Admins manage services" on public.services
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select on public.services to anon, authenticated;
grant insert, update, delete on public.services to authenticated;

-- ---------------------------------------------------------------------------
-- 6. SERVICE REQUESTS
-- ---------------------------------------------------------------------------

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  status public.request_status not null default 'pending',
  details text not null default '',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_requests enable row level security;

drop policy if exists "Users read own requests" on public.service_requests;
create policy "Users read own requests" on public.service_requests
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users create requests" on public.service_requests;
create policy "Users create requests" on public.service_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Admins manage requests" on public.service_requests;
create policy "Admins manage requests" on public.service_requests
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select, insert on public.service_requests to authenticated;

drop trigger if exists service_requests_updated_at on public.service_requests;
create trigger service_requests_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. COURT BLOCKS
-- ---------------------------------------------------------------------------

create table if not exists public.court_blocks (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  slot text,
  reason text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.court_blocks enable row level security;

drop policy if exists "Anyone reads court blocks" on public.court_blocks;
create policy "Anyone reads court blocks" on public.court_blocks
  for select using (true);

drop policy if exists "Admins manage court blocks" on public.court_blocks;
create policy "Admins manage court blocks" on public.court_blocks
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select on public.court_blocks to anon, authenticated;
grant insert, update, delete on public.court_blocks to authenticated;

-- ---------------------------------------------------------------------------
-- 8. COURT RESERVATIONS
-- ---------------------------------------------------------------------------

create table if not exists public.court_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  res_date date not null,
  slot text not null,
  purpose text not null,
  contact_number text not null,
  status public.reservation_status not null default 'pending',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.court_reservations enable row level security;

drop policy if exists "Users read own reservations" on public.court_reservations;
create policy "Users read own reservations" on public.court_reservations
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users create reservations" on public.court_reservations;
create policy "Users create reservations" on public.court_reservations
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Admins manage reservations" on public.court_reservations;
create policy "Admins manage reservations" on public.court_reservations
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select, insert on public.court_reservations to authenticated;

drop trigger if exists court_reservations_updated_at on public.court_reservations;
create trigger court_reservations_updated_at
  before update on public.court_reservations
  for each row execute function public.set_updated_at();

create or replace function public.court_slot_status(p_date date, p_slot text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.court_blocks
      where block_date = p_date and (slot is null or slot = p_slot)
    ) then 'blocked'
    when exists (
      select 1 from public.court_reservations
      where res_date = p_date and slot = p_slot and status in ('pending', 'approved')
    ) then 'booked'
    else 'available'
  end;
$$;

grant execute on function public.court_slot_status(date, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. ANNOUNCEMENTS
-- ---------------------------------------------------------------------------

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'general',
  image_path text,
  published boolean not null default false,
  published_at timestamptz,
  show_from timestamptz,
  show_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

drop policy if exists "Anyone reads published announcements" on public.announcements;
create policy "Anyone reads published announcements" on public.announcements
  for select using (
    published = true
    and (show_from is null or show_from <= now())
    and (show_until is null or show_until >= now())
  );

drop policy if exists "Admins manage announcements" on public.announcements;
create policy "Admins manage announcements" on public.announcements
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

drop trigger if exists announcements_updated_at on public.announcements;
create trigger announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. NOTIFICATIONS
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "Users manage own notifications" on public.notifications;
create policy "Users manage own notifications" on public.notifications
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Admins manage all notifications" on public.notifications;
create policy "Admins manage all notifications" on public.notifications
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select, insert, update, delete on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 11. PROBLEM REPORTS
-- ---------------------------------------------------------------------------

create table if not exists public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  description text not null,
  barangay text not null default 'Wawa',
  street text not null default '',
  purok text not null default '',
  photo_path text,
  status public.problem_status not null default 'submitted',
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.problem_reports enable row level security;

drop policy if exists "Users read own reports" on public.problem_reports;
create policy "Users read own reports" on public.problem_reports
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users create reports" on public.problem_reports;
create policy "Users create reports" on public.problem_reports
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Admins manage reports" on public.problem_reports;
create policy "Admins manage reports" on public.problem_reports
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select, insert on public.problem_reports to authenticated;

drop trigger if exists problem_reports_updated_at on public.problem_reports;
create trigger problem_reports_updated_at
  before update on public.problem_reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. BENEFIT RELEASES
-- ---------------------------------------------------------------------------

create table if not exists public.benefit_releases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  description text not null default '',
  status public.release_status not null default 'pending',
  date_released date,
  released_by uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.benefit_releases enable row level security;

drop policy if exists "Users read own benefit releases" on public.benefit_releases;
create policy "Users read own benefit releases" on public.benefit_releases
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Admins manage benefit releases" on public.benefit_releases;
create policy "Admins manage benefit releases" on public.benefit_releases
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select on public.benefit_releases to authenticated;

-- ---------------------------------------------------------------------------
-- 13. FEATURE FLAGS
-- ---------------------------------------------------------------------------

create table if not exists public.feature_flags (
  key text primary key,
  label text not null,
  enabled boolean not null default false,
  sort integer not null default 0
);

alter table public.feature_flags enable row level security;

drop policy if exists "Anyone reads feature flags" on public.feature_flags;
create policy "Anyone reads feature flags" on public.feature_flags
  for select using (true);

drop policy if exists "Admins manage feature flags" on public.feature_flags;
create policy "Admins manage feature flags" on public.feature_flags
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select on public.feature_flags to anon, authenticated;
grant insert, update, delete on public.feature_flags to authenticated;

-- ---------------------------------------------------------------------------
-- 14. SITE SETTINGS
-- ---------------------------------------------------------------------------

create table if not exists public.site_settings (
  id integer primary key default 1,
  hall_address text not null default 'Barangay Wawa, Taguig City',
  office_hours text not null default 'Mon–Fri, 8 AM–5 PM',
  office_phone text not null default '',
  office_email text not null default '',
  facebook_url text not null default '',
  court_fee numeric(10,2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint site_settings_single_row check (id = 1)
);

insert into public.site_settings (id) values (1) on conflict do nothing;

alter table public.site_settings enable row level security;

drop policy if exists "Anyone reads site settings" on public.site_settings;
create policy "Anyone reads site settings" on public.site_settings
  for select using (true);

drop policy if exists "Admins update site settings" on public.site_settings;
create policy "Admins update site settings" on public.site_settings
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 15. STORAGE BUCKET: uploads
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads', 'uploads', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "uploads owner read" on storage.objects;
create policy "uploads owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'uploads'
    and (
      public.has_role(auth.uid(), 'admin')
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists "uploads owner insert" on storage.objects;
create policy "uploads owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "uploads admin delete" on storage.objects;
create policy "uploads admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 16. SEED DATA
-- ---------------------------------------------------------------------------

insert into public.services (code, name, description, requirements, fee, sort) values
  ('barangay-clearance', 'Barangay Clearance', 'General-purpose clearance for employment, business, or personal use.', '["Valid government-issued ID","Cedula / Community Tax Certificate"]', 100, 1),
  ('barangay-indigency', 'Certificate of Indigency', 'Certifies that you are a low-income resident of Barangay Wawa.', '["Valid government-issued ID","Proof of residence"]', 0, 2),
  ('barangay-residency', 'Certificate of Residency', 'Proves that you are a registered resident of Barangay Wawa.', '["Valid government-issued ID","Proof of residence (utility bill, etc.)"]', 100, 3),
  ('business-clearance', 'Business Clearance', 'Required before obtaining a mayor''s permit for a new or renewing business.', '["DTI / SEC registration","Valid government-issued ID","Cedula"]', 300, 4),
  ('blotter-report', 'Blotter Report / Police Clearance', 'Official record of a complaint or incident at the barangay level.', '["Valid government-issued ID","Written account of the incident"]', 0, 5),
  ('lot-ownership', 'Certificate of Lot Ownership', 'Certifies that you own or occupy a parcel of land in Barangay Wawa.', '["Tax declaration","Valid government-issued ID"]', 100, 6)
on conflict (code) do nothing;

insert into public.feature_flags (key, label, enabled, sort) values
  ('court_booking',    'Court booking',         true, 1),
  ('service_requests', 'Service requests',      true, 2),
  ('problem_reports',  'Problem reports',       true, 3),
  ('pwd_registry',     'PWD / Senior registry', true, 4),
  ('announcements',    'Announcements',         true, 5)
on conflict (key) do nothing;

-- =============================================================================
-- END — now run the 4 migration files in supabase/migrations/ in order.
-- =============================================================================
