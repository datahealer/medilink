import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Avatar, Card, Chip, ErrorState, HeroBackground, Icon, type IconName, LoadingState, Screen, Text } from "@/components/ui";
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

      {/* Upcoming / next visit */}
      <Text variant="label" color="textMuted" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        {t("dashboard.upcoming")}
      </Text>
      {upcoming.isLoading ? (
        <Card><View style={{ height: 72 }}><LoadingState /></View></Card>
      ) : upcoming.isError ? (
        <Card><Text variant="body" color="textMuted">{t("dashboard.loadError")}</Text></Card>
      ) : next ? (
        // Filled VIOLET upcoming card (white content), matching the p36 artboard.
        <View style={[styles.upcoming, { backgroundColor: colors.heroFrom, borderRadius: radii.lg }]}>
          <View style={[styles.upcomingTop, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={styles.upcomingPill}>
              <Text variant="caption" style={styles.upcomingPillText}>{t("dashboard.nextVisit").toUpperCase()}</Text>
            </View>
          </View>
          <View style={[styles.nextRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={styles.whiteAvatar}>
              <Text variant="title" style={{ color: colors.heroFrom }}>{initialsOf(next.doctor?.full_name)}</Text>
            </View>
            <View style={[styles.nextText, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
              <Text variant="title" numberOfLines={1} style={{ color: "#FFFFFF" }}>{next.doctor?.full_name ?? "—"}</Text>
              <Text variant="caption" numberOfLines={1} style={{ color: "rgba(255,255,255,0.78)" }}>
                {[next.facility?.name, next.slot_date, next.slot_start].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
          <View style={[styles.nextActions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Pressable
              onPress={() => router.push(`/appointments/${next.id}/check-in`)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.checkInBtn, { borderRadius: radii.md, opacity: pressed ? 0.9 : 1 }]}
            >
              <Text variant="title" style={{ color: colors.heroFrom }}>{t("dashboard.checkIn")}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/appointments/${next.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.rescheduleBtn, { borderRadius: radii.md, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text variant="title" style={{ color: "#FFFFFF" }}>{t("dashboard.reschedule")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Card>
          <Text variant="title">{t("dashboard.noUpcomingTitle")}</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>{t("dashboard.noUpcomingBody")}</Text>
        </Card>
      )}

      {/* Me Care Hub */}
      <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.md, marginBottom: spacing.sm }]}>
        <Text variant="label" color="textMuted">{t("dashboard.careHub")}</Text>
        <Pressable onPress={() => Alert.alert(t("dashboard.careHub"), t("dashboard.comingSoon"))} hitSlop={8}>
          <Text variant="caption" color="primary">{t("dashboard.customize")}</Text>
        </Pressable>
      </View>
      <View style={[styles.grid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {actions.map((a) => (
          <View key={a.key} style={styles.gridCell}>
            <Card onPress={a.onPress} accessibilityLabel={a.label} style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: colors.accent, borderRadius: radii.md }]}>
                <Icon name={a.icon} size={20} tint={colors.primary} />
              </View>
              <Text variant="caption" align="center" numberOfLines={2} style={{ marginTop: 6 }}>{a.label}</Text>
            </Card>
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
          <Card key={d.id} onPress={() => router.push(`/doctors/${d.id}`)} style={{ marginBottom: spacing.sm }}>
            <View style={[styles.docRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Avatar name={d.full_name} size={44} />
              <View style={[styles.docText, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
                <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <Text variant="title" numberOfLines={1} style={{ flex: 1 }}>{d.full_name}</Text>
                  {d.visited ? (
                    <View style={[styles.tag, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                      <Text variant="caption" color="textMuted">{t("dashboard.visited")}</Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {`${d.specialty} · ${d.facility}`}
                </Text>
                <Text variant="caption" color="textMuted">
                  {num(`★ ${d.rating}   OMR ${d.fee_omr}`)}
                </Text>
              </View>
            </View>
          </Card>
        ))
      )}

      {/* Featured clinics */}
      <Text variant="label" color="textMuted" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        {t("dashboard.featuredClinics")}
      </Text>
      {(featured.data ?? []).map((c) => (
        <Card key={c.id} onPress={() => router.push("/search")}>
          {/* Branded clinic hero — soft orbs on the violet field stand in for clinic
              imagery until photos land. Violet in both themes (heroFrom). */}
          <View style={[styles.clinicHero, { backgroundColor: colors.heroFrom, borderRadius: radii.md }]}>
            <HeroBackground tone="onViolet" radius={radii.md} />
            <View style={[styles.tag, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="caption" color="primary">{num(`★ ${c.rating} · ${t("dashboard.featured")}`)}</Text>
            </View>
          </View>
          <Text variant="title" style={{ marginTop: spacing.sm }} numberOfLines={1}>{c.name}</Text>
          <Text variant="caption" color="textMuted">
            {num([c.area, c.doctors_count ? `${c.doctors_count} doctors` : null, c.distance_km != null ? `${c.distance_km} km` : null].filter(Boolean).join(" · "))}
          </Text>
        </Card>
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
  upcoming: { padding: 14, overflow: "hidden" },
  upcomingTop: { alignItems: "center", justifyContent: "flex-start", marginBottom: 4 },
  upcomingPill: { backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  upcomingPillText: { color: "#FFFFFF", letterSpacing: 0.6, fontSize: 10 },
  whiteAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  checkInBtn: { flex: 1, minHeight: 46, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  rescheduleBtn: { flex: 1, minHeight: 46, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.55)", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  nextRow: { alignItems: "center", marginTop: 10 },
  nextText: { flex: 1 },
  nextActions: { gap: 8, marginTop: 12 },
  grid: { flexWrap: "wrap", marginHorizontal: -4 },
  gridCell: { width: "25%", padding: 4 },
  actionCard: { alignItems: "center", paddingVertical: 12, paddingHorizontal: 4 },
  actionIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  chips: { flexWrap: "wrap", gap: 8 },
  docRow: { alignItems: "center" },
  docText: { flex: 1 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth * 2, marginStart: 6 },
  clinicHero: { height: 84, alignItems: "flex-start", justifyContent: "flex-start", padding: 10, overflow: "hidden" },
});
