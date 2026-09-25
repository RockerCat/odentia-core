"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { removeMemberPhoto, uploadMemberPhoto, type MemberPhotoTarget } from "./clinic-media-actions";
import { CLINIC_IMAGE_ACCEPTED_TYPES } from "./clinic-media-data";

// Equipo row action (every member): the photo patients see under "Nuestro
// equipo" and everywhere else the person's avatar shows. Written via
// set_professional_photo() / set_clinic_member_photo() — clinic_admin of
// that member's own clinic only (see uploadMemberPhoto).
export function MemberPhotoControls({
  clinicId,
  target,
  hasPhoto,
  onChange,
}: {
  clinicId: string;
  target: MemberPhotoTarget;
  hasPhoto: boolean;
  onChange: (avatarUrl: string | null) => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    setBusy("upload");
    const outcome = await uploadMemberPhoto(clinicId, target, file);
    setBusy(null);
    if (inputRef.current) inputRef.current.value = "";
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    onChange(outcome.value);
    showToast("Foto actualizada");
  };

  const handleRemove = async () => {
    if (busy) return;
    setError(null);
    setBusy("remove");
    const outcome = await removeMemberPhoto(clinicId, target);
    setBusy(null);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    onChange(null);
    showToast("Foto eliminada");
  };

  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50"
        >
          {busy === "upload" ? "Subiendo…" : hasPhoto ? "Cambiar foto" : "Subir foto"}
        </button>
        {hasPhoto && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy !== null}
            className="text-xs font-medium text-danger/80 hover:text-danger disabled:opacity-50"
          >
            {busy === "remove" ? "Quitando…" : "Quitar foto"}
          </button>
        )}
      </span>
      {error && <span className="text-[11px] text-danger">{error}</span>}
      <input
        ref={inputRef}
        type="file"
        accept={CLINIC_IMAGE_ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </span>
  );
}
