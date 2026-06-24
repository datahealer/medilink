import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
  const age = ageFrom(patient?.date_of_birth);
  const allergies = history.data?.allergies ?? [];
  const conditions = history.data?.conditions ?? [];
  const medications = history.data?.medications ?? [];

  const stats: { label: string; value: string }[] = [
    { label: t("profile.bloodGroup"), value: patient?.blood_group && patient.blood_group !== "unknown" ? patient.blood_group : t("common.notSet") },
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
        <Avatar name={account?.full_name} uri={patient?.profile_photo_url} size={88} />
        <Text variant="h2" align="center" style={{ marginTop: spacing.sm }}>
          {account?.full_name ?? "—"}
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
            {/* Stat values use Manrope (title), not Agatho display: the serif face
                lacks a clean "+", which rendered "O+" as a broken glyph (audit P2.2). */}
            <Text variant="title" align="center" style={styles.statValue}>{num(s.value)}</Text>
            <Text variant="caption" color="textMuted" align="center">{s.label}</Text>
          </Card>
        ))}
      </View>

      {/* Emergency contact */}
      <Card style={{ marginTop: spacing.md }}>
        <Text variant="caption" color="textMuted">{t("profile.emergencyContact")}</Text>
        <Text variant="body" style={{ marginTop: 4 }}>
          {patient?.emergency_contact || t("common.notSet")}
        </Text>
      </Card>

      {/* Medical conditions */}
      <Card style={{ marginTop: spacing.md }}>
        <Text variant="caption" color="textMuted">{t("profile.conditions")}</Text>
        {conditions.length ? (
          <View style={styles.chips}>{conditions.map((c) => <Chip key={c} label={c} />)}</View>
        ) : (
          <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>{t("profile.noneRecorded")}</Text>
        )}
      </Card>

      {/* Allergies */}
      <Card style={{ marginTop: spacing.md }}>
        <Text variant="caption" color="textMuted">{t("profile.allergies")}</Text>
        {allergies.length ? (
          <View style={styles.chips}>{allergies.map((a) => <Chip key={a} label={a} />)}</View>
        ) : (
          <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>{t("profile.noneRecorded")}</Text>
        )}
      </Card>

      {/* Medications (shown when recorded) */}
      {medications.length ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text variant="caption" color="textMuted">{t("medical.medications")}</Text>
          <View style={styles.chips}>{medications.map((m) => <Chip key={m} label={m} />)}</View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { justifyContent: "flex-end", marginTop: 4 },
  gear: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth * 2 },
  identity: { alignItems: "center", marginBottom: 16 },
  stats: { gap: 8 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 16 },
  statValue: { fontSize: 20, lineHeight: 26 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
});
