import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
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
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useAppointment, useAvailableSlots, useRescheduleAppointment } from "@/hooks/queries/usePatient";
import { bookingErrorMessage } from "@/utils/appointments";
import { BOOKING_WINDOW_DAYS, omanBookingDays } from "@medilink/shared/mobile";

const DOW = ["dowSun", "dowMon", "dowTue", "dowWed", "dowThu", "dowFri", "dowSat"] as const;
// Reschedule uses the same booking window as new bookings (single source of truth);
// the availability RPC clamps slots to this window server-side (BP-2).
const DAY_COUNT = BOOKING_WINDOW_DAYS;

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Slot end fallback when the availability template doesn't carry one. */
function addMinutes(hhmm: string, mins: number): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Reschedule — reuses the booking slot logic, then reschedule_appointment_atomic. */
export default function RescheduleScreen() {
  const { spacing } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const apptId = String(rawId ?? "");

  const appt = useAppointment(apptId);
  const doctorId = appt.data?.doctor_id ?? "";

  // Booking-window strip in OMAN calendar days (same convention as the booking
  // schedule screen). Keyed and labelled from the same Oman clock so the chip and
  // the slots query can never refer to different dates around local midnight.
  const days = useMemo(() => {
    const items: DayItem[] = [];
    for (const d of omanBookingDays(DAY_COUNT)) {
      const dow = t(`common.${DOW[d.weekday]}` as Parameters<typeof t>[0]);
      items.push({ id: d.key, top: dow, bottom: num(String(d.dayOfMonth)) });
    }
    return items;
  }, [t, num]);

  const [dateId, setDateId] = useState<string>(days[0]?.id ?? "");
  const [slot, setSlot] = useState<string | undefined>(undefined);

  const slotsQuery = useAvailableSlots({ doctorId, date: dateId });
  const availableSlots = slotsQuery.data ?? [];
  const reschedule = useRescheduleAppointment();

  const onSelectDate = (d: string) => {
    setDateId(d);
    setSlot(undefined);
  };

  const onConfirm = () => {
    const picked = availableSlots.find((s) => s.label === slot);
    if (!picked) return;
    const end = picked.end ?? addMinutes(picked.start, 30);
    reschedule.mutate(
      { id: apptId, slot: { date: dateId, start: picked.start, end } },
      {
        onSuccess: () => {
          Alert.alert(t("appointments.rescheduleSuccess"));
          router.back();
        },
        // Localize the known RPC codes (SLOT_IN_PAST / SLOT_ALREADY_TAKEN / …);
        // anything else still surfaces the raw backend reason.
        onError: (e) => Alert.alert(t("appointments.actionFailed"), bookingErrorMessage(errMsg(e), t)),
      }
    );
  };

  if (appt.isLoading) {
    return (
      <Screen padded>
        <AppHeader title={t("appointments.rescheduleTitle")} showBack />
        <LoadingState />
      </Screen>
    );
  }
  if (appt.isError || !appt.data) {
    return (
      <Screen padded>
        <AppHeader title={t("appointments.rescheduleTitle")} showBack />
        <ErrorState message={t("appointments.loadError")} onRetry={() => appt.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={
        <Button
          label={reschedule.isPending ? t("common.loading") : t("appointments.confirmReschedule")}
          disabled={!slot || reschedule.isPending}
          onPress={onConfirm}
        />
      }
    >
      <AppHeader title={t("appointments.rescheduleTitle")} showBack />

      <Text variant="label" color="textMuted" style={styles.section}>{t("appointments.chooseSlot")}</Text>
      <DayGrid items={days} selectedId={dateId} onSelect={onSelectDate} />

      <View style={{ height: spacing.md }} />
      {slotsQuery.isLoading ? (
        <LoadingState />
      ) : slotsQuery.isError ? (
        <ErrorState message={t("appointments.slotsError")} onRetry={() => slotsQuery.refetch()} />
      ) : (
        <SlotGrid slots={availableSlots.map((s) => s.label)} selected={slot} onSelect={setSlot} emptyLabel={t("appointments.noSlots")} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8, marginBottom: 10 },
});
