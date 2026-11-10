-- Verification and cross-checking for PWD / Senior registrations
-- Run this AFTER the three earlier migrations (20261104, 20261106, 20261107).
--
-- Adds:
--   * document uploads (private storage bucket + registrant_documents table)
--   * a manual cross-check checklist and representative (proxy) details on registrants
--   * a rule that blocks approval until documents and cross-checks are verified
--   * a rule that blocks releasing a benefit until the physical ID was checked
--     (and, for representatives, the authorization letter + their ID are on file)
--   * duplicate ID-number protection
--   * an audit log of who did what

-- ---------------------------------------------------------------------------
-- 1. Registrant columns
-- ---------------------------------------------------------------------------
alter table public.registrants
  add column if not exists applicant_type text not null default 'self',
  add column if not exists rep_full_name text,
  add column if not exists rep_relationship text,
  add column if not exists rep_contact_number text,
  add column if not exists id_expiry date,
  add column if not exists chk_name_dob boolean not null default false,
  add column if not exists chk_residency boolean not null default false,
  add column if not exists chk_photo_match boolean not null default false,
  add column if not exists chk_disability boolean not null default false,
  add column if not exists chk_representative boolean not null default false;

do $$ begin
  alter table public.registrants
    add constraint registrants_applicant_type_chk check (applicant_type in ('self', 'representative'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.registrants
    add constraint registrants_rep_fields_chk check (
      applicant_type = 'self'
      or (coalesce(trim(rep_full_name), '') <> '' and coalesce(trim(rep_relationship), '') <> '')
    );
exception when duplicate_object then null; end $$;

-- The same PWD / OSCA ID number cannot be used twice (rejected records excluded)
create unique index if not exists registrants_unique_id_number
  on public.registrants (category, upper(trim(id_number)))
  where id_number is not null and trim(id_number) <> '' and status <> 'rejected';

-- ---------------------------------------------------------------------------
-- 2. Documents
-- ---------------------------------------------------------------------------
create table if not exists public.registrant_documents (
  id uuid primary key default gen_random_uuid(),
  registrant_id uuid not null references public.registrants (id) on delete cascade,
  doc_type text not null check (doc_type in (
    'valid_id', 'birth_certificate', 'residency_proof', 'id_photo',
    'disability_proof', 'authorization_letter', 'representative_id'
  )),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  note text
);

create index if not exists registrant_documents_registrant_idx
  on public.registrant_documents (registrant_id);

alter table public.registrant_documents enable row level security;

drop policy if exists "Read own or all documents" on public.registrant_documents;
create policy "Read own or all documents" on public.registrant_documents
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.registrants r
      where r.id = registrant_documents.registrant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "Owner uploads documents" on public.registrant_documents;
create policy "Owner uploads documents" on public.registrant_documents
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and verification_status = 'pending'
    and verified_by is null
    and exists (
      select 1 from public.registrants r
      where r.id = registrant_documents.registrant_id
        and r.user_id = auth.uid()
        and r.status = 'pending'
    )
  );

drop policy if exists "Admins manage documents" on public.registrant_documents;
create policy "Admins manage documents" on public.registrant_documents
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select, insert, update, delete on public.registrant_documents to authenticated;

-- Private storage bucket: JPG / PNG / PDF only, 5 MB max. Files live in <registrant_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registry-docs', 'registry-docs', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "registry-docs read" on storage.objects;
create policy "registry-docs read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'registry-docs'
    and (
      public.has_role(auth.uid(), 'admin')
      or exists (
        select 1 from public.registrants r
        where r.id::text = (storage.foldername(name))[1] and r.user_id = auth.uid()
      )
    )
  );

drop policy if exists "registry-docs upload" on storage.objects;
create policy "registry-docs upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'registry-docs'
    and (
      public.has_role(auth.uid(), 'admin')
      or exists (
        select 1 from public.registrants r
        where r.id::text = (storage.foldername(name))[1]
          and r.user_id = auth.uid()
          and r.status = 'pending'
      )
    )
  );

