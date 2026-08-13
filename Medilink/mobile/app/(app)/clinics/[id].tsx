import React, { useState } from "react";
import { Image, Linking, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppHeader, Avatar, Card, DoctorCard, EmptyState, ErrorState, Icon, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useClinic } from "@/hooks/queries/useDiscovery";
import { useDoctors } from "@/hooks/queries/useDoctors";
import { localizedName } from "@/utils/localizedName";
import { facilityTypeLabel } from "@/utils/specialties";
import { useGuestGate } from "@/hooks/useGuestGate";
import type { Doctor } from "@/data/types";

/**
 * Clinic Detail (QA #14): clinic header + its doctors → tap through to Doctor Detail
 * / Book. The doctor list comes from `useDoctors({ facilityId })`, which is RLS-scoped
 * to active (bookable) doctors — the same basis as the featured card's count (QA #12).
 */
export default function ClinicDetailScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const id = String(rawId ?? "");
  const { requireAuth } = useGuestGate();

  const clinic = useClinic(id);
  const doctors = useDoctors({ facilityId: id });
  const list = doctors.data ?? [];

  /**
   * Header image. Priority is cover → logo → the initials Avatar we already use elsewhere.
   *
   * `imageFailed` matters: a stored URL can 404 or be revoked, and a broken-image box is
   * worse than the initials fallback. We never construct or guess a URL — only what the
   * backend returned is ever loaded.
   */
  const [imageFailed, setImageFailed] = useState(false);
  const photo = !imageFailed
    ? (clinic.data?.cover_photo_url || clinic.data?.logo_url || null)
    : null;

  /**
   * `working_hours` is free-shape JSONB owned by HAMS. It is rendered ONLY when it parses
   * to a flat day → string map; anything else is skipped rather than stringified into
   * something like `[object Object]`.
   */
  const hours = (() => {
    const raw = clinic.data?.working_hours;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const entries = Object.entries(raw as Record<string, unknown>).filter(
      ([, v]) => typeof v === "string" && v.trim().length > 0
    ) as [string, string][];
    return entries.length > 0 ? entries : null;
  })();

  const card = (d: Doctor) => (
    <View key={d.id} style={{ marginBottom: spacing.sm }}>
      <DoctorCard
        variant="searchResult"
        name={localizedName(d.full_name, d.full_name_ar, d.full_name_ar_status, isRTL)}
        specialty={d.specialty}
        facility={localizedName(d.facility, d.facility_ar, d.facility_ar_status, isRTL)}
        metaText={num(`★ ${d.rating}   OMR ${d.fee_omr}`)}
        availableTodayLabel={d.available_today ? t("search.today") : undefined}
        bookLabel={t("search.book")}
        profileLabel={t("search.profile")}
        onBook={() => requireAuth(() => router.push(`/booking/${d.id}/schedule`))}
        onProfile={() => router.push(`/doctors/${d.id}`)}
        onPress={() => router.push(`/doctors/${d.id}`)}
      />
    </View>
  );

  const headerTitle = clinic.data
    ? localizedName(clinic.data.name, clinic.data.name_ar, clinic.data.name_ar_status, isRTL)
    : t("clinic.title");

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
    >
      <AppHeader title={headerTitle} showBack />

      {clinic.isLoading ? (
        <View style={{ paddingTop: spacing.lg }}><LoadingState /></View>
      ) : clinic.isError || !clinic.data ? (
        <ErrorState message={t("clinic.loadError")} onRetry={() => clinic.refetch()} />
      ) : (
        <>
          {/* Header image — real backend asset only. Falls back to the initials Avatar we
              already use across the app rather than a placeholder graphic. */}
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={[styles.cover, { borderRadius: radii.lg, marginBottom: spacing.md }]}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={{ alignItems: "center", marginBottom: spacing.md }}>
              <Avatar name={clinic.data.name} size={72} />
            </View>
          )}

          <Card style={{ marginBottom: spacing.lg }}>
            <Text variant="title" align={isRTL ? "right" : "left"}>
              {localizedName(clinic.data.name, clinic.data.name_ar, clinic.data.name_ar_status, isRTL)}
            </Text>

            {/* Meta line. Every element is conditional: a clinic with no rating shows no
                star rather than "★ 0", and a missing review count shows nothing at all. */}
            <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.xs }}>
              {num(
                [
                  clinic.data.category ? facilityTypeLabel(clinic.data.category, t) : null,
                  clinic.data.rating > 0 ? `★ ${clinic.data.rating}` : null,
                  clinic.data.review_count
                    ? t("clinic.reviewsCount", { count: clinic.data.review_count })
                    : null,
                  // Counted from the doctors query this screen already runs — no new call,
                  // and it matches the list rendered below.
                  list.length > 0 ? t("clinic.doctorsCount", { count: list.length }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              )}
            </Text>

            {clinic.data.area ? (
              <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.xs }}>
                {clinic.data.area}
              </Text>
            ) : null}

            {clinic.data.description ? (
              <Text variant="body" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.sm }}>
                {clinic.data.description}
              </Text>
            ) : null}

            {/* Contact actions — rendered only when the backend supplied the value, so a
                dead "Call" row can never appear. */}
            {clinic.data.phone || clinic.data.website ? (
              <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.sm }]}>
                {clinic.data.phone ? (
                  <Pressable
                    onPress={() => void Linking.openURL(`tel:${clinic.data!.phone}`).catch(() => {})}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("clinic.phone")}
                    style={[styles.action, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                  >
                    <Icon name="alerts" size={16} tint={colors.primary} />
                    <Text variant="label" color="primary" style={isRTL ? { marginEnd: 6 } : { marginStart: 6 }}>
                      {t("clinic.phone")}
                    </Text>
                  </Pressable>
                ) : null}
                {clinic.data.website ? (
                  <Pressable
                    onPress={() => void Linking.openURL(clinic.data!.website!).catch(() => {})}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("clinic.website")}
                    style={[styles.action, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                  >
                    <Icon name="share" size={16} tint={colors.primary} />
                    <Text variant="label" color="primary" style={isRTL ? { marginEnd: 6 } : { marginStart: 6 }}>
                      {t("clinic.website")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </Card>

          {clinic.data.services && clinic.data.services.length > 0 ? (
            <Card style={{ marginBottom: spacing.lg }}>
              <Text variant="label" align={isRTL ? "right" : "left"}>{t("clinic.services")}</Text>
              <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.xs }}>
                {clinic.data.services.join(" · ")}
              </Text>
            </Card>
          ) : null}

          {hours ? (
            <Card style={{ marginBottom: spacing.lg }}>
              <Text variant="label" align={isRTL ? "right" : "left"}>{t("clinic.hours")}</Text>
              {hours.map(([day, value]) => (
                <Text
                  key={day}
                  variant="caption"
                  color="textMuted"
                  align={isRTL ? "right" : "left"}
                  style={{ marginTop: spacing.xs }}
                >
                  {num(`${day}: ${value}`)}
                </Text>
              ))}
            </Card>
          ) : null}

          <Text variant="title" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.sm }}>
            {t("clinic.doctors")}
          </Text>

          {doctors.isLoading ? (
            <View style={{ paddingTop: spacing.md }}><LoadingState /></View>
          ) : doctors.isError ? (
            <ErrorState message={t("search.loadError")} onRetry={() => doctors.refetch()} />
          ) : list.length === 0 ? (
            <View style={{ borderRadius: radii.lg }}>
              <EmptyState title={t("clinic.noDoctorsTitle")} body={t("clinic.noDoctorsBody")} />
            </View>
          ) : (
            list.map(card)
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", aspectRatio: 16 / 9 },
  actions: { alignItems: "center", gap: 16, flexWrap: "wrap" },
  action: { alignItems: "center" },
});
