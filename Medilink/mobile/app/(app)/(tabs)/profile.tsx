import React, { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  Avatar,
  Button,
  Card,
  Chip,
  ErrorState,
  Icon,
  LoadingState,
  Screen,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useProfile, useMedicalHistory } from "@/hooks/queries/usePatient";
import { useFamily } from "@/hooks/queries/useFamily";
import { localizedName } from "@/utils/localizedName";

function ageFrom(dob?: string | null): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? String(age) : null;
}

/**
 * Personal Information (PDF p15): identity, vitals and key medical facts. Sign out
 * lives in Settings (reached via the gear), matching the design — not on this screen.
 */
export default function ProfileScreen() {
  const { spacing, colors, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const profile = useProfile();
  const history = useMedicalHistory();
  const family = useFamily();
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [civilRevealed, setCivilRevealed] = useState(false);

  if (profile.isLoading) {
    return (
      <Screen padded edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <Screen padded edges={["top", "left", "right"]}>
        <ErrorState message={t("profile.loadError")} onRetry={() => profile.refetch()} />
      </Screen>
    );
  }

  const account = profile.data.account;
  const patient = profile.data.patient;
  const displayName = localizedName(account?.full_name ?? "—", account?.full_name_ar, account?.full_name_ar_status, isRTL);
  const age = ageFrom(patient?.date_of_birth);
  const allergies = history.data?.allergies ?? [];
  const conditions = history.data?.conditions ?? [];
  const medications = history.data?.medications ?? [];

  const civil = patient?.civil_number ?? null;
  // Mask all but the last 2 digits (e.g. "••••••78"); tap to reveal.
  const maskedCivil = civil ? "•".repeat(Math.max(0, civil.length - 2)) + civil.slice(-2) : null;

  const hasBlood = !!patient?.blood_group && patient.blood_group !== "unknown";
  const stats: { label: string; value: string; pill?: boolean }[] = [
    { label: t("profile.bloodGroup"), value: hasBlood ? patient!.blood_group! : t("common.notSet"), pill: hasBlood },
    { label: t("profile.age"), value: age ? `${age} ${t("profile.years")}` : t("common.notSet") },
    { label: t("profile.family"), value: String(family.data?.length ?? 0) },
  ];

  return (
    <Screen scroll padded edges={["top", "left", "right"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}>
      {/* Settings entry (gear) — Settings holds language/appearance/sign out (PDF p34). */}
      <View style={[styles.topRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable
          onPress={() => router.push("/settings")}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("settings.title")}
          style={[styles.gear, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
        >
          <Icon name="settings" size={20} tint={colors.text} />
        </Pressable>
      </View>

      {/* Identity */}
      <View style={styles.identity}>
        <Pressable
          onPress={() => {
            // Photo present → open the full-size viewer; otherwise take the user to
            // edit-profile where they can add one (viewing an initials avatar is pointless).
            if (patient?.profile_photo_url) setPhotoViewerOpen(true);
            else router.push("/edit-profile");
          }}
          accessibilityRole="button"
          accessibilityLabel={t(patient?.profile_photo_url ? "profile.viewPhoto" : "profile.changePhoto")}
        >
          <Avatar name={account?.full_name} uri={patient?.profile_photo_url} size={76} />
        </Pressable>
        <Text variant="h2" align="center" style={{ marginTop: spacing.sm }}>
          {displayName}
        </Text>
        <Text variant="body" color="textMuted" align="center">
          {[account?.phone, patient?.address].filter(Boolean).join(" · ") || t("common.notSet")}
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <Button
            label={t("profile.edit")}
            variant="outline"
            fullWidth={false}
            onPress={() => router.push("/edit-profile")}
          />
        </View>
      </View>

      {/* Stat tiles */}
      <View style={[styles.stats, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {stats.map((s) => (
          <Card key={s.label} style={styles.statCard}>
            {/* Stat values use Manrope (title), not Agatho display (serif lacks a clean
                "+"). Blood group shows in a soft error-tint pill (theme token, dark-safe). */}
            {s.pill ? (
              <View style={[styles.bloodPill, { backgroundColor: colors.errorSurface }]}>
                <Text variant="label" align="center" style={{ color: colors.error }}>{s.value}</Text>
              </View>
            ) : (
              <Text variant="title" align="center" style={styles.statValue}>{num(s.value)}</Text>
            )}
            <Text variant="caption" color="textMuted" align="center" style={{ marginTop: 4 }}>{s.label}</Text>
          </Card>
        ))}
      </View>

      {/* Emergency contact */}
      <Card style={{ marginTop: spacing.sm + 2 }}>
        <Text variant="caption" color="textMuted">{t("profile.emergencyContact")}</Text>
        <Text variant="body" style={{ marginTop: 4 }}>
          {patient?.emergency_contact || t("common.notSet")}
        </Text>
      </Card>

      {/* Civil number — masked national ID; tap to reveal/hide (F2) */}
      <Card style={{ marginTop: spacing.sm + 2 }}>
        <Pressable
          onPress={() => { if (civil) setCivilRevealed((r) => !r); }}
          disabled={!civil}
          accessibilityRole="button"
          accessibilityLabel={t("profile.civilNumber")}
          style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="textMuted">{t("profile.civilNumber")}</Text>
            <Text variant="body" style={{ marginTop: 4 }}>
              {civil ? (civilRevealed ? civil : maskedCivil) : t("common.notSet")}
            </Text>
          </View>
          {civil ? (
            <Text variant="label" color="primary" style={isRTL ? { marginEnd: 8 } : { marginStart: 8 }}>
              {t(civilRevealed ? "profile.hide" : "profile.reveal")}
            </Text>
          ) : null}
        </Pressable>
      </Card>

      {/* Medical conditions */}
      <Card style={{ marginTop: spacing.sm + 2 }}>
        <Text variant="caption" color="textMuted">{t("profile.conditions")}</Text>
        {conditions.length ? (
          <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>{conditions.map((c) => <Chip key={c} label={c} />)}</View>
        ) : (
          <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>{t("profile.noneRecorded")}</Text>
        )}
      </Card>

      {/* Allergies */}
      <Card style={{ marginTop: spacing.sm + 2 }}>
        <Text variant="caption" color="textMuted">{t("profile.allergies")}</Text>
        {allergies.length ? (
          <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>{allergies.map((a) => <Chip key={a} label={a} />)}</View>
        ) : (
          <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>{t("profile.noneRecorded")}</Text>
        )}
      </Card>

      {/* Medications (shown when recorded) */}
      {medications.length ? (
        <Card style={{ marginTop: spacing.sm + 2 }}>
          <Text variant="caption" color="textMuted">{t("medical.medications")}</Text>
          <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>{medications.map((m) => <Chip key={m} label={m} />)}</View>
        </Card>
      ) : null}

      {/* Full-size profile photo viewer — tap anywhere to dismiss. */}
      <Modal
        visible={photoViewerOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPhotoViewerOpen(false)}
      >
        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => setPhotoViewerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          {patient?.profile_photo_url ? (
            <Image
              source={{ uri: patient.profile_photo_url }}
              style={styles.viewerImage}
              resizeMode="contain"
              accessibilityLabel={account?.full_name ?? undefined}
            />
          ) : null}
          <Pressable
            onPress={() => setPhotoViewerOpen(false)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            style={[styles.viewerClose, isRTL ? { start: 20 } : { end: 20 }]}
          >
            <Icon name="close" size={26} tint="#FFFFFF" />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { justifyContent: "flex-end", marginTop: 4 },
  gear: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth * 2 },
  identity: { alignItems: "center", marginBottom: 12 },
  stats: { gap: 8 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statValue: { fontSize: 20, lineHeight: 26 },
  bloodPill: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 999, minWidth: 44, alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "92%", height: "80%" },
  viewerClose: { position: "absolute", top: 48, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
