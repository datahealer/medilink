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
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useDoctor, useMapClinics } from "@/hooks/queries/useDoctors";
import { useAvailableSlots } from "@/hooks/queries/usePatient";
import { useBookingStore } from "@/stores/bookingStore";

const DOW = ["dowSun", "dowMon", "dowTue", "dowWed", "dowThu", "dowFri", "dowSat"] as const;
const DAY_COUNT = 5;

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
  const clinics = useMapClinics();
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

  const clinicList = useMemo(() => clinics.data ?? [], [clinics.data]);

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
    start({ doctorId: id, doctorName: d.full_name, specialty: d.specialty, facility: d.facility, initials: initialsOf(d.full_name), fee: d.fee_omr });
  }, [doctor.data, id, start]);

  const canContinue = !!clinicId && !!dateId && !!slot;

  const onContinue = () => {
    const clinic = clinicList.find((c) => c.id === clinicId);
    const picked = availableSlots.find((s) => s.label === slot);
    if (!clinic || !picked || !doctor.data) return;
    const meta = `${num(`${clinic.distance_km ?? 0} km`)} · ${t("booking.inPerson")}`;
    setSchedule({
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicMeta: meta,
      // Real bookings target the doctor's facility; fall back to the clinic id (mock mode).
      facilityId: doctor.data.facility_id || clinic.id,
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
              <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{c.name}</Text>
              <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"}>{`${num(`${c.distance_km ?? 0} km`)} · ${t("booking.inPerson")}`}</Text>
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
