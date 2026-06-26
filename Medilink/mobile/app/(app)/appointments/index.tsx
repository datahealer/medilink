import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  AppHeader,
  AppointmentCompactCard,
  EmptyState,
  ErrorState,
  HeroAppointmentCard,
  LoadingState,
  Screen,
  SegmentedTabs,
  StaticTabBar,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useAppointments } from "@/hooks/queries/usePatient";
import type { Appointment } from "@/data/types";
import { apptStatusCategory, apptStatusLabel, apptTone, formatApptDate, formatApptTime } from "@/utils/appointments";

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1]?.[0] ?? "" : "")).toUpperCase();
}

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

  const heroSubtitle = (a: Appointment) =>
    [a.facility?.name, dateLabel(a), timeLabel(a)].filter(Boolean).join(" · ");
  const upcomingSubtitle = (a: Appointment) => [a.facility?.name, timeLabel(a)].filter(Boolean).join(" · ");
  const pastSubtitle = (a: Appointment) => [apptStatusLabel(a.status, t), dateLabel(a)].filter(Boolean).join(" · ");

  const hero = upcomingList[0];
  const restUpcoming = upcomingList.slice(1);

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
              {hero ? (
                <HeroAppointmentCard
                  statusLabel={apptStatusLabel(hero.status, t)}
                  statusColor={apptTone(colors, apptStatusCategory(hero.status)).fg}
                  relativeLabel={relativeLabel(hero)}
                  doctorName={hero.doctor?.full_name || "—"}
                  initials={initialsOf(hero.doctor?.full_name)}
                  subtitle={heroSubtitle(hero)}
                  checkInLabel={t("appointments.checkIn")}
                  detailsLabel={t("appointments.details")}
                  onCheckIn={() => router.push(`/appointments/${hero.id}/check-in`)}
                  onDetails={() => router.push(`/appointments/${hero.id}`)}
                  isRTL={isRTL}
                />
              ) : null}
              <View style={{ height: spacing.sm }} />
              {restUpcoming.map((a) => (
                <AppointmentCompactCard
                  key={a.id}
                  doctorName={a.doctor?.full_name || "—"}
                  subtitle={upcomingSubtitle(a)}
                  statusLabel={apptStatusLabel(a.status, t)}
                  statusTone={apptTone(colors, apptStatusCategory(a.status))}
                  topRight={dateLabel(a)}
                  onPress={() => router.push(`/appointments/${a.id}`)}
                  isRTL={isRTL}
                />
              ))}
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
