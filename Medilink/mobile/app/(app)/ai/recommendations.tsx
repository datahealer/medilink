import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppCard, AppHeader, Avatar, Button, Card, EmptyState, ErrorState, LoadingState, MeMark, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useSuggestedDoctors } from "@/hooks/queries/useAi";
import type { AiSuggestedDoctor } from "@/data/types";

/**
 * AI Recommendations (design p27) — real doctor suggestions from POST /api/ai/suggest-doctor
 * for the symptoms carried from the assistant. Per-doctor "% match" is a documented future
 * backend enhancement (the endpoint returns no score), so it is omitted rather than faked.
 */
export default function AiRecommendationsScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { symptoms: rawSymptoms } = useLocalSearchParams<{ symptoms?: string }>();
  const symptoms = String(rawSymptoms ?? "");

  const query = useSuggestedDoctors(symptoms);
  const [openWhy, setOpenWhy] = useState<string | null>(null);

  const metaLine = (m: AiSuggestedDoctor) =>
    num(
      [m.rating != null ? `★ ${m.rating.toFixed(1)}` : null, m.fee_omr != null ? `OMR ${m.fee_omr}` : null]
        .filter(Boolean)
        .join(" · ")
    );

  const reasoning = query.data?.reasoning;
  const doctors = query.data?.doctors ?? [];

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
    >
      <AppHeader title={t("aiRecommend.title")} showBack right={<MeMark height={16} color={colors.primary} />} />

      {!symptoms ? (
        <EmptyState title={t("aiRecommend.needSymptomsTitle")} body={t("aiRecommend.needSymptomsBody")} />
      ) : query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={t("aiRecommend.loadError")} onRetry={() => query.refetch()} />
      ) : (
        <>
          {reasoning ? (
            <AppCard variant="detail" style={{ marginBottom: spacing.lg }}>
              <Text variant="label" color="textMuted" align={isRTL ? "right" : "left"}>{t("aiRecommend.basedOn")}</Text>
              <Text variant="body" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.xs }}>{reasoning}</Text>
            </AppCard>
          ) : null}

          <Text variant="title" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.sm }}>
            {t("aiRecommend.topMatches")}
          </Text>

          {doctors.length === 0 ? (
            <EmptyState title={t("aiRecommend.needSymptomsTitle")} body={t("aiRecommend.loadError")} />
          ) : (
            doctors.map((m) => {
              const isOpen = openWhy === m.id;
              return (
                <Card key={m.id} style={{ marginBottom: spacing.md }}>
                  <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Avatar name={m.full_name} size={52} />
                    <View style={[styles.flex, isRTL ? { marginEnd: spacing.md } : { marginStart: spacing.md }]}>
                      <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{m.full_name}</Text>
                      {m.specialty ? (
                        <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>{m.specialty}</Text>
                      ) : null}
                      {metaLine(m) ? (
                        <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: 2 }}>{metaLine(m)}</Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.md }]}>
                    <Button label={t("aiRecommend.bookNow")} onPress={() => router.push(`/doctors/${m.id}`)} style={styles.flex} />
                    {reasoning ? (
                      <>
                        <View style={{ width: spacing.sm }} />
                        <Button
                          label={t("aiRecommend.why")}
                          variant="ghost"
                          onPress={() => setOpenWhy((prev) => (prev === m.id ? null : m.id))}
                        />
                      </>
                    ) : null}
                  </View>

                  {isOpen && reasoning ? (
                    <View style={[styles.why, { backgroundColor: colors.surfaceAlt, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm }]}>
                      <Text variant="label" align={isRTL ? "right" : "left"}>{t("aiRecommend.whyTitle")}</Text>
                      <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.xs }}>{reasoning}</Text>
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center" },
  flex: { flex: 1 },
  actions: { alignItems: "center" },
  why: { width: "100%" },
});
