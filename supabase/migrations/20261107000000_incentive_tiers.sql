-- Incentive tiers: PWD (birthday, July, December) and Senior (birthday, by age tier)
-- Run this AFTER 20261104000000_pwd_senior_registry.sql and 20261106000000_incentive_tracking.sql.
--
-- Benefit types stored in public.benefit_releases.benefit_type:
--   'PWD Birthday Gift'                      (1,000, once a year)
--   'PWD Special Needs Assistance (July)'    (1,000)
--   'PWD Special Needs Assistance (December)'(1,000)
--   'Senior Birthday Cash Gift'              (3,000 / 4,000 / 5,000 / 10,000 / 100,000 by age)
-- Each registrant can have each type once per calendar year (benefit_year).

alter table public.benefit_releases add column if not exists benefit_year integer;

update public.benefit_releases
   set benefit_type = 'Senior Birthday Cash Gift'
 where benefit_type = '3K Incentive';

update public.benefit_releases
   set benefit_year = extract(year from created_at)::integer
 where benefit_year is null;

alter table public.benefit_releases
  alter column benefit_year set not null,
  alter column benefit_year set default (extract(year from (now() at time zone 'Asia/Manila'))::integer);

create unique index if not exists benefit_releases_unique_per_year
  on public.benefit_releases (registrant_id, benefit_type, benefit_year);

-- Rules: registrant must be approved; PWD benefits only for PWD, senior benefits only for seniors
create or replace function public.benefit_releases_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cat public.registry_category;
begin
  select category into cat
    from public.registrants
   where id = new.registrant_id and status = 'approved';

  if cat is null then
    raise exception 'Benefits can only be recorded for approved registrants.';
  end if;
  if new.benefit_type like 'PWD %' and cat <> 'pwd' then
    raise exception 'This benefit is only for PWD registrants.';
  end if;
  if new.benefit_type like 'Senior %' and cat <> 'senior' then
    raise exception 'This benefit is only for senior citizen registrants.';
  end if;
  return new;
end;
$$;

-- Senior birthday gift amount by the age the person turns this year
create or replace function public.senior_gift_amount(_age integer)
returns numeric
language sql
immutable
as $$
  select case
    when _age >= 100 then 100000
    when _age >= 90 then 10000
    when _age >= 80 then 5000
    when _age >= 70 then 4000
    when _age >= 60 then 3000
    else null
  end::numeric;
$$;

-- Public lookup by reference code: registration status + this year's incentives.
-- Returns no personal data (no name, address, or birth date).
drop function if exists public.track_registration(text);
drop function if exists public.track_registration(text, integer);

create or replace function public.track_registration(_code text, _year integer default null)
returns table (
  reference_code text,
  category public.registry_category,
  status public.registry_status,
  benefit_year integer,
  senior_gift_amount numeric,
  incentives jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with y as (
    select coalesce(_year, extract(year from (now() at time zone 'Asia/Manila'))::integer) as yr
  )
  select
    r.reference_code,
    r.category,
    r.status,
    y.yr,
    case
      when r.category = 'senior'
        then public.senior_gift_amount(y.yr - extract(year from r.birth_date)::integer)
    end,
    coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'type', b.benefit_type,
                  'status', b.status,
                  'amount', b.amount,
                  'date', b.release_date
                )
                order by b.created_at
              )
         from public.benefit_releases b
        where b.registrant_id = r.id and b.benefit_year = y.yr),
      '[]'::jsonb
    ),
    greatest(
      r.updated_at,
      coalesce((select max(b2.created_at) from public.benefit_releases b2 where b2.registrant_id = r.id), r.updated_at)
    )
  from public.registrants r, y
  where r.reference_code = upper(trim(_code))
  limit 1;
$$;

grant execute on function public.track_registration(text, integer) to anon, authenticated;
grant execute on function public.senior_gift_amount(integer) to anon, authenticated;
