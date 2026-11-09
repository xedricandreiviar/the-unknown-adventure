-- Normalize service_requests.
-- A request used to copy the resident's name, address and contact number into its
-- own columns. Those values already live on public.profiles, so keeping a second
-- copy means the two can drift apart. From now on a request only stores who filed
-- it (user_id), what they asked for (service_id) and its own details/status, and
-- the resident's information is read from their profile.
--
-- Safety: this refuses to run if requests already exist, so no data is lost.
-- If it stops, tell your developer before removing the check.

do $$
begin
  if exists (select 1 from public.service_requests) then
    raise exception 'service_requests already has rows. Copy or archive them before dropping the duplicated columns.';
  end if;
end $$;

alter table public.service_requests
  drop column if exists first_name,
  drop column if exists middle_name,
  drop column if exists last_name,
  drop column if exists street,
  drop column if exists purok,
  drop column if exists barangay,
  drop column if exists contact_number;
