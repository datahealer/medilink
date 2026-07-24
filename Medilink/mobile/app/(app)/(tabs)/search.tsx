import React, { useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Button, Chip, ClinicCard, DoctorCard, EmptyState, ErrorState, Icon, LoadingState, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useDoctors, useFavouriteDoctors } from "@/hooks/queries/useDoctors";
import { useSearchClinics } from "@/hooks/queries/useDiscovery";
import { useRefresh } from "@/hooks/useRefresh";
import { useSearchFilterStore, activeFilterCount } from "@/stores/searchFilterStore";
import type { Clinic, Doctor } from "@/data/types";
import { localizedName } from "@/utils/localizedName";
import { facilityTypeLabel } from "@/utils/specialties";
import { useGuestGate } from "@/hooks/useGuestGate";

/** Search & Results (PDF p17): query, quick filters and ranked doctor cards. */
export default function SearchScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const filters = useSearchFilterStore();
  const setFilters = useSearchFilterStore((s) => s.setFilters);
  const [query, setQuery] = useState("");
  const { requireAuth } = useGuestGate(); // F4: guests can browse, but Book → wall

  // Pagination (QA #13): grow the fetch window from the top of the ranked list.
  const PAGE = 20;
  const [limit, setLimit] = useState(PAGE);
  // Reset to the first page whenever the search/filters change.
  useEffect(() => {
    setLimit(PAGE);
  }, [query, filters.specialty, filters.gender, filters.maxFee, filters.minRating, filters.availableToday, filters.topRated]);

  const doctors = useDoctors({
    query,
    specialty: filters.specialty,
    gender: filters.gender,
    maxFee: filters.maxFee,
    minRating: filters.minRating,
    availableToday: filters.availableToday,
    topRated: filters.topRated,
    limit,
  });

  // Favourites tab (QA #6) — a dedicated view of the user's saved doctors, composed
  // from existing repos; leaves normal search + pagination + ordering untouched.
  const [showFavourites, setShowFavourites] = useState(false);
  const favDoctors = useFavouriteDoctors({ enabled: showFavourites });

  // Doctors | Clinics search (QA #14). Clinic query only runs in clinics mode.
  const [mode, setMode] = useState<"doctors" | "clinics">("doctors");
  const clinics = useSearchClinics(query, { enabled: mode === "clinics" });

  const count = doctors.data?.length ?? 0;
  // A full window came back → more likely exist. (When client-side filters trim a
  // page below `limit` the button hides — acceptable; global paging under those
  // filters needs server-side filtering, tracked as a backend follow-up.)
  const canLoadMore = count >= limit;
  const filterBadge = activeFilterCount(filters);
  const { refreshing, onRefresh } = useRefresh(() =>
    showFavourites ? favDoctors.refetch() : mode === "clinics" ? clinics.refetch() : doctors.refetch()
  );

  const clinicCard = (c: Clinic) => (
    <View key={c.id} style={{ marginBottom: spacing.sm }}>
      <ClinicCard
        name={localizedName(c.name, c.name_ar, c.name_ar_status, isRTL)}
        tagLabel={c.rating ? num(`★ ${c.rating}`) : undefined}
        meta={num([c.category ? facilityTypeLabel(c.category, t) : c.area, c.doctors_count ? `${c.doctors_count} ${t("clinic.doctors")}` : null].filter(Boolean).join(" · "))}
        onPress={() => router.push(`/clinics/${c.id}`)}
        isRTL={isRTL}
      />
    </View>
  );

  const card = (d: Doctor) => (
    <View key={d.id} style={{ marginBottom: spacing.sm }}>
      <DoctorCard
        variant="searchResult"
        name={localizedName(d.full_name, d.full_name_ar, d.full_name_ar_status, isRTL)}
        specialty={d.specialty}
        facility={localizedName(d.facility, d.facility_ar, d.facility_ar_status, isRTL)}
        metaText={num(`★ ${d.rating}   OMR ${d.fee_omr}${d.distance_km != null ? ` · ${d.distance_km} km` : ""}`)}
        availableTodayLabel={d.available_today ? t("search.today") : undefined}
        bookLabel={t("search.book")}
        profileLabel={t("search.profile")}
        onBook={() => requireAuth(() => router.push(`/booking/${d.id}/schedule`))}
        onProfile={() => router.push(`/doctors/${d.id}`)}
        onPress={() => router.push(`/doctors/${d.id}`)}
      />
    </View>
  );

  return (
    <Screen scroll padded edges={["top", "left", "right"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
      {/* Header (tab root — no back) */}
      <View style={[styles.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text variant="h2" style={{ flex: 1 }}>{t("search.findDoctor")}</Text>
        <Pressable onPress={() => router.push("/search/map")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("map.title")} style={[styles.iconBtn, { borderColor: colors.border }]}>
          <Icon name="map" size={18} tint={colors.text} />
        </Pressable>
        <Pressable onPress={() => router.push("/search/filters")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("filters.title")} style={[styles.iconBtn, { borderColor: colors.border, ...(isRTL ? { marginEnd: 8 } : { marginStart: 8 }) }]}>
          <Icon name="filter" size={18} tint={colors.text} />
          {filterBadge > 0 ? <View style={[styles.badge, { backgroundColor: colors.primary }, isRTL ? { left: 8 } : { right: 8 }]} /> : null}
        </Pressable>
      </View>

      {/* Doctors | Clinics toggle (QA #14) */}
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row", marginBottom: spacing.md }]}>
        <Chip label={t("search.doctorsTab")} selected={mode === "doctors"} onPress={() => setMode("doctors")} />
        <Chip label={t("search.clinicsTab")} selected={mode === "clinics"} onPress={() => setMode("clinics")} />
      </View>

      {/* Search field */}
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={mode === "clinics" ? t("search.clinicPlaceholder") : t("search.placeholder")}
        autoCapitalize="none"
        leading={<Icon name="search" size={18} tint={colors.textMuted} />}
        containerStyle={{ marginBottom: spacing.md }}
      />

      {mode === "doctors" ? (
        <>
      {/* Quick filter chips */}
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Chip
          label={t("search.all")}
          selected={!showFavourites && !filters.availableToday && !filters.topRated}
          onPress={() => { setShowFavourites(false); setFilters({ availableToday: false, topRated: false }); }}
        />
        <Chip
          label={t("search.availableToday")}
          selected={!showFavourites && !!filters.availableToday}
          onPress={() => { setShowFavourites(false); setFilters({ availableToday: !filters.availableToday }); }}
        />
        <Chip
          label={t("search.topRated")}
          selected={!showFavourites && !!filters.topRated}
          onPress={() => { setShowFavourites(false); setFilters({ topRated: !filters.topRated }); }}
        />
        <Chip
          label={t("search.favourites")}
          selected={showFavourites}
          onPress={() => requireAuth(() => setShowFavourites(true))}
        />
      </View>

      {/* Count + sort */}
      <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.md, marginBottom: spacing.sm }]}>
        <Text variant="caption" color="textMuted">{t("search.results", { count: num(showFavourites ? (favDoctors.data?.length ?? 0) : count) })}</Text>
        {!showFavourites ? <Text variant="caption" color="textMuted">{t("search.sortRating")}</Text> : null}
      </View>

      {/* Results — favourites view (QA #6) or the normal paginated search */}
      {showFavourites ? (
        favDoctors.isLoading ? (
          <View style={{ paddingTop: spacing.lg }}><LoadingState /></View>
        ) : favDoctors.isError ? (
          <ErrorState message={t("search.loadError")} onRetry={() => favDoctors.refetch()} />
        ) : (favDoctors.data?.length ?? 0) === 0 ? (
          <View style={{ borderRadius: radii.lg }}>
            <EmptyState title={t("search.noFavouritesTitle")} body={t("search.noFavouritesBody")} />
          </View>
        ) : (
          (favDoctors.data ?? []).map(card)
        )
      ) : doctors.isLoading ? (
        <View style={{ paddingTop: spacing.lg }}><LoadingState /></View>
      ) : doctors.isError ? (
        <ErrorState message={t("search.loadError")} onRetry={() => doctors.refetch()} />
      ) : count === 0 ? (
        <View style={{ borderRadius: radii.lg }}>
          <EmptyState title={t("search.noResultsTitle")} body={t("search.noResultsBody")} />
        </View>
      ) : (
        <>
          {(doctors.data ?? []).map(card)}
          {canLoadMore ? (
            <Button
              label={t("search.loadMore")}
              variant="ghost"
              loading={doctors.isFetching}
              onPress={() => setLimit((l) => l + PAGE)}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </>
      )}
        </>
      ) : (
        <>
          {/* Clinic search results (QA #14) → Clinic Detail */}
          {clinics.isLoading ? (
            <View style={{ paddingTop: spacing.lg }}><LoadingState /></View>
          ) : clinics.isError ? (
            <ErrorState message={t("search.loadError")} onRetry={() => clinics.refetch()} />
          ) : (clinics.data?.length ?? 0) === 0 ? (
            <View style={{ borderRadius: radii.lg }}>
              <EmptyState title={t("search.noClinicsTitle")} body={t("search.noClinicsBody")} />
            </View>
          ) : (
            (clinics.data ?? []).map(clinicCard)
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginBottom: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth * 2 },
  badge: { position: "absolute", top: 8, width: 8, height: 8, borderRadius: 4 },
  chips: { flexWrap: "wrap", gap: 8 },
  rowBetween: { alignItems: "center", justifyContent: "space-between" },
});
