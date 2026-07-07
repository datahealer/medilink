import React from "react";
import { Alert, Image, Linking, Share, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppHeader, Button, EmptyState, ErrorState, Icon, LoadingState, Screen, SummaryCard, Text } from "@/components/ui";
import type { SummaryRow } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useDocument, useDocumentSignedUrl, useDeleteDocument } from "@/hooks/queries/useRecords";
import { formatApptDate } from "@/utils/appointments";

function extLabel(fileType: string): string {
  if (/pdf/i.test(fileType)) return "PDF";
  const sub = fileType.split("/")[1];
  return sub ? sub.toUpperCase() : "FILE";
}
function sizeLabel(bytes: number | null | undefined, num: (s: string) => string): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${num(String(Math.round(bytes / 1024)))} KB`;
  return `${num((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

/** Document Preview (design p29) — signed-URL preview + metadata, share/download, delete. */
export default function DocumentPreviewScreen() {
  const { colors, spacing, radii } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const id = String(rawId ?? "");

  const query = useDocument(id);
  const doc = query.data;
  const url = useDocumentSignedUrl(doc?.file_url);
  const del = useDeleteDocument();

  const isImage = doc ? /^image\//i.test(doc.file_type) : false;

  const onDownload = () => {
    if (url.data) Linking.openURL(url.data).catch(() => Alert.alert(t("docPreview.loadError")));
  };
  const onShare = () => {
    if (url.data) Share.share({ message: url.data, url: url.data }).catch(() => {});
  };
  const onDelete = () => {
    Alert.alert(t("docPreview.deleteTitle"), t("docPreview.deleteMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("docPreview.delete"),
        style: "destructive",
        onPress: () =>
          del.mutate(id, {
            onSuccess: () => router.back(),
            onError: (e) => Alert.alert(t("docPreview.deleteFailed"), e instanceof Error ? e.message : String(e)),
          }),
      },
    ]);
  };

  if (query.isLoading) {
    return (
      <Screen padded>
        <AppHeader title={t("records.vaultTitle")} showBack />
        <LoadingState />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen padded>
        <AppHeader title={t("records.vaultTitle")} showBack />
        <ErrorState message={t("docPreview.loadError")} onRetry={() => query.refetch()} />
      </Screen>
    );
  }
  if (!doc) {
    return (
      <Screen padded>
        <AppHeader title={t("records.vaultTitle")} showBack />
        <EmptyState title={t("docPreview.notFoundTitle")} body={t("docPreview.notFoundBody")} />
      </Screen>
    );
  }

  const rows: SummaryRow[] = [
    { label: t("docPreview.uploaded"), value: formatApptDate(doc.uploaded_at?.slice(0, 10) ?? null, t, num) || "—" },
    { label: t("docPreview.type"), value: extLabel(doc.file_type) },
    ...(sizeLabel(doc.size_bytes, num) ? [{ label: t("docPreview.size"), value: sizeLabel(doc.size_bytes, num)! }] : []),
  ];

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <View style={styles.footer}>
            <Button
              variant="outline"
              label={t("docPreview.share")}
              leading={<Icon name="share" size={18} color="primary" />}
              onPress={onShare}
              disabled={!url.data}
              style={styles.footerBtn}
            />
            <Button
              label={isImage ? t("docPreview.download") : t("docPreview.open")}
              onPress={onDownload}
              disabled={!url.data}
              loading={url.isLoading}
              style={styles.footerBtn}
            />
          </View>
          <Button
            variant="ghost"
            label={t("docPreview.delete")}
            onPress={onDelete}
            loading={del.isPending}
            leading={<Icon name="close" size={16} color="error" />}
          />
        </View>
      }
    >
      <AppHeader title={doc.name} showBack />

      {/* Preview: real image via signed URL, else a typed placeholder. */}
      <View style={[styles.preview, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg }]}>
        {isImage && url.data ? (
          <Image source={{ uri: url.data }} style={styles.image} resizeMode="cover" accessibilityLabel={doc.name} />
        ) : (
          <>
            <Icon name="document" size={40} color="textMuted" />
            <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
              {t("docPreview.previewLabel", { type: extLabel(doc.file_type) })}
            </Text>
          </>
        )}
      </View>

      <View style={{ height: spacing.lg }} />
      <SummaryCard rows={rows} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { width: "100%", aspectRatio: 4 / 3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  footer: { flexDirection: "row", gap: 12 },
  footerBtn: { flex: 1 },
});
