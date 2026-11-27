-- =============================================================================
-- Migration: quota system, pickup dates, weekly limits, certificate PDF tracking
-- Run after: complete_schema.sql (or the original Lovable migrations)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Site settings: add daily quota and office days
-- ---------------------------------------------------------------------------
alter table public.site_settings
  add column if not exists daily_quota      integer not null default 20,
  add column if not exists office_days      integer[] not null default '{1,2,3,4,5}',
  -- 1=Mon…7=Sun (ISO weekday). Default Mon–Fri.
  add column if not exists skip_today_after time not null default '15:00:00';
  -- Requests filed after this time (Manila) count toward tomorrow's quota.

-- ---------------------------------------------------------------------------
-- 2. Services: add per-service weekly limit (0 = unlimited)
-- ---------------------------------------------------------------------------
alter table public.services
  add column if not exists weekly_limit integer not null default 1;
  -- 1 = one request per resident per week (the professor's requirement).
  -- Set to 0 to allow unlimited requests for a service.

-- ---------------------------------------------------------------------------
-- 3. Service requests: add pickup date and certificate path
-- ---------------------------------------------------------------------------
alter table public.service_requests
  add column if not exists pickup_date      date,
  add column if not exists certificate_path text;
  -- pickup_date: estimated date the document will be ready (computed on submit).
  -- certificate_path: storage path of the generated PDF certificate.

-- New status: 'ready' = signed by captain, ready for the resident to pick up.
-- We add it by recreating the enum with the new value.
do $$ begin
  alter type public.request_status add value if not exists 'ready';
exception when others then null; end $$;

-- ---------------------------------------------------------------------------
-- 4. Function: compute pickup date given a submission timestamp
--    Rules:
--    a) Count pending+in_queue+processing requests already scheduled for the
--       target day. If that day's quota is not full, use it.
--    b) Skip days not in office_days.
--    c) If submitted after skip_today_after (Manila time), start from tomorrow.
--    d) Walk forward day by day until a day with capacity is found.
-- ---------------------------------------------------------------------------
create or replace function public.compute_pickup_date(
  _submitted_at timestamptz default now()
)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings      public.site_settings%rowtype;
  candidate     date;
  day_of_week   integer;    -- ISO 1=Mon…7=Sun
  load          integer;
  manila_now    timestamptz;
  cutoff_today  boolean;
begin
  select * into settings from public.site_settings where id = 1;

  -- Convert submission time to Manila
  manila_now   := _submitted_at at time zone 'Asia/Manila';
  cutoff_today := (manila_now::time) >= settings.skip_today_after;

  -- Start candidate: today in Manila, or tomorrow if past cutoff
  candidate := (manila_now::date) + (case when cutoff_today then 1 else 0 end);

  -- Walk forward until we find a working day that has quota remaining
  for _ in 1..90 loop
    day_of_week := extract(isodow from candidate);

    -- Skip non-office days
    if not (day_of_week = any(settings.office_days)) then
      candidate := candidate + 1;
      continue;
    end if;

    -- Count how many requests are already assigned to this day
    select count(*) into load
    from public.service_requests
    where pickup_date = candidate
      and status not in ('cancelled', 'rejected');

    if load < settings.daily_quota then
      return candidate;
    end if;

    candidate := candidate + 1;
  end loop;

  -- Fallback: 90 days from now (should never happen in practice)
  return (manila_now::date) + 90;
end;
$$;

grant execute on function public.compute_pickup_date(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Function: check weekly limit for a resident + service combination
-- ---------------------------------------------------------------------------
create or replace function public.resident_weekly_requests(
  _user_id    uuid,
  _service_id uuid,
  _week_start date default date_trunc('week', (now() at time zone 'Asia/Manila'))::date
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.service_requests
  where user_id    = _user_id
    and service_id = _service_id
    and created_at >= (_week_start at time zone 'Asia/Manila')
    and created_at <  ((_week_start + 7) at time zone 'Asia/Manila')
    and status not in ('cancelled', 'rejected');
$$;

grant execute on function public.resident_weekly_requests(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS: allow residents to read their own pickup_date and certificate_path
--    (existing resident read-own policy already covers this — no new policy needed)
--    Allow admins to update pickup_date and certificate_path.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 7. Storage bucket for certificates (private, admin-generated PDFs)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "certificates: resident reads own" on storage.objects;
create policy "certificates: resident reads own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'certificates'
    and exists (
      select 1 from public.service_requests sr
      where sr.certificate_path = storage.objects.name
        and sr.user_id = auth.uid()
    )
  );

drop policy if exists "certificates: admin manages" on storage.objects;
create policy "certificates: admin manages" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'certificates'
    and public.has_role(auth.uid(), 'admin')
  )
  with check (
    bucket_id = 'certificates'
    and public.has_role(auth.uid(), 'admin')
  );

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
