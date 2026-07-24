import React from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppHeader, Card, DoctorCard, EmptyState, ErrorState, LoadingState, Screen, Text } from "@/components/ui";
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
          <Card style={{ marginBottom: spacing.lg }}>
            <Text variant="title" align={isRTL ? "right" : "left"}>
              {localizedName(clinic.data.name, clinic.data.name_ar, clinic.data.name_ar_status, isRTL)}
            </Text>
            <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.xs }}>
              {num(
                [
                  clinic.data.category ? facilityTypeLabel(clinic.data.category, t) : clinic.data.area,
                  clinic.data.rating ? `★ ${clinic.data.rating}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              )}
            </Text>
          </Card>

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
