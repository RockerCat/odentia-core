import { createHash } from "node:crypto";

// RIPS #5B — content fingerprint for pilot traceability (this task's own
// Section 5/18). Deliberately the ONLY thing hashed is the exact UTF-8
// string a caller is about to hand back for download — never the
// transaction object re-stringified separately, since that would risk the
// logged hash silently diverging from the bytes the odontóloga actually
// uploads to the MUV (the whole point of this fingerprint).
export function computeRipsExportContentHash(serializedJson: string): string {
  return createHash("sha256").update(serializedJson, "utf8").digest("hex");
}
