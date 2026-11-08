-- Tracking for the 3K Incentive (PWD and senior citizens)
-- Run this AFTER 20261104000000_pwd_senior_registry.sql.
-- The incentive is stored as a normal row in public.benefit_releases with
-- benefit_type = '3K Incentive' (staff add it from /admin/registry).

drop function if exists public.track_registration(text);

create or replace function public.track_registration(_code text)
returns table (
  reference_code text,
  category public.registry_category,
  status public.registry_status,
  incentive_status public.release_status,
  incentive_amount numeric,
  incentive_period text,
  incentive_date date,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.reference_code,
    r.category,
    r.status,
    b.status,
    b.amount,
    b.period,
    b.release_date,
    greatest(r.updated_at, coalesce(b.created_at, r.updated_at))
  from public.registrants r
  left join lateral (
    select x.status, x.amount, x.period, x.release_date, x.created_at
    from public.benefit_releases x
    where x.registrant_id = r.id and x.benefit_type = '3K Incentive'
    order by x.created_at desc
    limit 1
  ) b on true
  where r.reference_code = upper(trim(_code))
  limit 1;
$$;

grant execute on function public.track_registration(text) to anon, authenticated;
