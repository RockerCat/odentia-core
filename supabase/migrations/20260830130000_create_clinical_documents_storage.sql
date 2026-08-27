-- Odentia Core — clinical-documents Storage bucket
--
-- Private bucket for real patient clinical documents (radiografías/
-- imágenes, PDFs, documentos comunes) — unlike clinic-logos, this is
-- patient data, so it is never public: every read goes through a signed
-- URL, minted on demand and checked against the SELECT policy below (see
-- CLAUDE.md Security: "Never expose patient information... without
-- authorization").
--
-- file_size_limit (20MB) / allowed_mime_types are the real server-side
-- limit — the client's own validation before upload is UX, this is the
-- backstop (see task scope: "validar tanto en cliente como Storage").
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical-documents',
  'clinical-documents',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Path convention enforced by policy: <clinic_id>/<patient_id>/<object>,
-- e.g. <clinic_id>/<patient_id>/<uuid>-radiografia.jpg. Extracts just the
-- leading clinic_id segment (same split_part/cast-with-fallback shape as
-- clinic-logos' owns_clinic_logo_path) — a malformed/foreign leading
-- segment resolves to null, which the is_clinic_member/
-- is_active_clinical_professional checks below then cleanly deny rather
-- than raising.
create function public.clinical_document_path_clinic_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
begin
  begin
    v_clinic_id := split_part(object_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return v_clinic_id;
end;
$$;

-- READ (signed URL preview/download + upload's own existence checks):
-- any active member of the clinic the path belongs to — broader than
-- write, matches "Lectura: miembros autorizados de la clínica" from the
-- task scope. createSignedUrl() is itself gated by this policy, so a
-- signed URL can never be minted for a clinic the caller doesn't belong
-- to, and it always expires (see clinical-documents-actions.ts) — never a
-- permanent public URL.
create policy clinical_documents_select_member
  on storage.objects for select
  to authenticated
  using (bucket_id = 'clinical-documents' and public.is_clinic_member(public.clinical_document_path_clinic_id(name)));

-- WRITE (upload): only an active clinical professional (dentist or
-- clinic_admin with an active professional_profile — same
-- is_active_clinical_professional() reused everywhere else) for the
-- clinic the path belongs to. Assistant/plain admin cannot upload — see
-- task scope: the existing permission model (canEditClinicalData/
-- is_active_clinical_professional) has never granted assistants
-- document/clinical-write access in this project, so this reuses that
-- same boundary rather than defining a new one.
create policy clinical_documents_insert_clinical_professional
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'clinical-documents'
    and public.is_active_clinical_professional(public.clinical_document_path_clinic_id(name))
  );
-- No UPDATE/DELETE storage policy — no physical delete or in-place
-- replace in this first version (see task scope).
