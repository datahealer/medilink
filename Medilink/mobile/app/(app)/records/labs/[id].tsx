import React, { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
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
  TrendChart,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useAnalyteTrend, useLabResult, useLabResultSignedUrl, useMarkLabViewed } from "@/hooks/queries/useLabs";
import { formatDayMonth } from "@/utils/appointments";
import { shareRemoteFile } from "@/utils/shareFile";
import type { LabAnalyte, LabFlag } from "@/data/types";

/** One analyte row with an expandable, real trend chart (fetched on demand). */
function AnalyteTrendRow({ analyte, first }: { analyte: LabAnalyte; first: boolean }) {
  const { colors, radii, isRTL } = useTheme();
  const { t, num } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const rowDir = isRTL ? "row-reverse" : "row";

  const isNumeric = analyte.value_numeric != null;
  // Fetch the trend only when this row is expanded (avoids an N+1 on load).
  const trend = useAnalyteTrend(expanded ? analyte.analyte_code : undefined);
  const points = (trend.data ?? [])
    .filter((p) => p.value_numeric != null)
    .map((p) => ({ value: p.value_numeric as number }));
  const vmin = points.length ? Math.min(...points.map((p) => p.value)) : 0;
  const vmax = points.length ? Math.max(...points.map((p) => p.value)) : 0;

  const pillTones = (flag: LabFlag): { bg: string; fg: string; label: string } => {
    if (flag === "high") return { bg: colors.errorSurface, fg: colors.error, label: t("labs.high") };
    if (flag === "abnormal") return { bg: colors.errorSurface, fg: colors.error, label: t("labs.abnormal") };
    if (flag === "low") return { bg: colors.warning, fg: colors.textOnPrimary, label: t("labs.low") };
    return { bg: colors.successSurface, fg: colors.success, label: t("labs.ok") };
  };
  const tones = pillTones(analyte.flag);
  const value = analyte.value_text ?? (analyte.value_numeric != null ? String(analyte.value_numeric) : "");

  return (
    <View
      style={first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}
    >
      <View style={[styles.analyteRow, { flexDirection: rowDir }]}>
        <View style={styles.analyteInfo}>
          <Text variant="body" numberOfLines={1}>
            {analyte.analyte_name}
          </Text>
          {analyte.reference_text ? (
            <Text variant="caption" color="textMuted">
              {t("labs.reference", { range: analyte.reference_text })}
            </Text>
          ) : null}
        </View>
        <View style={[styles.analyteRight, { flexDirection: rowDir }]}>
          <Text variant="title">{value ? num(value) : "—"}</Text>
          <View style={[styles.pill, { backgroundColor: tones.bg, borderRadius: radii.pill }]}>
            <Text variant="caption" style={{ color: tones.fg }}>
              {tones.label}
            </Text>
          </View>
        </View>
      </View>

      {isNumeric ? (
        <Pressable
          onPress={() => setExpanded((e) => !e)}
          accessibilityRole="button"
          hitSlop={6}
          style={[styles.trendToggle, { flexDirection: rowDir }]}
        >
          <Icon name="lab" size={14} tint={colors.primary} />
          <Text variant="caption" color="primary" style={isRTL ? { marginEnd: 6 } : { marginStart: 6 }}>
            {expanded ? t("labs.trendHide") : t("labs.trendShow")}
          </Text>
        </Pressable>
      ) : null}

      {expanded ? (
        <View style={styles.trendBox}>
          {trend.isLoading ? (
            <LoadingState />
          ) : points.length >= 2 ? (
            <>
              <TrendChart points={points} />
              <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"}>
                {t("labs.trendRange", { min: num(String(vmin)), max: num(String(vmax)) })}
              </Text>
            </>
          ) : (
            <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"}>
              {t("labs.trendEmpty")}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

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
    // Share the actual report file (downloaded from the signed URL), not a link.
    if (url.data) {
      void shareRemoteFile(url.data, {
        filename: "lab-result.pdf",
        mimeType: "application/pdf",
        dialogTitle: t("labs.share"),
      });
    }
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
          {detail.analytes.map((a, i) => (
            <AnalyteTrendRow key={a.id} analyte={a} first={i === 0} />
          ))}
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
  trendToggle: { alignItems: "center", paddingBottom: 12, marginTop: -4 },
  trendBox: { paddingBottom: 14, gap: 6 },
  insightCard: { gap: 8 },
  insightHead: { alignItems: "center", gap: 8 },
  insightLabel: {},
  footerRow: { gap: 12 },
  footerBtn: { flex: 1 },
});
