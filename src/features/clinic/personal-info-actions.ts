import { createClient } from "@/lib/supabase/client";

// "Editar información personal" — the signed-in user's OWN name/phone in
// profiles (the single source every surface reads). update_my_personal_info()
// (migration 20260925160000) always targets auth.uid() — no user id is sent,
// so there is nothing to tamper with. Email stays read-only (Auth login).

export type PersonalInfoInput = { firstName: string; lastName: string; phone: string };
export type PersonalInfo = { firstName: string; lastName: string; phone: string | null };

const PHONE_PATTERN = /^\+?[0-9 ()-]{7,30}$/;

// Mirrors the RPC's own checks so the modal can say what's wrong before
// saving; the RPC re-validates regardless.
export function validatePersonalInfo(input: PersonalInfoInput): { value: PersonalInfo } | { error: string } {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = input.phone.trim();
  if (!firstName || !lastName) return { error: "Escribe tu nombre y tu apellido." };
  if (firstName.length > 80 || lastName.length > 80) return { error: "El nombre es demasiado largo." };
  if (phone && !PHONE_PATTERN.test(phone)) return { error: "Revisa el teléfono: solo números, espacios, +, ( ) o -." };
  return { value: { firstName, lastName, phone: phone || null } };
}

export async function updateMyPersonalInfo(input: PersonalInfoInput): Promise<{ status: "ok"; value: PersonalInfo } | { status: "error"; message: string }> {
  const checked = validatePersonalInfo(input);
  if ("error" in checked) return { status: "error", message: checked.error };
  const { firstName, lastName, phone } = checked.value;
  const { error } = await createClient().rpc("update_my_personal_info", { p_first_name: firstName, p_last_name: lastName, p_phone: phone });
  if (error) return { status: "error", message: "No pudimos guardar tus datos. Intenta de nuevo." };
  return { status: "ok", value: checked.value };
}
