-- Availability lookup used by the booking page: returns 'open' | 'mine' | 'taken' | 'blocked'
-- for one date+slot, without exposing other residents' personal data.
create or replace function public.court_slot_status(p_date date, p_slot text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.court_blocks b
      where b.block_date = p_date and (b.slot = p_slot or b.slot is null)
    ) then 'blocked'
    when exists (
      select 1 from public.court_reservations r
      where r.res_date = p_date and r.slot = p_slot and r.status in ('pending','approved')
    ) then
      case when exists (
        select 1 from public.court_reservations r2
        where r2.res_date = p_date and r2.slot = p_slot
          and r2.status in ('pending','approved') and r2.user_id = auth.uid()
      ) then 'mine' else 'taken' end
    else 'open'
  end
$$;

grant execute on function public.court_slot_status(date, text) to authenticated;
