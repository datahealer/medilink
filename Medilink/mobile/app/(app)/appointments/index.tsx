import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  AppHeader,
  AppointmentCompactCard,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SegmentedTabs,
  StaticTabBar,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useAppointments, useCheckInAppointment } from "@/hooks/queries/usePatient";
import type { Appointment } from "@/data/types";
import { apptStatusCategory, apptStatusLabel, apptTone, formatApptDate, formatApptTime } from "@/utils/appointments";

/** A status that is still active (vs. an ended/past appointment). */
function isUpcoming(a: Appointment): boolean {
  const c = apptStatusCategory(a.status);
  return c === "success" || c === "warning";
}

/** Appointments — Upcoming & Past (PDF p24). */
export default function AppointmentsScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  // One fetch; split client-side so the Upcoming view can also show a Past section.
  const query = useAppointments("all");
  const all = query.data ?? [];
  const upcomingList = all.filter(isUpcoming);
  const pastList = all.filter((a) => !isUpcoming(a));

  const checkIn = useCheckInAppointment();
  const onHeroCheckIn = (apptId: string) =>
    Alert.alert(t("appointments.checkInTitle"), t("appointments.checkInMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("appointments.confirmCheckIn"),
        onPress: () =>
          checkIn.mutate(apptId, {
            onSuccess: () => Alert.alert(t("appointments.checkedInDone")),
            onError: (e) =>
              Alert.alert(
                t("appointments.actionFailed"),
                e instanceof Error ? e.message : String(e)
              ),
          }),
      },
    ]);

  const dateLabel = (a: Appointment) => formatApptDate(a.slot_date, t, num);
  const timeLabel = (a: Appointment) => formatApptTime(a.slot_start, num);
  const typePill = (a: Appointment) => (a.type === "online" ? t("appointments.online") : t("appointments.inPerson"));

  // Hero top-right: relative day for real ISO dates, else the formatted date.
  const relativeLabel = (a: Appointment): string => {
    const iso = a.slot_date && /^\d{4}-\d{2}-\d{2}$/.test(a.slot_date) ? a.slot_date : null;
    if (!iso) return dateLabel(a);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(`${iso}T00:00:00`);
    d.setHours(0, 0, 0, 0);
    const days = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (days <= 0) return t("appointments.today");
    if (days === 1) return t("appointments.tomorrow");
    if (days <= 14) return t("appointments.inDays", { n: num(String(days)) });
    return dateLabel(a);
  };

  // Design p24 subtitle: "Cardiology · Royal Hospital · 10:30 AM".
  const upcomingSubtitle = (a: Appointment) =>
    [a.doctor?.specialty, a.facility?.name, timeLabel(a)].filter(Boolean).join(" · ");
  const pastSubtitle = (a: Appointment) => [apptStatusLabel(a.status, t), dateLabel(a)].filter(Boolean).join(" · ");

  const pastSection = (
    <>
      <Text variant="h2" style={styles.section}>{t("appointments.past")}</Text>
      {pastList.length === 0 ? (
        <EmptyState title={t("appointments.emptyPastTitle")} body={t("appointments.emptyPastBody")} />
      ) : (
        pastList.map((a) => (
          <AppointmentCompactCard
            key={a.id}
            doctorName={a.doctor?.full_name || "—"}
            subtitle={pastSubtitle(a)}
            pillLabel={typePill(a)}
            onPress={() => router.push(`/appointments/${a.id}`)}
            isRTL={isRTL}
          />
        ))
      )}
    </>
  );

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.md }}
      footer={
        <View style={{ marginHorizontal: -spacing.lg, marginBottom: -8 }}>
          <StaticTabBar active="home" />
        </View>
      }
    >
      <AppHeader title={t("appointments.title")} showBack />

      <View style={{ marginBottom: spacing.md }}>
        <SegmentedTabs<"upcoming" | "past">
          tabs={[
            { key: "upcoming", label: t("appointments.upcoming") },
            { key: "past", label: t("appointments.past") },
          ]}
          active={tab}
          onChange={setTab}
        />
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={t("appointments.loadError")} onRetry={() => query.refetch()} />
      ) : tab === "upcoming" ? (
        <>
          {upcomingList.length === 0 ? (
            <EmptyState title={t("appointments.emptyUpcomingTitle")} body={t("appointments.emptyUpcomingBody")} />
          ) : (
            <>
              {upcomingList.map((a, i) => {
                // The next (first) actionable card carries inline Check in / Details (design p24).
                const isNext = i === 0;
                const canCheckIn = a.status === "confirmed";
                return (
                  <AppointmentCompactCard
                    key={a.id}
                    doctorName={a.doctor?.full_name || "—"}
                    subtitle={upcomingSubtitle(a)}
                    statusLabel={apptStatusLabel(a.status, t)}
                    statusTone={apptTone(colors, apptStatusCategory(a.status))}
                    topRight={isNext ? relativeLabel(a) : dateLabel(a)}
                    onPress={() => router.push(`/appointments/${a.id}`)}
                    checkInLabel={isNext && canCheckIn ? t("appointments.checkIn") : undefined}
                    detailsLabel={isNext ? t("appointments.details") : undefined}
                    onCheckIn={isNext && canCheckIn ? () => onHeroCheckIn(a.id) : undefined}
                    onDetails={isNext ? () => router.push(`/appointments/${a.id}`) : undefined}
                    checkInLoading={checkIn.isPending}
                    isRTL={isRTL}
                  />
                );
              })}
            </>
          )}

          <View style={{ height: spacing.md }} />
          {pastSection}
        </>
      ) : (
        pastSection
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8, marginBottom: 10 },
});