drop policy if exists "registry-docs admin delete" on storage.objects;
create policy "registry-docs admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'registry-docs' and public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Approval rules
-- ---------------------------------------------------------------------------
create or replace function public._has_verified_doc(_rid uuid, _types text[])
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.registrant_documents d
    where d.registrant_id = _rid
      and d.verification_status = 'verified'
      and d.doc_type = any (_types)
  );
$$;

-- Lists what is still missing before a registrant can be approved (empty = ready).
-- Keep in sync with requiredDocGroups() in src/lib/registry.ts (that one is only a guide).
create or replace function public.registrant_blockers(_registrant_id uuid)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  r public.registrants;
  b text[] := '{}';
begin
  select * into r from public.registrants where id = _registrant_id;
  if not found then
    return array['Registrant not found'];
  end if;

  if r.category = 'senior' then
    if not public._has_verified_doc(r.id, array['birth_certificate', 'valid_id']) then
      b := b || 'Verified proof of age (birth certificate or valid ID)';
    end if;
  else
    if not public._has_verified_doc(r.id, array['valid_id']) then
      b := b || 'Verified valid government ID';
    end if;
    if not public._has_verified_doc(r.id, array['disability_proof']) then
      b := b || 'Verified proof of disability';
    end if;
    if not r.chk_disability then
      b := b || 'Cross-check: disability certificate is valid and matches the disability type';
    end if;
    if r.id_expiry is not null and r.id_expiry < current_date then
      b := b || 'The PWD ID is expired';
    end if;
  end if;

  if not public._has_verified_doc(r.id, array['residency_proof']) then
    b := b || 'Verified proof of residence';
  end if;
  if not public._has_verified_doc(r.id, array['id_photo']) then
    b := b || 'Verified ID photo';
  end if;

  if not r.chk_name_dob then
    b := b || 'Cross-check: name and birth date match the documents';
  end if;
  if not r.chk_residency then
    b := b || 'Cross-check: address matches the proof of residence';
  end if;
  if not r.chk_photo_match then
    b := b || 'Cross-check: face matches the ID photo and IDs';
  end if;

  if r.applicant_type = 'representative' then
    if not public._has_verified_doc(r.id, array['authorization_letter']) then
      b := b || 'Verified authorization letter';
    end if;
    if not public._has_verified_doc(r.id, array['representative_id']) then
      b := b || 'Verified valid ID of the representative';
    end if;
    if not r.chk_representative then
      b := b || 'Cross-check: authorization letter is signed and the representative''s ID matches';
    end if;
  end if;

  return b;
end;
$$;

grant execute on function public.registrant_blockers(uuid) to authenticated;

create or replace function public.registrants_verify_before_approve()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  blockers text[];
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'New registrations must start as pending so they can be verified.';
    end if;
    return new;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    blockers := public.registrant_blockers(new.id);
    if coalesce(array_length(blockers, 1), 0) > 0 then
      raise exception 'Cannot approve yet. Still needed: %', array_to_string(blockers, '; ');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists registrants_verify_before_approve on public.registrants;
create trigger registrants_verify_before_approve
  before insert or update on public.registrants
  for each row execute function public.registrants_verify_before_approve();

-- ---------------------------------------------------------------------------
-- 4. Claim (release) rules
-- ---------------------------------------------------------------------------
alter table public.registry_releases
  add column if not exists claimed_by_type text,
  add column if not exists claimant_name text,
  add column if not exists claimant_relationship text,
  add column if not exists id_presented boolean not null default false,
  add column if not exists claimed_at timestamptz;

do $$ begin
  alter table public.registry_releases
    add constraint registry_releases_claimed_by_chk check (claimed_by_type in ('self', 'representative'));
exception when duplicate_object then null; end $$;

