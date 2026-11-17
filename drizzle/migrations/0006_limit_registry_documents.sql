-- At most two files per document requirement, for the PWD / Senior registry.
-- Rejected files do not count, so a rejected file can be replaced.
-- For seniors, "Proof of age" accepts a birth certificate or a valid ID, and the two
-- share one limit. Files already uploaded are left alone; only new uploads are checked.

create or replace function public.registrant_documents_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  registrant_category text;
  existing integer;
begin
  select category::text into registrant_category from public.registrants where id = new.registrant_id;

  select count(*) into existing
  from public.registrant_documents d
  where d.registrant_id = new.registrant_id
    and d.verification_status <> 'rejected'
    and (
      d.doc_type = new.doc_type
      or (
        registrant_category = 'senior'
        and d.doc_type in ('birth_certificate', 'valid_id')
        and new.doc_type in ('birth_certificate', 'valid_id')
      )
    );

  if existing >= 2 then
    raise exception 'This requirement already has 2 files. Remove or replace a rejected one first.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists registrant_documents_limit on public.registrant_documents;
create trigger registrant_documents_limit
  before insert on public.registrant_documents
  for each row execute function public.registrant_documents_limit();
