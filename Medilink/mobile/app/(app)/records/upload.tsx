import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import { AppHeader, Button, Chip, Icon, Screen, Text } from "@/components/ui";
import type { IconName } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { useUploadDocument } from "@/hooks/queries/useRecords";
import { mimeFromName } from "@/utils/mime";
import {
  MAX_UPLOAD_LABEL,
  PICKER_TYPES,
  effectiveMime,
  isPickerBusyError,
  validateUploadAsset,
} from "@/utils/documentUpload";
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
  const { t, num } = useI18n();
  const upload = useUploadDocument();

  const [source, setSource] = useState<"file" | "scan" | null>(null);
  const [asset, setAsset] = useState<PhotoAsset | null>(null);
  const [category, setCategory] = useState<DocumentType | null>(null);
  // In-flight guard. Both picker modules throw `PickingInProgressException` when a pick
  // is already open, and that rejection used to be swallowed — so a second tap left the
  // button permanently dead from the user's point of view.
  const [picking, setPicking] = useState<"file" | "scan" | null>(null);
  // Guards the one-shot Android pending-capture claim below.
  const claimedPendingRef = useRef(false);
  const rowDir = isRTL ? "row-reverse" : "row";

  const toAsset = useCallback(
    (a: ImagePicker.ImagePickerAsset): PhotoAsset => ({
      uri: a.uri,
      name: a.fileName ?? undefined,
      mimeType: a.mimeType ?? mimeFromName(a.fileName ?? a.uri),
      size: a.fileSize ?? null,
    }),
    []
  );

  /**
   * Validate a picked asset before it can be uploaded. Returns true when accepted;
   * otherwise alerts and returns false. Never throws.
   */
  const accept = useCallback(
    (a: PhotoAsset): boolean => {
      const rejection = validateUploadAsset(a);
      if (rejection === "unsupported") {
        Alert.alert(t("upload.unsupportedTitle"), t("upload.unsupported"));
        return false;
      }
      if (rejection === "tooLarge") {
        Alert.alert(t("upload.tooLargeTitle"), t("upload.tooLarge", { limit: MAX_UPLOAD_LABEL }));
        return false;
      }
      // Persist the resolved MIME so the upload sends a correct Content-Type even when
      // the picker didn't supply one.
      setAsset({ ...a, mimeType: effectiveMime(a) });
      return true;
    },
    [t]
  );

  /**
   * ANDROID CAMERA RECOVERY — the fix for "the app closed after I scanned".
   *
   * Android may destroy the host Activity while the camera is in the foreground (it is a
   * memory-hungry foreground app; in Expo Go the host is Expo Go itself, which makes this
   * far more likely). When that happens the `launchCameraAsync` promise NEVER resolves,
   * the JS context is torn down and rebuilt, and to the user the app simply vanished and
   * lost their capture.
   *
   * expo-image-picker stashes the result for exactly this case and requires the app to
   * claim it — see the `getPendingResultAsync` note in its own docs ("Make sure that you
   * handle MainActivity destruction on Android"). MediLink never called it, so every
   * interrupted scan was lost. Reproduce deterministically with Developer options →
   * "Don't keep activities".
   *
   * Resolves to `null` on iOS, so this is a no-op there.
   *
   * Claimed at most once per mount: `t` is locale-stable, but switching language while on
   * this screen would otherwise re-run the effect. The native module does null its pending
   * state on read, so a second call is already harmless — the ref makes that independent
   * of native behaviour rather than relying on it.
   */
  useEffect(() => {
    if (Platform.OS !== "android" || claimedPendingRef.current) return;
    claimedPendingRef.current = true;
    let alive = true;
    (async () => {
      try {
        const pending = await ImagePicker.getPendingResultAsync();
        if (!alive || !pending) return;
        // `ImagePickerErrorResult` has no `canceled` field — nothing recoverable.
        if (!("canceled" in pending) || pending.canceled) return;
        const first = pending.assets?.[0];
        if (!first) return;
        setSource("scan");
        if (accept(toAsset(first))) {
          Alert.alert(t("upload.recoveredTitle"), t("upload.recoveredBody"));
        }
      } catch {
        // Nothing to recover, or the module has no pending state. Never surfaced —
        // this path runs on every mount and has no user-visible intent.
      }
    })();
    return () => {
      alive = false;
    };
  }, [accept, toAsset, t]);

  /** Camera permission, including the "permanently denied" case. */
  const ensureCamera = useCallback(async (): Promise<boolean> => {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) {
      // Denied for good — a re-request is a silent no-op, so send them to Settings.
      Alert.alert(t("upload.permissionTitle"), t("upload.cameraBlocked"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("upload.openSettings"), onPress: () => void Linking.openSettings() },
      ]);
      return false;
    }
    const asked = await ImagePicker.requestCameraPermissionsAsync();
    if (asked.granted) return true;
    Alert.alert(t("upload.permissionTitle"), t("upload.cameraPermission"));
    return false;
  }, [t]);

  /**
   * Open a picker. Every failure path is now surfaced: this used to be a floating async
   * call from `onPress`, so ANY rejection (native module unavailable, picker already
   * open, unreadable document) disappeared into an unhandled promise rejection and the
   * button looked inert. Cancellation stays a deliberate silent no-op.
   */
  const pick = useCallback(
    async (choice: "file" | "scan") => {
      if (picking) return; // a picker is already opening/open
      setPicking(choice);
      setSource(choice);
      try {
        if (choice === "scan") {
          if (!(await ensureCamera())) return;
          const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
          if (res.canceled) return;
          const first = res.assets?.[0];
          if (first) accept(toAsset(first));
        } else {
          // Documents (PDF) + images. Needs no runtime permission and preserves the real
          // name/MIME/size; MIME falls back via the shared mimeFromName().
          const res = await DocumentPicker.getDocumentAsync({
            type: PICKER_TYPES,
            copyToCacheDirectory: true,
            multiple: false,
          });
          if (res.canceled) return;
          const a = res.assets?.[0];
          if (a) {
            accept({
              uri: a.uri,
              name: a.name ?? undefined,
              mimeType: a.mimeType ?? mimeFromName(a.name ?? a.uri),
              size: a.size ?? null,
            });
          }
        }
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        Alert.alert(
          choice === "scan" ? t("upload.scanFailedTitle") : t("upload.pickFailedTitle"),
          isPickerBusyError(detail) ? t("upload.pickerBusy") : detail
        );
      } finally {
        setPicking(null);
      }
    },
    [picking, ensureCamera, accept, toAsset, t]
  );

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
    const busy = picking === c.key;
    return (
      <Pressable
        key={c.key}
        onPress={() => void pick(c.key)}
        disabled={picking !== null}
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled: picking !== null, busy }}
        style={({ pressed }) => [
          styles.choice,
          {
            backgroundColor: active ? colors.primaryMuted : colors.surface,
            borderColor: active ? colors.primary : colors.border,
            borderRadius: radii.lg,
            padding: spacing.lg,
            opacity: pressed || (picking !== null && !busy) ? 0.92 : 1,
          },
        ]}
      >
        <View style={[styles.choiceTile, { backgroundColor: colors.accent2, borderRadius: radii.md }]}>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Icon name={c.icon} size={24} color="primary" />}
        </View>
        <Text variant="title" align="center" style={{ marginTop: spacing.sm }}>{t(c.labelKey)}</Text>
      </Pressable>
    );
  };

  const sizeSuffix =
    asset?.size != null ? ` · ${num((asset.size / (1024 * 1024)).toFixed(1))} MB` : "";

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
      footer={
        <View style={{ gap: 6 }}>
          <Button
            label={t("upload.upload")}
            disabled={!category || !asset}
            loading={upload.isPending}
            onPress={onUpload}
          />
          {asset && !category ? (
            <Text variant="caption" color="textMuted" align="center">{t("upload.selectCategory")}</Text>
          ) : null}
        </View>
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
        <Text variant="body" align={isRTL ? "left" : "right"} numberOfLines={1} style={[styles.fileValue, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
          {asset ? `${asset.name ?? t("upload.fileSelected")}${sizeSuffix}` : t("upload.noFile")}
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
  fileValue: { flex: 1 },
});
