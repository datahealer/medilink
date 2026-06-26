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

const DOW = ["dowSun", "dowMon", "dowTue", "dowWed", "dowThu", "dowFri", "dowSat"] as const;
const DAY_COUNT = 5;

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

  // 5-day strip from today (same convention as the booking schedule screen).
  const days = useMemo(() => {
    const items: DayItem[] = [];
    const base = new Date();
    for (let i = 0; i < DAY_COUNT; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const dow = t(`common.${DOW[d.getDay()]}` as Parameters<typeof t>[0]);
      items.push({ id: key, top: dow, bottom: num(String(d.getDate())) });
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
        onError: (e) => Alert.alert(t("appointments.actionFailed"), errMsg(e)),
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
