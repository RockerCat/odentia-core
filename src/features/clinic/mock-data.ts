import { CURRENT_ASSISTANT } from "@/lib/current-user";
import { DENTISTS, ROOMS, type Dentist } from "@/features/dashboard/mock-data";

export type TeamStatus = "active" | "inactive";

// Extends the shared, cross-app `Dentist` (Agenda/Pacientes/Reportes all
// read that same type) with the fields this screen's Equipo section needs
// but nothing else does — email/phone/status here are local-only mock
// state (see ClinicSettingsScreen), never written back onto the shared
// DENTISTS array. Same "seed from real identities, mutate a local copy"
// approach already used by PatientsScreen/ReportsScreen for their own
// mock CRUD.
export type TeamDentist = Dentist & {
  email: string;
  phone: string;
  status: TeamStatus;
};

const DENTIST_CONTACT_MOCK: Record<string, { email: string; phone: string }> = {
  d1: { email: "camila.vargas@sonrisaperfecta.co", phone: "+57 310 555 0101" },
  d2: { email: "julian.restrepo@sonrisaperfecta.co", phone: "+57 310 555 0102" },
  d3: { email: "paula.escobar@sonrisaperfecta.co", phone: "+57 310 555 0103" },
};

export const TEAM_DENTISTS: TeamDentist[] = DENTISTS.map((dentist) => ({
  ...dentist,
  ...DENTIST_CONTACT_MOCK[dentist.id],
  status: "active",
}));

// An Assistant is never a clinical professional (see CLAUDE.md Domain
// Model) — no `specialty` field, unlike TeamDentist above.
export type TeamAssistant = {
  id: string;
  name: string;
  initials: string;
  avatar_url?: string;
  email: string;
  phone: string;
  status: TeamStatus;
};

// The first entry mirrors CURRENT_ASSISTANT (the one assistant the dev role
// switcher actually logs in as) so the roster stays recognizable across the
// app instead of inventing an unrelated name for the same person.
export const TEAM_ASSISTANTS: TeamAssistant[] = [
  {
    id: "a1",
    name: CURRENT_ASSISTANT.name,
    initials: CURRENT_ASSISTANT.initials,
    avatar_url: CURRENT_ASSISTANT.avatar_url,
    email: CURRENT_ASSISTANT.email,
    phone: CURRENT_ASSISTANT.phone,
    status: "active",
  },
  {
    id: "a2",
    name: "Diego Salazar",
    initials: "DS",
    avatar_url: "https://randomuser.me/api/portraits/men/22.jpg",
    email: "diego.salazar@sonrisaperfecta.co",
    phone: "+57 310 555 0201",
    status: "active",
  },
];

export type ClinicRoom = { id: string; name: string; status: TeamStatus };

// Seeded from the same names the rest of the app already shows (Agenda's
// room picker, appointment detail) — see ROOMS in dashboard/mock-data.ts —
// but kept as its own richer local list (with id/status) rather than
// changing ROOMS's shape, which several other screens depend on as a plain
// string[] (see task scope: no changes outside this screen).
export const CLINIC_ROOMS_MOCK: ClinicRoom[] = ROOMS.map((name, index) => ({
  id: `room-${index + 1}`,
  name,
  status: "active",
}));

export type ClinicInfo = {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
};

// The clinic's own contact info — distinct from CURRENT_USER's
// email/phone, which are the Admin's personal identity, not the clinic
// entity's (see CLAUDE.md Domain Model: Clinic vs. the person who runs it).
export const CLINIC_INFO_MOCK: ClinicInfo = {
  phone: "+57 601 555 0134",
  whatsapp: "+57 300 555 0134",
  email: "contacto@sonrisaperfecta.co",
  address: "Calle 93 #11-27, Local 2",
  city: "Bogotá",
};
