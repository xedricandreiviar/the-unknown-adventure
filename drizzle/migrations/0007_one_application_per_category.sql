-- A resident account may have only one pending or approved application per registry
-- (senior citizen and PWD are separate registries, so one of each is allowed).
-- A rejected application does not count, so the resident can apply again.
-- Only new online applications are checked; existing rows are left alone.

create or replace function public.registrants_one_per_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and new.status in ('pending', 'approved') then
    if exists (
      select 1
      from public.registrants r
      where r.user_id = new.user_id
        and r.category = new.category
        and r.status in ('pending', 'approved')
    ) then
      raise exception 'You already have a pending or approved % application.',
        case new.category::text when 'pwd' then 'PWD' else 'senior citizen' end
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists registrants_one_per_category on public.registrants;
create trigger registrants_one_per_category
  before insert on public.registrants
  for each row execute function public.registrants_one_per_category();
