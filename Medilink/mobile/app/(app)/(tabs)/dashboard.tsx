import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppointmentCard, Avatar, Card, Chip, ClinicCard, ErrorState, HubActionTile, Icon, type IconName, LoadingState, MeMark, RecentlyVisitedCard, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { isDev } from "@/config/env";
import { useProfile, useUpcomingAppointments } from "@/hooks/queries/usePatient";
import { useRecentDoctors, useFeaturedClinics, useSpecialties } from "@/hooks/queries/useDiscovery";
import { useSearchFilterStore } from "@/stores/searchFilterStore";

function greetingKey(): "dashboard.greetingMorning" | "dashboard.greetingAfternoon" | "dashboard.greetingEvening" {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.greetingMorning";
  if (h < 18) return "dashboard.greetingAfternoon";
  return "dashboard.greetingEvening";
}

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1]?.[0] ?? "" : "")).toUpperCase();
}

export default function DashboardScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const profile = useProfile();
  const upcoming = useUpcomingAppointments();
  const recents = useRecentDoctors();
  const featured = useFeaturedClinics();
  const specialties = useSpecialties();
  const setFilters = useSearchFilterStore((s) => s.setFilters);

  const name = profile.data?.account?.full_name ?? "";
  const photo = profile.data?.patient?.profile_photo_url ?? null;
  const next = upcoming.data?.[0];

  // Me Care Hub tiles (PDF p14): Me Assistant · Book · Lab results · Me Vault.
  const actions: { key: string; label: string; icon: IconName; onPress: () => void }[] = [
    { key: "assistant", label: t("dashboard.meAssistant"), icon: "ai", onPress: () => router.push("/ai/assistant") },
    { key: "book", label: t("dashboard.book"), icon: "calendar", onPress: () => router.push("/search") },
    { key: "labs", label: t("dashboard.labResults"), icon: "lab", onPress: () => router.push("/records/labs") },
    { key: "vault", label: t("dashboard.meVault"), icon: "document", onPress: () => router.push("/records") },
  ];

  return (
    <Screen scroll padded edges={["top", "left", "right"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}>
      {/* Greeting header */}
      <View style={[styles.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={[styles.headerLeft, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={name} uri={photo} size={48} />
          <View style={isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }}>
            <Text variant="caption" color="textMuted">{t(greetingKey())}</Text>
            <Text variant="title" numberOfLines={1}>{name || t("dashboard.hello")}</Text>
          </View>
        </View>
        <View style={[styles.headerActions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {isDev ? (
            <Pressable
              onPress={() => router.push("/dev/screen-gallery")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Open dev Screen Gallery"
              style={[styles.bell, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            >
              <Icon name="grid" size={18} tint={colors.textMuted} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push("/notifications")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("dashboard.notifications")}
            style={[styles.bell, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          >
            <Icon name="alerts" size={20} tint={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Search → opens the doctor-search screen */}
      <Pressable
        onPress={() => router.push("/search")}
        accessibilityRole="search"
        accessibilityLabel={t("dashboard.searchPlaceholder")}
        style={[styles.search, { backgroundColor: colors.surfaceAlt, borderRadius: radii.md, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        <Icon name="search" size={18} tint={colors.textMuted} />
        <Text variant="body" color="textMuted" style={isRTL ? { marginEnd: 8 } : { marginStart: 8 }}>
          {t("dashboard.searchPlaceholder")}
        </Text>
      </Pressable>

      {/* Upcoming / next visit — header links to the full Appointments list */}
      <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.md, marginBottom: spacing.sm }]}>
        <Text variant="label" color="textMuted">{t("dashboard.upcoming")}</Text>
        <Pressable
          onPress={() => router.push("/appointments")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("appointments.title")}
        >
          <Text variant="caption" color="primary">{t("dashboard.seeAll")}</Text>
        </Pressable>
      </View>
      {upcoming.isLoading ? (
        <Card><View style={{ height: 72 }}><LoadingState /></View></Card>
      ) : upcoming.isError ? (
        <Card><Text variant="body" color="textMuted">{t("dashboard.loadError")}</Text></Card>
      ) : next ? (
        <AppointmentCard
          statusLabel={t("dashboard.upcoming")}
          doctorName={next.doctor?.full_name ?? "—"}
          subtitle={[next.facility?.name, next.slot_start].filter(Boolean).join(" · ")}
          initials={initialsOf(next.doctor?.full_name)}
          primaryLabel={t("dashboard.checkIn")}
          secondaryLabel={t("dashboard.reschedule")}
          onPrimary={() => router.push(`/appointments/${next.id}/check-in`)}
          onSecondary={() => router.push(`/appointments/${next.id}`)}
          isRTL={isRTL}
        />
      ) : (
        <Card>
          <Text variant="title">{t("dashboard.noUpcomingTitle")}</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>{t("dashboard.noUpcomingBody")}</Text>
        </Card>
      )}

      {/* Me Care Hub */}
      <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.md, marginBottom: spacing.sm }]}>
        <View style={[styles.hubTitle, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <MeMark height={16} color={colors.primary} />
          <Text variant="label" color="textMuted" style={isRTL ? { marginEnd: 6 } : { marginStart: 6 }}>{t("dashboard.careHub")}</Text>
        </View>
        <Pressable onPress={() => Alert.alert(t("dashboard.careHub"), t("dashboard.comingSoon"))} hitSlop={8}>
          <Text variant="caption" color="primary">{t("dashboard.customize")}</Text>
        </Pressable>
      </View>
      <View style={[styles.grid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {actions.map((a) => (
          <View key={a.key} style={styles.gridCell}>
            <HubActionTile label={a.label} icon={a.icon} dot onPress={a.onPress} />
          </View>
        ))}
      </View>

      {/* Top specialties */}
      <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.md, marginBottom: spacing.sm }]}>
        <Text variant="label" color="textMuted">{t("dashboard.topSpecialties")}</Text>
        <Pressable onPress={() => router.push("/search/specialties")} hitSlop={8}>
          <Text variant="caption" color="primary">{t("dashboard.seeAll")}</Text>
        </Pressable>
      </View>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {(specialties.data ?? [])
          .filter((s) => ["cardiology", "dermatology", "dentist"].includes(s.id))
          .map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              onPress={() => {
                setFilters({ specialty: s.name });
                router.push("/search");
              }}
            />
          ))}
      </View>

      {/* Recently visited */}
      <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.md, marginBottom: spacing.sm }]}>
        <Text variant="label" color="textMuted">{t("dashboard.recentlyVisited")}</Text>
        <Pressable onPress={() => router.push("/search")} hitSlop={8}>
          <Text variant="caption" color="primary">{t("dashboard.seeAll")}</Text>
        </Pressable>
      </View>
      {recents.isLoading ? (
        <Card><View style={{ height: 64 }}><LoadingState /></View></Card>
      ) : (
        (recents.data ?? []).map((d) => (
          <View key={d.id} style={{ marginBottom: spacing.sm }}>
            <RecentlyVisitedCard
              name={d.full_name}
              specialty={d.specialty}
              facility={d.facility}
              metaText={num(`★ ${d.rating} · OMR ${d.fee_omr}`)}
              visitedLabel={t("dashboard.visited")}
              onPress={() => router.push(`/doctors/${d.id}`)}
            />
          </View>
        ))
      )}

      {/* Featured clinics */}
      <Text variant="label" color="textMuted" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        {t("dashboard.featuredClinics")}
      </Text>
      {(featured.data ?? []).map((c) => (
        <ClinicCard
          key={c.id}
          name={c.name}
          tagLabel={num(`★ ${c.rating} · ${t("dashboard.featured")}`)}
          meta={num([c.category ?? c.area, c.doctors_count ? `${c.doctors_count} doctors` : null, c.distance_km != null ? `${c.distance_km} km` : null].filter(Boolean).join(" · "))}
          onPress={() => router.push("/search")}
          isRTL={isRTL}
        />
      ))}

      {profile.isError ? (
        <View style={{ marginTop: spacing.lg }}>
          <ErrorState message={t("profile.loadError")} onRetry={() => profile.refetch()} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  headerLeft: { alignItems: "center", flex: 1 },
  headerActions: { alignItems: "center", gap: 8 },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth * 2 },
  search: { alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth * 2, minHeight: 48 },
  rowBetween: { alignItems: "center", justifyContent: "space-between" },
  hubTitle: { alignItems: "center" },
  grid: { flexWrap: "wrap", marginHorizontal: -4 },
  gridCell: { width: "25%", padding: 4 },
  chips: { flexWrap: "wrap", gap: 8 },
});
