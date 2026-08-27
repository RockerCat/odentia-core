-- Odentia Core — Documentos clínicos reales (Historia Clínica → Documentos)
--
-- Metadata table for real uploaded files (radiografías/imágenes, PDFs,
-- documentos comunes). The demo's own DocumentosTab (clinical-record-screen.tsx)
-- is explicitly mock metadata only — "no real files, no upload/download,
-- per task scope" (its own comment) — so this table is new, not a
-- promotion of an existing mock shape, though `kind`/title below mirror
-- the demo's ClinicalDocumentKind ("radiografia" | "consentimiento" |
-- "fotografia" | "otro") and `label` fields exactly, since that category/
-- title concept already exists in the approved design.
--
-- The actual file bytes live in Storage (see the companion
-- clinical-documents-storage migration) — this table only ever stores a
-- storage_path pointer plus display metadata, never file content.
--
-- Same tenant-integrity pattern as the other clinical tables: composite FK
-- ties patient_id to its real clinic_id structurally.
create table public.patient_clinical_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null,
  title text,
  kind text not null default 'otro' check (kind in ('radiografia', 'consentimiento', 'fotografia', 'otro')),
  filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  -- Must match the object this row describes in the private
  -- clinical-documents bucket (see the storage migration) — enforced
  -- again, defense-in-depth, by insert_patient_clinical_document() below,
  -- which requires the path's leading segments to be
  -- <clinic_id>/<patient_id>/..., not just any authenticated upload.
  storage_path text not null unique,
  -- Who uploaded it — always auth.uid() as resolved server-side by
  -- insert_patient_clinical_document() below, never a client-supplied value.
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint patient_clinical_documents_patient_clinic_fk
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade
);

create index patient_clinical_documents_clinic_id_idx on public.patient_clinical_documents (clinic_id);
create index patient_clinical_documents_patient_id_idx on public.patient_clinical_documents (patient_id);

alter table public.patient_clinical_documents enable row level security;

-- READ: any active clinic member — same shape as the other clinical
-- tables' _select_member policies.
create policy patient_clinical_documents_select_member
  on public.patient_clinical_documents for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
-- No INSERT/UPDATE/DELETE policy at all, deliberately — same reasoning as
-- the other clinical tables. No DELETE RPC either (see task scope: no
-- physical delete in this first version). No UPDATE RPC — nothing in this
-- task's scope calls for editing a document's metadata after upload.
grant select on public.patient_clinical_documents to authenticated;

-- Register one uploaded document's metadata, AFTER the file itself has
-- already landed in Storage (the client uploads to Storage first, under
-- its own RLS policies — see the storage migration — then calls this to
-- record it). Resolves the patient's REAL clinic_id server-side, checks
-- is_active_clinical_professional() (reused as-is from the
-- patient_medical_histories migration), then validates p_storage_path
-- actually starts with "<clinic_id>/<patient_id>/" before inserting — a
-- metadata row can never claim a storage object that lives under a
-- different clinic or patient's folder. uploaded_by is always auth.uid().
create function public.insert_patient_clinical_document(
  p_patient_id uuid,
  p_storage_path text,
  p_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_kind text,
  p_title text
)
returns public.patient_clinical_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.patient_clinical_documents;
begin
  select clinic_id into v_clinic_id from public.patients where id = p_patient_id;
  if v_clinic_id is null then
    raise exception 'patient not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  if p_storage_path is null or p_storage_path !~ ('^' || v_clinic_id::text || '/' || p_patient_id::text || '/') then
    raise exception 'storage_path does not match clinic/patient';
  end if;

  insert into public.patient_clinical_documents (
    clinic_id, patient_id, title, kind, filename, mime_type, file_size, storage_path, uploaded_by
  )
  values (
    v_clinic_id, p_patient_id, p_title, coalesce(p_kind, 'otro'), p_filename, p_mime_type, p_file_size, p_storage_path, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.insert_patient_clinical_document(uuid, text, text, text, bigint, text, text) from public;
grant execute on function public.insert_patient_clinical_document(uuid, text, text, text, bigint, text, text) to authenticated;
