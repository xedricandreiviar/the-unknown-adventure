-- Scheduled announcements.
-- An announcement can have a "show from" time and a "show until" time. The public site
-- only shows it between those two times, so an event notice can go up on its own and come
-- down on its own. Nothing has to run on a timer: the database checks the time on every read.

alter table public.announcements
  add column if not exists show_from timestamptz,
  add column if not exists show_until timestamptz;

alter table public.announcements drop constraint if exists announcements_schedule_check;
alter table public.announcements
  add constraint announcements_schedule_check
  check (show_until is null or show_from is null or show_until > show_from);

drop policy if exists "Announcements: public read published" on public.announcements;
create policy "Announcements: public read published" on public.announcements for select to anon, authenticated
  using (
    (
      published = true
      and (show_from is null or show_from <= now())
      and (show_until is null or show_until > now())
    )
    or public.is_admin()
  );
