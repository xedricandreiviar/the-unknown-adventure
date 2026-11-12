-- Notifications for the PWD / Senior registry.
--   * Admins are told when a new application arrives.
--   * The resident is told when their application is approved or rejected,
--     and when a benefit release is scheduled or its status changes.
-- Like the other notification triggers, a failure here never blocks the application.

create or replace function public.notify_user(_user_id uuid, _title text, _body text, _link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, title, body, link)
  values (_user_id, _title, _body, _link);
exception when others then
  null;
end;
$$;

revoke all on function public.notify_user(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.notify_registry_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform public.notify_admins(
      'New ' || case new.category when 'pwd' then 'PWD' else 'senior citizen' end || ' application',
      new.full_name || ' applied (reference ' || new.reference_code || '). Open the registry to verify the documents.',
      '/admin/registry'
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_registry_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.user_id is not null then
    if new.status = 'approved' then
      perform public.notify_user(
        new.user_id,
        'Your registry application was approved',
        'Your application (reference ' || new.reference_code || ') is approved. You are now in the barangay registry.',
        '/registry'
      );
    elsif new.status = 'rejected' then
      perform public.notify_user(
        new.user_id,
        'Your registry application was not approved',
        'Your application (reference ' || new.reference_code || ') was rejected.'
          || coalesce(' Reason: ' || new.rejection_reason, ''),
        '/registry'
      );
    end if;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_registry_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id from public.registrants where id = new.registrant_id;
  if owner_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform public.notify_user(
      owner_id,
      'Benefit release scheduled',
      new.benefit_type || ' (' || new.benefit_year || ') is scheduled'
        || coalesce(' for ' || to_char(new.release_date, 'Mon DD, YYYY'), '') || '.',
      '/registry'
    );
  elsif new.status is distinct from old.status then
    perform public.notify_user(
      owner_id,
      'Benefit release updated',
      new.benefit_type || ' (' || new.benefit_year || ') is now ' || replace(new.status::text, '_', ' ') || '.',
      '/registry'
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_registry_new_application on public.registrants;
create trigger notify_registry_new_application
  after insert on public.registrants
  for each row execute function public.notify_registry_new_application();

drop trigger if exists notify_registry_status_change on public.registrants;
create trigger notify_registry_status_change
  after update on public.registrants
  for each row execute function public.notify_registry_status_change();

drop trigger if exists notify_registry_release on public.registry_releases;
create trigger notify_registry_release
  after insert or update on public.registry_releases
  for each row execute function public.notify_registry_release();
