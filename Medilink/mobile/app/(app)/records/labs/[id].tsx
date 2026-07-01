import React, { useEffect } from "react";
import { Alert, Linking, Share, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  MeMark,
  Screen,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useLabResult, useLabResultSignedUrl, useMarkLabViewed } from "@/hooks/queries/useLabs";
import { formatDayMonth } from "@/utils/appointments";
import type { LabFlag } from "@/data/types";

/** Result Trends & Detail (design p30). */
export default function LabDetailScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const id = String(rawId ?? "");

  const query = useLabResult(id);
  const detail = query.data;
  const url = useLabResultSignedUrl(detail?.storage_path ?? detail?.file_url);
  const markViewed = useMarkLabViewed();

  const rowDir = isRTL ? "row-reverse" : "row";

  // Mark the report viewed once it has loaded.
  useEffect(() => {
    if (detail?.id) markViewed.mutate(detail.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id]);

  const onDownload = () => {
    if (url.data) Linking.openURL(url.data).catch(() => Alert.alert(t("labs.downloadError")));
  };
  const onShare = () => {
    if (url.data) Share.share({ message: url.data, url: url.data }).catch(() => {});
  };

  const pillTones = (flag: LabFlag): { bg: string; fg: string; label: string } => {
    if (flag === "high") return { bg: colors.errorSurface, fg: colors.error, label: t("labs.high") };
    if (flag === "abnormal") return { bg: colors.errorSurface, fg: colors.error, label: t("labs.abnormal") };
    if (flag === "low") return { bg: colors.warning, fg: colors.textOnPrimary, label: t("labs.low") };
    return { bg: colors.successSurface, fg: colors.success, label: t("labs.ok") };
  };

  if (query.isLoading) {
    return (
      <Screen padded>
        <AppHeader title={t("labs.title")} showBack />
        <LoadingState />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen padded>
        <AppHeader title={t("labs.title")} showBack />
        <ErrorState message={t("labs.loadError")} onRetry={() => query.refetch()} />
      </Screen>
    );
  }
  if (!detail) {
    return (
      <Screen padded>
        <AppHeader title={t("labs.title")} showBack />
        <EmptyState title={t("labs.notFoundTitle")} body={t("labs.notFoundBody")} />
      </Screen>
    );
  }

  const dateLabel = formatDayMonth(detail.result_date ?? detail.uploaded_at, t, num, { year: true });
  const subtitle = [detail.facility_name, dateLabel].filter(Boolean).join(" · ");

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right"]}
      contentStyle={{
        maxWidth: contentMaxWidth,
        width: "100%",
        alignSelf: "center",
        paddingBottom: spacing.xxl,
      }}
      footer={
        <View style={[styles.footerRow, { flexDirection: rowDir }]}>
          <Button
            label={t("labs.share")}
            variant="outline"
            leading={<Icon name="share" size={18} color="primary" />}
            onPress={onShare}
            disabled={!url.data}
            style={styles.footerBtn}
          />
          <Button
            label={t("labs.downloadPdf")}
            variant="primary"
            onPress={onDownload}
            loading={url.isLoading}
            disabled={!url.data}
            style={styles.footerBtn}
          />
        </View>
      }
    >
      <AppHeader title={detail.test_name} showBack />

      <Card style={styles.headerCard}>
        <View style={[styles.headerRow, { flexDirection: rowDir }]}>
          <View style={styles.headerInfo}>
            <Text variant="h2">{detail.test_name}</Text>
            <Text variant="caption" color="textMuted">
              {subtitle}
            </Text>
          </View>
          {detail.flagged_count > 0 ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: colors.errorSurface, borderRadius: radii.pill },
              ]}
            >
              <Text variant="caption" style={{ color: colors.error }}>
                {t("labs.statusFlagged", { n: num(String(detail.flagged_count)) })}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>

      {detail.analytes.length > 0 ? (
        <Card style={styles.analytesCard}>
          {detail.analytes.map((a, i) => {
            const tones = pillTones(a.flag);
            const value = a.value_text ?? (a.value_numeric != null ? String(a.value_numeric) : "");
            return (
              <View
                key={a.id}
                style={[
                  styles.analyteRow,
                  { flexDirection: rowDir },
                  i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null,
                ]}
              >
                <View style={styles.analyteInfo}>
                  <Text variant="body" numberOfLines={1}>
                    {a.analyte_name}
                  </Text>
                  {a.reference_text ? (
                    <Text variant="caption" color="textMuted">
                      {t("labs.reference", { range: a.reference_text })}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.analyteRight, { flexDirection: rowDir }]}>
                  <Text variant="title">{value ? num(value) : "—"}</Text>
                  <View
                    style={[
                      styles.pill,
                      { backgroundColor: tones.bg, borderRadius: radii.pill },
                    ]}
                  >
                    <Text variant="caption" style={{ color: tones.fg }}>
                      {tones.label}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      {detail.ai_insight ? (
        <Card style={[styles.insightCard, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.insightHead, { flexDirection: rowDir }]}>
            <MeMark height={16} color={colors.primary} />
            <Text variant="label" color="primary" style={styles.insightLabel}>
              {t("labs.insightLabel")}
            </Text>
          </View>
          <Text variant="body" color="text">
            {detail.ai_insight}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerCard: { marginBottom: 12 },
  headerRow: { alignItems: "center" },
  headerInfo: { flex: 1, gap: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 8 },
  analytesCard: { marginBottom: 12, paddingVertical: 0 },
  analyteRow: { alignItems: "center", paddingVertical: 14 },
  analyteInfo: { flex: 1, gap: 2 },
  analyteRight: { alignItems: "center", gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 3 },
  insightCard: { gap: 8 },
  insightHead: { alignItems: "center", gap: 8 },
  insightLabel: {},
  footerRow: { gap: 12 },
  footerBtn: { flex: 1 },
});
