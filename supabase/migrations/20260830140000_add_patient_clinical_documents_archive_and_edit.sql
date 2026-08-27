-- Odentia Core — Documentos clínicos: archivado lógico + edición de metadata
--
-- Logical archive only — never a physical delete (see task scope: "NO
-- eliminar físicamente documentos clínicos" / "El archivo debe permanecer
-- en Storage"). archived_at/archived_by follow the exact same
-- "nullable timestamp + who did it" shape already used by updated_by/
-- recorded_by/attended_by elsewhere in this schema — archived_at null
-- means active, non-null means archived, no separate boolean needed.
alter table public.patient_clinical_documents
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

-- Speeds up the Activos/Archivados default-view filter (see documentos-tab.tsx).
create index patient_clinical_documents_archived_at_idx on public.patient_clinical_documents (archived_at);

-- Edit metadata only (título/categoría) — never the file itself (see task
-- scope: "No modificar/reemplazar el archivo en esta tarea"), so this RPC
-- never touches filename/mime_type/file_size/storage_path. No
-- description/observación field exists in the model yet, so none is added
-- here either (see task scope: "si el modelo ya la soporta" — it doesn't).
-- Resolves clinic_id from the document row itself (never trusts a
-- client-supplied clinic_id) and reuses is_active_clinical_professional()
-- — same authorization boundary as every other clinical write in this
-- schema.
create function public.update_patient_clinical_document(
  p_document_id uuid,
  p_title text,
  p_kind text
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
  select clinic_id into v_clinic_id from public.patient_clinical_documents where id = p_document_id;
  if v_clinic_id is null then
    raise exception 'document not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  update public.patient_clinical_documents
  set title = p_title, kind = coalesce(p_kind, kind)
  where id = p_document_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.update_patient_clinical_document(uuid, text, text) from public;
grant execute on function public.update_patient_clinical_document(uuid, text, text) to authenticated;

-- Logical archive. Same authorization boundary as above. Idempotent by
-- construction (re-archiving just re-sets archived_at/archived_by to the
-- latest action) — no separate "already archived" error, since nothing in
-- this task's scope calls for unarchiving yet.
create function public.archive_patient_clinical_document(p_document_id uuid)
returns public.patient_clinical_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_result public.patient_clinical_documents;
begin
  select clinic_id into v_clinic_id from public.patient_clinical_documents where id = p_document_id;
  if v_clinic_id is null then
    raise exception 'document not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  update public.patient_clinical_documents
  set archived_at = now(), archived_by = auth.uid()
  where id = p_document_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.archive_patient_clinical_document(uuid) from public;
grant execute on function public.archive_patient_clinical_document(uuid) to authenticated;
