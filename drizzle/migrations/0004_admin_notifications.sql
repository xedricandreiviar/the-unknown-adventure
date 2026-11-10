-- Tell every admin when something new arrives: a service request, a problem report,
-- or a new resident account. Each admin gets their own notification row, so each one
-- can open it and mark it as read on their own.
--
-- The triggers never block the resident: if writing the notification fails for any
-- reason, the request / report / sign-up still goes through.

create or replace function public.notify_admins(_title text, _body text, _link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, body, link)
  select ur.user_id, _title, _body, _link
  from public.user_roles ur
  where ur.role = 'admin';
exception when others then
  null;
end;
$$;

-- Only the triggers below may call it; nobody can call it from the browser.
revoke all on function public.notify_admins(text, text, text) from public, anon, authenticated;

create or replace function public.notify_admins_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_name text;
  resident text;
begin
  select name into service_name from public.services where id = new.service_id;
  select nullif(trim(concat_ws(' ', first_name, last_name)), '') into resident
    from public.profiles where id = new.user_id;
  perform public.notify_admins(
    'New request: ' || coalesce(service_name, 'Service'),
    coalesce(resident, 'A resident') || ' filed a request for ' || coalesce(service_name, 'a service')
      || ' (reference ' || new.code || '). It is waiting to be added to the queue.',
    '/admin/requests'
  );
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_admins_new_problem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resident text;
begin
  select nullif(trim(concat_ws(' ', first_name, last_name)), '') into resident
    from public.profiles where id = new.user_id;
  perform public.notify_admins(
    'New problem report: ' || new.category,
    coalesce(resident, 'A resident') || ' reported a problem at '
      || concat_ws(', ', nullif(new.street, ''), nullif(new.purok, '')) || ': ' || left(new.description, 200),
    '/admin/problems'
  );
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_admins_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
begin
  who := coalesce(nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''), new.email);
  perform public.notify_admins(
    'New account to review',
    who || ' registered and is waiting for approval.',
    '/admin/accounts'
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_admins_new_request on public.service_requests;
create trigger notify_admins_new_request
  after insert on public.service_requests
  for each row execute function public.notify_admins_new_request();

drop trigger if exists notify_admins_new_problem on public.problem_reports;
create trigger notify_admins_new_problem
  after insert on public.problem_reports
  for each row execute function public.notify_admins_new_problem();

drop trigger if exists notify_admins_new_account on public.profiles;
create trigger notify_admins_new_account
  after insert on public.profiles
  for each row execute function public.notify_admins_new_account();
