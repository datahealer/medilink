import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppCard, AppHeader, Avatar, Button, Card, MeMark, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

type Match = {
  id: string;
  name: string;
  specialty: string;
  pct: number;
  rating: string;
  fee: string;
};

const MATCHES: readonly Match[] = [
  { id: "doc-khalid", name: "Dr. Khalid Al Balushi", specialty: "Cardiologist", pct: 96, rating: "4.9", fee: "25" },
  { id: "doc-fatma", name: "Dr. Fatma Said", specialty: "Cardiologist", pct: 91, rating: "4.7", fee: "22" },
];

/** AI Recommendations (design p27) — reasoning card + static doctor match cards. */
export default function AiRecommendationsScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const [openWhy, setOpenWhy] = useState<string | null>(null);

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
    >
      <AppHeader
        title={t("aiRecommend.title")}
        showBack
        right={<MeMark height={16} color={colors.primary} />}
      />

      <AppCard variant="detail" style={{ marginBottom: spacing.lg }}>
        <Text variant="label" color="textMuted" align={isRTL ? "right" : "left"}>
          {t("aiRecommend.basedOn")}
        </Text>
        <Text variant="body" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.xs }}>
          {t("aiRecommend.reasoning")}
        </Text>
      </AppCard>

      <Text variant="title" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.sm }}>
        {t("aiRecommend.topMatches")}
      </Text>

      {MATCHES.map((m) => {
        const isOpen = openWhy === m.id;
        return (
          <Card key={m.id} style={{ marginBottom: spacing.md }}>
            <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Avatar name={m.name} size={52} />
              <View style={[styles.flex, isRTL ? { marginEnd: spacing.md } : { marginStart: spacing.md }]}>
                <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>
                  {m.name}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>
                  {m.specialty} · {t("aiRecommend.match", { pct: num(String(m.pct)) })}
                </Text>
                <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: 2 }}>
                  {num(`★ ${m.rating} · OMR ${m.fee}`)}
                </Text>
              </View>
            </View>

            <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.md }]}>
              <Button
                label={t("aiRecommend.bookNow")}
                onPress={() => router.push(`/doctors/${m.id}`)}
                style={styles.flex}
              />
              <View style={{ width: spacing.sm }} />
              <Button
                label={t("aiRecommend.why")}
                variant="ghost"
                onPress={() => setOpenWhy((prev) => (prev === m.id ? null : m.id))}
              />
            </View>

            {isOpen ? (
              <View
                style={[
                  styles.why,
                  { backgroundColor: colors.surfaceAlt, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm },
                ]}
              >
                <Text variant="label" align={isRTL ? "right" : "left"}>
                  {t("aiRecommend.whyTitle")}
                </Text>
                <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.xs }}>
                  {t("aiRecommend.whyBody")}
                </Text>
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center" },
  flex: { flex: 1 },
  actions: { alignItems: "center" },
  why: { width: "100%" },
});
