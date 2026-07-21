import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import {
  AppHeader,
  Button,
  DayGrid,
  type DayItem,
  ErrorState,
  LoadingState,
  Screen,
  SlotGrid,
  Stepper,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { localizedName } from "@/utils/localizedName";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useDoctor } from "@/hooks/queries/useDoctors";
import { useAvailableSlots } from "@/hooks/queries/usePatient";
import { useBookingStore } from "@/stores/bookingStore";
import { BOOKING_WINDOW_DAYS } from "@medilink/shared/mobile";

const DOW = ["dowSun", "dowMon", "dowTue", "dowWed", "dowThu", "dowFri", "dowSat"] as const;
// BP-2: render exactly the booking window (today + N-1). Single source of truth.
const DAY_COUNT = BOOKING_WINDOW_DAYS;

function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1]?.[0] ?? "" : "")).toUpperCase();
}

/** Booking step 1 — Select Location & Time (PDF p20). */
export default function ScheduleScreen() {
  const { spacing, colors, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { doctorId } = useLocalSearchParams<{ doctorId: string }>();
  const id = String(doctorId ?? "");

  const doctor = useDoctor(id);
  const start = useBookingStore((s) => s.start);
  const setSchedule = useBookingStore((s) => s.setSchedule);

  // Five days from today; ids are ISO dates, labels are localized.
  const { days, dateLabels } = useMemo(() => {
    const items: DayItem[] = [];
    const labels: Record<string, string> = {};
    const base = new Date();
    for (let i = 0; i < DAY_COUNT; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const dow = t(`common.${DOW[d.getDay()]}` as Parameters<typeof t>[0]);
      const dom = num(String(d.getDate()));
      const month = t(`common.month${d.getMonth()}` as Parameters<typeof t>[0]);
      items.push({ id: key, top: dow, bottom: dom });
      labels[key] = `${dow} ${dom} ${month}`;
    }
    return { days: items, dateLabels: labels };
  }, [t, num]);

  // The booking clinic is the doctor's OWN facility. Previously this list came from a
  // hardcoded mock (`useMapClinics`) unrelated to the selected doctor, so the clinic
  // shown never matched the facilityId actually booked. Sourcing it from the doctor makes
  // the displayed clinic and the booked facility a single source of truth (fixes the
  // "wrong clinic" bug). Kept as a (single-item) selectable list to preserve the UI and
  // leave room for future per-branch selection.
  const clinicList = useMemo(() => {
    const d = doctor.data;
    if (!d?.facility_id) return [];
    return [
      {
        id: d.facility_id,
        name: d.facility,
        name_ar: d.facility_ar ?? null,
        name_ar_status: d.facility_ar_status ?? null,
      },
    ];
  }, [doctor.data]);

  const [clinicId, setClinicId] = useState<string | undefined>(undefined);
  const [dateId, setDateId] = useState<string>(days[0]?.id ?? "");
  const [slot, setSlot] = useState<string | undefined>(undefined);

  // Real availability for the selected day (refetches when the date changes).
  const slotsQuery = useAvailableSlots({ doctorId: id, date: dateId });
  const availableSlots = slotsQuery.data ?? [];

  const onSelectDate = (d: string) => {
    setDateId(d);
    setSlot(undefined); // a slot valid for one day may not exist on another
  };

  // Default the clinic selection to the nearest once data arrives.
  useEffect(() => {
    if (!clinicId && clinicList.length) setClinicId(clinicList[0]!.id);
  }, [clinicList, clinicId]);

  // Seed the booking draft with the doctor (preserved across steps for this doctor).
  useEffect(() => {
    const d = doctor.data;
    if (!d) return;
    // Capture the display name in the active locale (verified Arabic when RTL, else
    // English — F1 §1a). Initials stay from the English name for stability.
    start({
      doctorId: id,
      doctorName: localizedName(d.full_name, d.full_name_ar, d.full_name_ar_status, isRTL),
      specialty: d.specialty,
      facility: localizedName(d.facility, d.facility_ar, d.facility_ar_status, isRTL),
      initials: initialsOf(d.full_name),
      fee: d.fee_omr,
    });
  }, [doctor.data, id, start, isRTL]);

  const canContinue = !!clinicId && !!dateId && !!slot;

  const onContinue = () => {
    const clinic = clinicList.find((c) => c.id === clinicId);
    const picked = availableSlots.find((s) => s.label === slot);
    if (!clinic || !picked || !doctor.data) return;
    const meta = t("booking.inPerson");
    setSchedule({
      clinicId: clinic.id,
      clinicName: localizedName(clinic.name, clinic.name_ar, clinic.name_ar_status, isRTL),
      clinicMeta: meta,
      // clinic.id IS the doctor's facility_id (the clinic list is derived from the doctor),
      // so the displayed clinic and the booked facility are guaranteed consistent.
      facilityId: clinic.id,
      dateId,
      dateLabel: dateLabels[dateId] ?? "",
      slot: picked.label,
      slotStart: picked.start,
    });
    router.push(`/booking/${id}/review`);
  };

  if (doctor.isLoading) {
    return (
      <Screen padded><AppHeader title={t("booking.title")} showBack /><LoadingState /></Screen>
    );
  }
  if (doctor.isError || !doctor.data) {
    return (
      <Screen padded>
        <AppHeader title={t("booking.title")} showBack />
        <ErrorState message={t("doctor.loadError")} onRetry={() => doctor.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={<Button label={t("booking.continue")} disabled={!canContinue} onPress={onContinue} />}
    >
      <AppHeader title={t("booking.title")} showBack right={<Text variant="caption" color="textMuted">{t("booking.step", { current: num("1"), total: num("4") })}</Text>} />

      <Stepper current={1} total={4} />

      {/* Select clinic */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("booking.selectClinic")}</Text>
      {clinicList.map((c) => {
        const sel = c.id === clinicId;
        return (
          <Pressable
            key={c.id}
            onPress={() => setClinicId(c.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel }}
            style={[styles.clinic, { borderRadius: radii.lg, backgroundColor: colors.surface, borderColor: sel ? colors.primary : colors.border, borderWidth: sel ? 2 : 1, flexDirection: isRTL ? "row-reverse" : "row" }]}
          >
            <View style={styles.flex}>
              <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{localizedName(c.name, c.name_ar, c.name_ar_status, isRTL)}</Text>
              <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"}>{t("booking.inPerson")}</Text>
            </View>
            <View style={[styles.radio, { borderColor: sel ? colors.primary : colors.border }, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
              {sel ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
            </View>
          </Pressable>
        );
      })}

      {/* Select date */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("booking.selectDate")}</Text>
      <DayGrid items={days} selectedId={dateId} onSelect={onSelectDate} />

      {/* Available slots */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("booking.availableSlots")}</Text>
      {slotsQuery.isLoading ? (
        <LoadingState />
      ) : slotsQuery.isError ? (
        <ErrorState message={t("booking.slotsError")} onRetry={() => slotsQuery.refetch()} />
      ) : (
        <SlotGrid slots={availableSlots.map((s) => s.label)} selected={slot} onSelect={setSlot} emptyLabel={t("booking.noSlots")} />
      )}

      {!slot ? (
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }} align={isRTL ? "right" : "left"}>
          {t("booking.selectSlotFirst")}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20, marginBottom: 10 },
  clinic: { alignItems: "center", padding: 14, marginBottom: 10 },
  flex: { flex: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
