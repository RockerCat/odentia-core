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
  { id: "1", time: "8:00 AM", patientName: "María Gómez", initials: "MG", type: "Dental cleaning", status: "confirmed" },
  { id: "2", time: "9:00 AM", patientName: "Carlos Rodríguez", initials: "CR", type: "General checkup", status: "completed" },
  { id: "3", time: "9:30 AM", patientName: "Laura Martínez", initials: "LM", type: "Orthodontics consultation", status: "in-progress" },
  { id: "4", time: "10:15 AM", patientName: "Andrés Torres", initials: "AT", type: "Tooth extraction", status: "pending" },
  { id: "5", time: "11:00 AM", patientName: "Sofía Ramírez", initials: "SR", type: "Teeth whitening", status: "confirmed" },
  { id: "6", time: "11:45 AM", patientName: "Jorge Herrera", initials: "JH", type: "Root canal", status: "cancelled" },
  { id: "7", time: "2:00 PM", patientName: "Valentina Cruz", initials: "VC", type: "New patient consultation", status: "pending" },
  { id: "8", time: "3:30 PM", patientName: "Diego Morales", initials: "DM", type: "Orthodontic check-in", status: "confirmed" },
];

export type SummaryMetric = {
  label: string;
  value: string;
};

export const TODAY_SUMMARY: SummaryMetric[] = [
  { label: "Appointments today", value: "8" },
  { label: "Confirmed", value: "3" },
  { label: "Pending confirmation", value: "2" },
  { label: "New patients this month", value: "14" },
];

export type OperationalAlert = {
  id: string;
  message: string;
  tone: "warning" | "danger" | "info";
};

export const OPERATIONAL_ALERTS: OperationalAlert[] = [
  { id: "1", message: "2 appointments are waiting for confirmation.", tone: "warning" },
  { id: "2", message: "1 patient record is missing required information.", tone: "info" },
  { id: "3", message: "Your trial ends in 5 days — upgrade to keep full access.", tone: "danger" },
];
