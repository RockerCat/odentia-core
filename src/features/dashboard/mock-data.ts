export type AppointmentStatus =
  | "confirmed"
  | "pending"
  | "in-progress"
  | "completed"
  | "cancelled";

export type Appointment = {
  id: string;
  time: string;
  patientName: string;
  initials: string;
  type: string;
  status: AppointmentStatus;
};

export const TODAY_APPOINTMENTS: Appointment[] = [
  { id: "1", time: "8:00 AM", patientName: "María Gómez", initials: "MG", type: "Limpieza dental", status: "confirmed" },
  { id: "2", time: "9:00 AM", patientName: "Carlos Rodríguez", initials: "CR", type: "Revisión general", status: "completed" },
  { id: "3", time: "9:30 AM", patientName: "Laura Martínez", initials: "LM", type: "Consulta de ortodoncia", status: "in-progress" },
  { id: "4", time: "10:15 AM", patientName: "Andrés Torres", initials: "AT", type: "Extracción dental", status: "pending" },
  { id: "5", time: "11:00 AM", patientName: "Sofía Ramírez", initials: "SR", type: "Blanqueamiento dental", status: "confirmed" },
  { id: "6", time: "11:45 AM", patientName: "Jorge Herrera", initials: "JH", type: "Endodoncia", status: "cancelled" },
  { id: "7", time: "2:00 PM", patientName: "Valentina Cruz", initials: "VC", type: "Consulta de paciente nuevo", status: "pending" },
  { id: "8", time: "3:30 PM", patientName: "Diego Morales", initials: "DM", type: "Control de ortodoncia", status: "confirmed" },
];

export type SummaryMetric = {
  label: string;
  value: string;
};

export const TODAY_SUMMARY: SummaryMetric[] = [
  { label: "Citas de hoy", value: "8" },
  { label: "Confirmadas", value: "3" },
  { label: "Pendientes", value: "2" },
  { label: "Pacientes nuevos este mes", value: "14" },
];

export type OperationalAlert = {
  id: string;
  message: string;
  tone: "warning" | "danger" | "info";
};

export const OPERATIONAL_ALERTS: OperationalAlert[] = [
  { id: "1", message: "2 citas están esperando confirmación.", tone: "warning" },
  { id: "2", message: "1 historia clínica requiere completarse.", tone: "info" },
  { id: "3", message: "Tu prueba gratuita termina en 5 días. Actualiza tu plan para mantener el acceso completo.", tone: "danger" },
];
