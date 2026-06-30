import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Button, Chip, Icon, Screen, Text } from "@/components/ui";
import type { IconName } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";

interface UploadChoice {
  key: string;
  labelKey: MessageKey;
  icon: IconName;
}

interface UploadCategory {
  key: string;
  labelKey: MessageKey;
}

const CHOICES: UploadChoice[] = [
  { key: "file", labelKey: "upload.uploadFile", icon: "upload" },
  { key: "scan", labelKey: "upload.scanCamera", icon: "scan" },
];

const CATEGORIES: UploadCategory[] = [
  { key: "prescription", labelKey: "upload.catPrescription" },
  { key: "labReport", labelKey: "upload.catLabReport" },
  { key: "imaging", labelKey: "upload.catImaging" },
  { key: "vaccination", labelKey: "upload.catVaccination" },
];

/** Add document (design p28). Static — picks a source + category, then router.back(). */
export default function UploadDocumentScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();

  const [picked, setPicked] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const rowDir = isRTL ? "row-reverse" : "row";

  const choiceCard = (c: UploadChoice) => {
    const active = picked === c.key;
    return (
      <Pressable
        key={c.key}
        onPress={() => setPicked(c.key)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [
          styles.choice,
          {
            backgroundColor: active ? colors.primaryMuted : colors.surface,
            borderColor: active ? colors.primary : colors.border,
            borderRadius: radii.lg,
            padding: spacing.lg,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.choiceTile,
            { backgroundColor: colors.accent2, borderRadius: radii.md },
          ]}
        >
          <Icon name={c.icon} size={24} color="primary" />
        </View>
        <Text variant="title" align="center" style={{ marginTop: spacing.sm }}>
          {t(c.labelKey)}
        </Text>
      </Pressable>
    );
  };

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
      footer={
        <Button
          label={t("upload.upload")}
          disabled={!category}
          onPress={() => router.back()}
        />
      }
    >
      <AppHeader title={t("upload.title")} showBack />

      <View style={[styles.choices, { flexDirection: rowDir }]}>
        {CHOICES.map(choiceCard)}
      </View>

      {/* Category */}
      <Text variant="label" color="textMuted" style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
        {t("upload.category")}
      </Text>
      <View style={[styles.chips, { flexDirection: rowDir }]}>
        {CATEGORIES.map((c) => (
          <Chip
            key={c.key}
            label={t(c.labelKey)}
            selected={category === c.key}
            onPress={() => setCategory(c.key)}
          />
        ))}
      </View>

      {/* File row */}
      <View
        style={[
          styles.fileRow,
          {
            flexDirection: rowDir,
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
            borderRadius: radii.md,
            padding: spacing.md,
            marginTop: spacing.xl,
          },
        ]}
      >
        <Text variant="label" color="textMuted">{t("upload.fileLabel")}</Text>
        <Text variant="body" align={isRTL ? "left" : "right"} style={styles.fileValue}>
          {picked ? t("upload.fileSelected") : t("upload.noFile")}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: {
    gap: 12,
    marginTop: 8,
  },
  choice: {
    flex: 1,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceTile: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: {
    flexWrap: "wrap",
    gap: 8,
  },
  fileRow: {
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
  },
  fileValue: { flex: 1, marginStart: 12 },
});
