import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppHeader, Button, Card, Chip, DoctorCard, ErrorState, Icon, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useDoctor } from "@/hooks/queries/useDoctors";

/** Doctor Details (PDF p19): credentials, stats, slots, book bar. */
export default function DoctorDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();

  const doctorId = String(id ?? "");
  const doctor = useDoctor(doctorId);
  const [fav, setFav] = useState(false);
  const [slot, setSlot] = useState<string | undefined>(undefined);

  if (doctor.isLoading) {
    return (
      <Screen padded><AppHeader title={t("doctor.about")} /><LoadingState /></Screen>
    );
  }
  if (doctor.isError || !doctor.data) {
    return (
      <Screen padded>
        <AppHeader title={t("doctor.notFound")} />
        <ErrorState message={t("doctor.loadError")} onRetry={() => doctor.refetch()} />
      </Screen>
    );
  }

  const d = doctor.data;
  const stats: { value: string; label: string }[] = [
    { value: d.experience_years ? t("doctor.yearsShort", { years: d.experience_years }) : "—", label: t("doctor.experience") },
    { value: `${d.rating}★`, label: t("doctor.reviewsCount", { count: d.reviews ?? 0 }) },
    { value: `OMR ${d.fee_omr}`, label: t("doctor.fee") },
  ];

  return (
    <Screen
      scroll
      padded
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={
        <View style={[styles.bookBar, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={isRTL ? { marginStart: spacing.md } : { marginEnd: spacing.md }}>
            <Text variant="caption" color="textMuted">{t("doctor.consultation")}</Text>
            <Text variant="title">{`OMR ${d.fee_omr}`}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t("doctor.book")} onPress={() => router.push(`/booking/${d.id}/schedule`)} />
          </View>
        </View>
      }
    >
      <AppHeader
        title=""
        right={
          <Pressable onPress={() => setFav((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Favourite">
            <Icon name="favourite" size={24} filled={fav} tint={fav ? colors.error : colors.text} />
          </Pressable>
        }
      />

      {/* Hero — violet orb detail header */}
      <DoctorCard
        variant="detail"
        name={d.full_name}
        specialty={d.specialty}
        facility={d.facility}
        initials={(d.full_name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase()}
        availableTodayLabel={d.available_today ? t("doctor.availableToday") : undefined}
      />

      {/* Stats */}
      <View style={[styles.stats, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {stats.map((s) => (
          <Card key={s.label} style={styles.statCard}>
            <Text variant="title" align="center">{s.value}</Text>
            <Text variant="caption" color="textMuted" align="center" numberOfLines={1}>{s.label}</Text>
          </Card>
        ))}
      </View>

      {/* About */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("doctor.about")}</Text>
      <Text variant="body" color="textMuted">{d.about ?? "—"}</Text>

      {/* Languages */}
      {d.languages?.length ? (
        <>
          <Text variant="label" color="textMuted" style={styles.section}>{t("doctor.languages")}</Text>
          <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {d.languages.map((l) => <Chip key={l} label={l} />)}
          </View>
        </>
      ) : null}

      {/* Slots */}
      {d.slots_today?.length ? (
        <>
          <Text variant="label" color="textMuted" style={styles.section}>{t("doctor.availableToday")}</Text>
          <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {d.slots_today.map((s) => (
              <Chip key={s} label={s} selected={slot === s} onPress={() => setSlot(slot === s ? undefined : s)} />
            ))}
          </View>
        </>
      ) : null}

      {/* Reviews link */}
      <Card onPress={() => router.push(`/doctors/${d.id}/reviews`)} style={{ marginTop: spacing.lg }}>
        <View style={[styles.reviewRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text variant="title" style={{ flex: 1 }}>{t("doctor.seeReviews")}</Text>
          <Text variant="caption" color="textMuted" style={isRTL ? { marginStart: 6 } : { marginEnd: 6 }}>
            {`★ ${d.rating} · ${t("doctor.reviewsCount", { count: d.reviews ?? 0 })}`}
          </Text>
          <Icon name="chevron" direction={isRTL ? "left" : "right"} size={20} tint={colors.textMuted} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { gap: 8, marginTop: 16 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 14 },
  section: { marginTop: 20, marginBottom: 8 },
  chips: { flexWrap: "wrap", gap: 8 },
  reviewRow: { alignItems: "center" },
  bookBar: { alignItems: "center" },
});
