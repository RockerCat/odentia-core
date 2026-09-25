"use client";

import { useId, useState, type DragEvent, type ReactNode } from "react";
import { CLINIC_IMAGE_ACCEPTED_TYPES } from "./clinic-media-data";

// Clinic media upload surface ("Foto de portada", "Fotos de la clínica"):
// the traditional file picker (`open`, handed to children — the one
// mechanism that works everywhere, incl. mobile) plus drag & drop of files
// from the computer as a desktop enhancement. Validation is the caller's
// (validateClinicImage/planGalleryUploads) — this only collects files.
export function ImageDropZone({
  onFiles,
  multiple = false,
  disabled = false,
  className = "",
  children,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  children: (open: () => void) => ReactNode;
}) {
  const inputId = useId();
  // Counter, not a boolean: dragenter/dragleave also fire for every child.
  const [dragDepth, setDragDepth] = useState(0);
  const dragging = dragDepth > 0 && !disabled;

  const openPicker = () => (document.getElementById(inputId) as HTMLInputElement | null)?.click();
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragDepth((d) => d + 1);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        setDragDepth((d) => Math.max(0, d - 1));
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragDepth(0);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={`${className} transition-colors ${dragging ? "border-primary bg-primary/5 ring-2 ring-primary/30" : ""}`}
    >
      {children(openPicker)}
      <input
        id={inputId}
        type="file"
        accept={CLINIC_IMAGE_ACCEPTED_TYPES.join(",")}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </div>
  );
}