create or replace function public.registry_releases_claim_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  becoming_released boolean := false;
begin
  if new.status = 'released' then
    if tg_op = 'INSERT' then
      becoming_released := true;
    else
      becoming_released := old.status is distinct from 'released';
    end if;
  end if;

  if becoming_released then
    if not coalesce(new.id_presented, false) then
      raise exception 'Confirm that the physical ID was presented and checked before releasing.';
    end if;
    if new.claimed_by_type is null then
      raise exception 'Select who claimed the benefit (the beneficiary or a representative).';
    end if;
    if new.claimed_by_type = 'representative' then
      if coalesce(trim(new.claimant_name), '') = '' or coalesce(trim(new.claimant_relationship), '') = '' then
        raise exception 'Enter the representative''s name and relationship.';
      end if;
      if not public._has_verified_doc(new.registrant_id, array['authorization_letter'])
         or not public._has_verified_doc(new.registrant_id, array['representative_id']) then
        raise exception 'A representative needs a verified authorization letter and a verified valid ID on file.';
      end if;
    end if;
    new.claimed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists registry_releases_claim_check on public.registry_releases;
create trigger registry_releases_claim_check
  before insert or update on public.registry_releases
  for each row execute function public.registry_releases_claim_check();

-- ---------------------------------------------------------------------------
-- 5. Audit log (admins can read; written only by triggers)
-- ---------------------------------------------------------------------------
create table if not exists public.registry_audit (
  id uuid primary key default gen_random_uuid(),
  registrant_id uuid not null references public.registrants (id) on delete cascade,
  actor uuid,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists registry_audit_registrant_idx
  on public.registry_audit (registrant_id, created_at desc);

alter table public.registry_audit enable row level security;

drop policy if exists "Admins read audit" on public.registry_audit;
create policy "Admins read audit" on public.registry_audit
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

grant select on public.registry_audit to authenticated;

create or replace function public.audit_registrants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.registry_audit (registrant_id, actor, action, details)
    values (new.id, auth.uid(), 'Registered', new.source::text || ' · ' || new.applicant_type);
  elsif new.status is distinct from old.status then
    insert into public.registry_audit (registrant_id, actor, action, details)
    values (new.id, auth.uid(), 'Status: ' || old.status::text || ' → ' || new.status::text, new.rejection_reason);
  elsif (new.chk_name_dob, new.chk_residency, new.chk_photo_match, new.chk_disability, new.chk_representative)
        is distinct from
        (old.chk_name_dob, old.chk_residency, old.chk_photo_match, old.chk_disability, old.chk_representative) then
    insert into public.registry_audit (registrant_id, actor, action, details)
    values (new.id, auth.uid(), 'Cross-check updated', null);
  end if;
  return null;
end;
$$;

drop trigger if exists audit_registrants on public.registrants;
create trigger audit_registrants
  after insert or update on public.registrants
  for each row execute function public.audit_registrants();

create or replace function public.audit_registrant_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.registry_audit (registrant_id, actor, action, details)
    values (new.registrant_id, auth.uid(), 'Document uploaded', new.doc_type);
  elsif new.verification_status is distinct from old.verification_status then
    insert into public.registry_audit (registrant_id, actor, action, details)
    values (
      new.registrant_id, auth.uid(),
      'Document ' || new.verification_status,
      new.doc_type || coalesce(': ' || new.note, '')
    );
  end if;
  return null;
end;
$$;

drop trigger if exists audit_registrant_documents on public.registrant_documents;
create trigger audit_registrant_documents
  after insert or update on public.registrant_documents
  for each row execute function public.audit_registrant_documents();

create or replace function public.audit_registry_releases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.registry_audit (registrant_id, actor, action, details)
    values (new.registrant_id, auth.uid(), 'Benefit scheduled', new.benefit_type || ' ' || new.benefit_year::text);
  elsif new.status is distinct from old.status then
    insert into public.registry_audit (registrant_id, actor, action, details)
    values (
      new.registrant_id, auth.uid(),
      'Benefit ' || new.status::text,
      new.benefit_type || ' ' || new.benefit_year::text
        || case
             when new.status = 'released' and new.claimed_by_type = 'representative'
               then ' · claimed by representative ' || coalesce(new.claimant_name, '')
             when new.status = 'released' then ' · claimed by beneficiary'
             else ''
           end
    );
  end if;
  return null;
end;
$$;

drop trigger if exists audit_registry_releases on public.registry_releases;
create trigger audit_registry_releases
  after insert or update on public.registry_releases
  for each row execute function public.audit_registry_releases();
