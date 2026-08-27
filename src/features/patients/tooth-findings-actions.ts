import type { FindingType, ToothSurface } from "@/features/dashboard/odontogram-teeth";
import { createClient } from "@/lib/supabase/client";
import { mapToothFindingRow, type ToothFindingRecord } from "./tooth-findings-data";

// The two sanctioned write paths — always through
// insert_patient_tooth_finding()/delete_patient_tooth_finding() (see the
// patient_tooth_findings migration), never a direct table INSERT/DELETE
// (there is no RLS policy for either, deliberately). Both RPCs resolve
// clinic_id/auth.uid() themselves server-side and re-check authorization
// (is_active_clinical_professional) — these client wrappers never send
// clinic_id or recorded_by, and never assume the UI's own
// canEditClinicalData() check is sufficient on its own.

export type InsertToothFindingInput = {
  patientId: string;
  toothFdi: number;
  findingType: FindingType;
  surfaces: ToothSurface[];
  note: string | null;
};

export type ToothFindingOutcome = { status: "ok"; finding: ToothFindingRecord } | { status: "error"; message: string };

export async function insertPatientToothFinding(input: InsertToothFindingInput): Promise<ToothFindingOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("insert_patient_tooth_finding", {
    p_patient_id: input.patientId,
    p_tooth_fdi: input.toothFdi,
    p_finding_type: input.findingType,
    p_surfaces: input.surfaces,
    p_note: input.note,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para editar el odontograma de este paciente." };
    }
    return { status: "error", message: "No pudimos guardar el hallazgo. Intenta de nuevo." };
  }

  return { status: "ok", finding: mapToothFindingRow(data) };
}

export type DeleteToothFindingOutcome = { status: "ok" } | { status: "error"; message: string };

export async function deletePatientToothFinding(findingId: string): Promise<DeleteToothFindingOutcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_patient_tooth_finding", { p_finding_id: findingId });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para editar el odontograma de este paciente." };
    }
    return { status: "error", message: "No pudimos eliminar el hallazgo. Intenta de nuevo." };
  }

  return { status: "ok" };
}
