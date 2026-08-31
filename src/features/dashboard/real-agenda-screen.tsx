"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MembershipRole } from "@/features/session/types";
import type { Patient } from "@/features/patients/data";
import { createClient } from "@/lib/supabase/client";
import { fetchAppointmentsForRange, type Appointment, type ClinicalProfessional } from "./appointments-data";
import { RealAppointmentsBoard } from "./real-appointments-board";
import { RealSummaryCards } from "./real-summary-cards";
import { getWeekDaysForOffset, getWeekLabelForOffset, getWeekRangeIso, todayDateKey } from "./real-week";
import { dateKeyOf } from "./real-format";

// Real /agenda screen — the single client-side owner of appointment DATA
// for this page. Fixes a real correctness gap the approved demo's own
// AppointmentsCard/SummaryCards had (each kept an independent local copy of
// `allAppointments`, so an edit made through one never showed up in the
// other — harmless with static mock data, a real bug with a real backend):
// here both children read/mutate ONE shared `appointmentsById` map via
// props, so any create/update from either surface is immediately visible
// everywhere. Week navigation also lives here (not inside the board) so a
// week the user has already browsed to can be fetched once and handed down.
export function RealAgendaScreen({
  clinicId,
  role,
  ownProfessionalProfileId,
  initialProfessionals,
  initialAppointments,
  initialPatients,
  treatmentOptions,
  roomOptions,
  canEditPatientData,
  clinicIdentityCard,
  marketplaceCard,
}: {
  clinicId: string;
  role: MembershipRole;
  ownProfessionalProfileId: string | null;
  initialProfessionals: ClinicalProfessional[];
  initialAppointments: Appointment[];
  initialPatients: Patient[];
  treatmentOptions: string[];
  roomOptions: string[];
  canEditPatientData: boolean;
  clinicIdentityCard: ReactNode;
  marketplaceCard: ReactNode;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(() => {
    const days = getWeekDaysForOffset(0);
    return days.find((d) => d.isToday)?.key ?? days[0]?.key ?? todayDateKey();
  });
  const [appointmentsById, setAppointmentsById] = useState<Record<string, Appointment>>(() => {
    const map: Record<string, Appointment> = {};
    for (const a of initialAppointments) map[a.id] = a;
    return map;
  });
  const [loadingWeek, setLoadingWeek] = useState(false);
  const fetchedOffsets = useRef<Set<number>>(new Set([0]));

  useEffect(() => {
    if (fetchedOffsets.current.has(weekOffset)) return;
    let cancelled = false;
    setLoadingWeek(true);
    (async () => {
      try {
        const supabase = createClient();
        const { startIso, endIsoExclusive } = getWeekRangeIso(weekOffset);
        const rows = await fetchAppointmentsForRange(supabase, clinicId, startIso, endIsoExclusive);
        if (cancelled) return;
        fetchedOffsets.current.add(weekOffset);
        setAppointmentsById((prev) => {
          const next = { ...prev };
          for (const row of rows) next[row.id] = row;
          return next;
        });
      } finally {
        if (!cancelled) setLoadingWeek(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekOffset, clinicId]);

  const applyUpdate = (updated: Appointment) => {
    setAppointmentsById((prev) => ({ ...prev, [updated.id]: updated }));
  };

  const applyCreate = (created: Appointment) => {
    setAppointmentsById((prev) => ({ ...prev, [created.id]: created }));
  };

  const weekDays = getWeekDaysForOffset(weekOffset);
  const weekLabel = getWeekLabelForOffset(weekOffset);
  const { startIso, endIsoExclusive } = getWeekRangeIso(weekOffset);
  const rangeStartMs = new Date(startIso).getTime();
  const rangeEndMs = new Date(endIsoExclusive).getTime();
  const allAppointments = Object.values(appointmentsById);
  // Numeric comparison, not raw string comparison — Postgres/PostgREST and
  // `Date.toISOString()` serialize the same instant with different (both
  // valid) ISO 8601 suffixes ("+00:00" vs ".000Z"), which do NOT always
  // sort correctly as plain strings.
  const weekAppointments = allAppointments.filter((a) => {
    const ms = new Date(a.startsAt).getTime();
    return ms >= rangeStartMs && ms < rangeEndMs;
  });
  const todayKey = todayDateKey();
  const todayAppointments = allAppointments.filter((a) => dateKeyOf(a.startsAt) === todayKey);

  const changeWeek = (nextOffset: number) => {
    const nextWeekDays = getWeekDaysForOffset(nextOffset);
    const previousIndex = weekDays.findIndex((day) => day.key === selectedDay);
    setWeekOffset(nextOffset);
    setSelectedDay(nextWeekDays[previousIndex >= 0 ? previousIndex : 0]?.key ?? nextWeekDays[0]?.key);
  };

  const goToToday = () => {
    setWeekOffset(0);
    const days = getWeekDaysForOffset(0);
    setSelectedDay(days.find((d) => d.isToday)?.key ?? days[0]?.key ?? todayKey);
  };

  return (
    <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <RealAppointmentsBoard
          clinicId={clinicId}
          role={role}
          ownProfessionalProfileId={ownProfessionalProfileId}
          professionals={initialProfessionals}
          weekDays={weekDays}
          weekLabel={weekLabel}
          weekOffset={weekOffset}
          onChangeWeek={changeWeek}
          onGoToday={goToToday}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          appointments={loadingWeek ? [] : weekAppointments}
          onAppointmentUpdated={applyUpdate}
          onAppointmentCreated={applyCreate}
          initialPatients={initialPatients}
          treatmentOptions={treatmentOptions}
          roomOptions={roomOptions}
          canEditPatientData={canEditPatientData}
        />
      </div>

      <div className="flex flex-col gap-7">
        {clinicIdentityCard}
        <RealSummaryCards
          role={role}
          ownProfessionalProfileId={ownProfessionalProfileId}
          todayAppointments={todayAppointments}
          professionals={initialProfessionals}
          treatmentOptions={treatmentOptions}
          roomOptions={roomOptions}
          onAppointmentUpdated={applyUpdate}
        />
        {marketplaceCard}
      </div>
    </div>
  );
}
