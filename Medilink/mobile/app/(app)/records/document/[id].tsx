import React from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AppHeader, Button, Icon, Screen, SummaryCard, Text } from "@/components/ui";
import type { SummaryRow } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

interface DocumentMeta {
  name: string;
  type: string;
  uploaded: string;
  source: string;
  size: string;
}

const DOCUMENTS: Record<string, DocumentMeta> = {
  "blood-test": {
    name: "Blood test — CBC",
    type: "PDF",
    uploaded: "2 May 2026",
    source: "Royal Hospital",
    size: "240 KB",
  },
  "chest-xray": {
    name: "Chest X-Ray",
    type: "JPG",
    uploaded: "28 Apr 2026",
    source: "Royal Hospital Radiology",
    size: "1.2 MB",
  },
};

/** Document Preview (design p29). Static — preview placeholder + metadata. */
export default function DocumentPreviewScreen() {
  const { colors, spacing, radii } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const doc = (id && DOCUMENTS[id]) || DOCUMENTS["chest-xray"]!;

  const rows: SummaryRow[] = [
    { label: t("docPreview.uploaded"), value: doc.uploaded },
    { label: t("docPreview.source"), value: doc.source },
    { label: t("docPreview.size"), value: doc.size },
  ];

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
      footer={
        <View style={styles.footer}>
          <Button
            variant="outline"
            label={t("docPreview.share")}
            leading={<Icon name="share" size={18} color="primary" />}
            style={styles.footerBtn}
          />
          <Button label={t("docPreview.download")} style={styles.footerBtn} />
        </View>
      }
    >
      <AppHeader title={doc.name} showBack />

      {/* Preview placeholder (~4:3). */}
      <View
        style={[
          styles.preview,
          { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg },
        ]}
      >
        <Icon name="document" size={40} color="textMuted" />
        <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
          {t("docPreview.previewLabel", { type: doc.type })}
        </Text>
      </View>

      <View style={{ height: spacing.lg }} />
      <SummaryCard rows={rows} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: "100%",
    aspectRatio: 4 / 3,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { flexDirection: "row", gap: 12 },
  footerBtn: { flex: 1 },
});
