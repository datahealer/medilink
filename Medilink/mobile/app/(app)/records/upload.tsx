import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { AppHeader, Button, Chip, Icon, Screen, Text } from "@/components/ui";
import type { IconName } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { useUploadDocument } from "@/hooks/queries/useRecords";
import type { DocumentType, PhotoAsset } from "@/data/types";

interface UploadChoice {
  key: "file" | "scan";
  labelKey: MessageKey;
  icon: IconName;
}

/** Design category chips → backend `document_type`. "Vaccination" has no enum value
 *  yet, so it records as `other` (documented backend gap). */
const CATEGORIES: { key: DocumentType; labelKey: MessageKey }[] = [
  { key: "prescription", labelKey: "upload.catPrescription" },
  { key: "report", labelKey: "upload.catLabReport" },
  { key: "imaging", labelKey: "upload.catImaging" },
  { key: "other", labelKey: "upload.catVaccination" },
];

const CHOICES: UploadChoice[] = [
  { key: "file", labelKey: "upload.uploadFile", icon: "upload" },
  { key: "scan", labelKey: "upload.scanCamera", icon: "scan" },
];

/** Add document (design p28) — pick a file/scan, choose a category, upload to the vault. */
export default function UploadDocumentScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();
  const upload = useUploadDocument();

  const [source, setSource] = useState<"file" | "scan" | null>(null);
  const [asset, setAsset] = useState<PhotoAsset | null>(null);
  const [category, setCategory] = useState<DocumentType | null>(null);
  const rowDir = isRTL ? "row-reverse" : "row";

  const toAsset = (a: ImagePicker.ImagePickerAsset): PhotoAsset => ({
    uri: a.uri,
    name: a.fileName ?? undefined,
    mimeType: a.mimeType ?? "image/jpeg",
  });

  const pick = async (choice: "file" | "scan") => {
    setSource(choice);
    if (choice === "scan") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert(t("upload.permissionTitle"), t("upload.cameraPermission"));
      const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!res.canceled && res.assets[0]) setAsset(toAsset(res.assets[0]));
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert(t("upload.permissionTitle"), t("upload.libraryPermission"));
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (!res.canceled && res.assets[0]) setAsset(toAsset(res.assets[0]));
    }
  };

  const onUpload = () => {
    if (!category || !asset) return;
    upload.mutate(
      { name: asset.name ?? t("upload.defaultName"), type: category, asset },
      {
        onSuccess: () => {
          Alert.alert(t("upload.uploadSuccess"));
          router.back();
        },
        onError: (e) => Alert.alert(t("upload.uploadFailed"), e instanceof Error ? e.message : String(e)),
      }
    );
  };

  const choiceCard = (c: UploadChoice) => {
    const active = source === c.key;
    return (
      <Pressable
        key={c.key}
        onPress={() => pick(c.key)}
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
        <View style={[styles.choiceTile, { backgroundColor: colors.accent2, borderRadius: radii.md }]}>
          <Icon name={c.icon} size={24} color="primary" />
        </View>
        <Text variant="title" align="center" style={{ marginTop: spacing.sm }}>{t(c.labelKey)}</Text>
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
          disabled={!category || !asset}
          loading={upload.isPending}
          onPress={onUpload}
        />
      }
    >
      <AppHeader title={t("upload.title")} showBack />

      <View style={[styles.choices, { flexDirection: rowDir }]}>{CHOICES.map(choiceCard)}</View>

      {/* Category */}
      <Text variant="label" color="textMuted" style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
        {t("upload.category")}
      </Text>
      <View style={[styles.chips, { flexDirection: rowDir }]}>
        {CATEGORIES.map((c) => (
          <Chip key={c.key} label={t(c.labelKey)} selected={category === c.key} onPress={() => setCategory(c.key)} />
        ))}
      </View>

      {/* File row */}
      <View
        style={[
          styles.fileRow,
          { flexDirection: rowDir, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.xl },
        ]}
      >
        <Text variant="label" color="textMuted">{t("upload.fileLabel")}</Text>
        <Text variant="body" align={isRTL ? "left" : "right"} numberOfLines={1} style={styles.fileValue}>
          {asset ? asset.name ?? t("upload.fileSelected") : t("upload.noFile")}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: { gap: 12, marginTop: 8 },
  choice: { flex: 1, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  choiceTile: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  chips: { flexWrap: "wrap", gap: 8 },
  fileRow: { alignItems: "center", justifyContent: "space-between", borderWidth: 1 },
  fileValue: { flex: 1, marginStart: 12 },
});
