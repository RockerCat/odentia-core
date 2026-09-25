"use client";

import { useState, type ReactNode } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { useToast } from "@/components/toast";
import { notifyIdentityChanged } from "@/features/session/identity-events";
import { removeMyAvatar, uploadMyAvatar } from "./clinic-media-actions";
import { validateClinicImage } from "./clinic-media-data";
import { ImageDropZone } from "./image-drop-zone";

// "Mi foto" — the signed-in user's OWN profile photo (profiles.avatar_url,
// one per user), for every role: Mi perfil profesional, the Admin/
// Assistant "Mi perfil" modals and the Patient Portal's Mi perfil. Same
// photo her clinic's admin can set from Equipo, and the one every header/
// team surface shows. Always acts on the session's own user
// (set_my_avatar) — no user id is passed in.
export function ProfilePhotoField({
  name,
  initials,
  initialAvatarUrl,
  sizeClassName = "size-20",
  textClassName = "text-lg",
  layout = "stack",
  onChange,
  children,
}: {
  name: string;
  initials: string;
  initialAvatarUrl: string | null;
  sizeClassName?: string;
  textClassName?: string;
  layout?: "stack" | "row";
  onChange?: (avatarUrl: string | null) => void;
  // Optional identity lines shown above the actions (e.g. name/email).
  children?: ReactNode;
}) {
  const { showToast } = useToast();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (next: string | null, message: string) => {
    setAvatarUrl(next);
    onChange?.(next);
    notifyIdentityChanged();
    showToast(message);
  };

  const handleFiles = async (files: File[]) => {
    const file = files[0];
    if (!file || busy) return;
    const invalid = validateClinicImage(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy("upload");
    const outcome = await uploadMyAvatar(file);
    setBusy(null);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    apply(outcome.value, "Foto actualizada");
  };

  const handleRemove = async () => {
    if (busy) return;
    setError(null);
    setBusy("remove");
    const outcome = await removeMyAvatar();
    setBusy(null);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    apply(null, "Foto eliminada");
  };

  const stack = layout === "stack";

  return (
    <ImageDropZone
      disabled={busy !== null}
      onFiles={(files) => void handleFiles(files)}
      className={`flex gap-4 rounded-xl ${stack ? "flex-col items-center text-center" : "items-center"}`}
    >
      {(open) => (
        <>
          <UserAvatar name={name} initials={initials} avatar_url={avatarUrl ?? undefined} sizeClassName={sizeClassName} textClassName={textClassName} />
          <div className={`flex min-w-0 flex-col gap-1.5 ${stack ? "items-center" : ""}`}>
            {children}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={open}
                disabled={busy !== null}
                className="min-h-10 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-50"
              >
                {busy === "upload" ? "Subiendo…" : avatarUrl ? "Cambiar foto" : "Subir foto"}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={busy !== null}
                  className="min-h-10 px-2 text-xs font-medium text-danger/80 hover:text-danger disabled:opacity-50"
                >
                  {busy === "remove" ? "Quitando…" : "Quitar foto"}
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">JPG, PNG o WebP · máx. 5 MB</p>
            {error && (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </ImageDropZone>
  );
}
