import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { FamilyMember, FamilyRelation } from "@/data/types";

import { Avatar, Card, ErrorState, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { useFamily } from "@/hooks/queries/useFamily";
import { useProfile } from "@/hooks/queries/usePatient";
import { usePatientStore } from "@/stores/patientStore";

const REL_KEY: Record<FamilyRelation, MessageKey> = {
  spouse: "family.relSpouse",
  child: "family.relChild",
  parent: "family.relParent",
  sibling: "family.relSibling",
  other: "family.relOther",
};

const MAX_MEMBERS = 5;

function age(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

export default function MeFamilyScreen() {
  const { spacing, colors, isRTL, radii } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();

  const family = useFamily();
  const profile = useProfile();
  const activeId = usePatientStore((s) => s.activePatientId);

  const youName = profile.data?.account?.full_name ?? t("family.you");
  const members: FamilyMember[] = family.data ?? [];
  const atLimit = members.length >= MAX_MEMBERS;

  const memberRow = (m: FamilyMember) => {
    const a = age(m.date_of_birth);
    const sub = [t(REL_KEY[m.relation]), a != null ? t("family.ageYears", { age: a }) : null]
      .filter(Boolean)
      .join(" · ");
    const isActive = activeId === m.id;
    return (
      <Card key={m.id} onPress={() => router.push(`/family/${m.id}`)} style={{ marginBottom: spacing.sm }}>
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={m.full_name} size={44} />
          <View style={[styles.rowText, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
            <Text variant="title" numberOfLines={1}>{m.full_name}</Text>
            <Text variant="caption" color="textMuted">{sub}</Text>
          </View>
          {isActive ? (
            <View style={[styles.badge, { backgroundColor: colors.success }]}>
              <Text variant="caption" color="textOnPrimary">{t("family.active")}</Text>
            </View>
          ) : null}
          <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color={colors.textMuted} />
        </View>
      </Card>
    );
  };

  return (
    <Screen scroll padded edges={["top", "left", "right"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}>
      {/* Header: "Me Family" + add (sized to content, never wraps) */}
      <View style={[styles.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text variant="h2">{t("family.title")}</Text>
        <Pressable
          onPress={() => router.push("/family/add")}
          disabled={atLimit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("family.addMember")}
          style={[styles.addBtn, { backgroundColor: colors.primary, opacity: atLimit ? 0.4 : 1 }]}
        >
          <Ionicons name="add" size={22} color={colors.textOnPrimary} />
        </Pressable>
      </View>
      <Text variant="body" color="textMuted" style={{ marginBottom: spacing.md }}>
        {t("family.subtitle")}
      </Text>

      {/* Primary account holder */}
      <Card style={{ marginBottom: spacing.sm, borderColor: activeId === null ? colors.primary : colors.border }}>
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={youName} uri={profile.data?.patient?.profile_photo_url} size={44} />
          <View style={[styles.rowText, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
            <Text variant="title" numberOfLines={1}>{youName}</Text>
            <Text variant="caption" color="textMuted">{t("family.primaryAccount")}</Text>
          </View>
          {activeId === null ? (
            <View style={[styles.badge, { backgroundColor: colors.success }]}>
              <Text variant="caption" color="textOnPrimary">{t("family.active")}</Text>
            </View>
          ) : null}
        </View>
      </Card>

      {family.isLoading ? (
        <LoadingState />
      ) : family.isError ? (
        <ErrorState message={t("family.loadError")} onRetry={() => family.refetch()} />
      ) : members.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="body" color="textMuted" align="center">{t("family.emptyBody")}</Text>
        </View>
      ) : (
        members.map(memberRow)
      )}

      {/* Add member row (ghost, not a giant footer button) */}
      {!atLimit ? (
        <Pressable
          onPress={() => router.push("/family/add")}
          accessibilityRole="button"
          style={[styles.addRow, { borderColor: colors.border, borderRadius: radii.lg, flexDirection: isRTL ? "row-reverse" : "row" }]}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <Text variant="title" color="primary" style={isRTL ? { marginEnd: 8 } : { marginStart: 8 }}>
            {t("family.addMember")}
          </Text>
        </Pressable>
      ) : (
        <Text variant="caption" color="textMuted" align="center" style={{ marginTop: spacing.md }}>
          {t("family.maxReached")}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  row: { alignItems: "center" },
  rowText: { flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginHorizontal: 6 },
  empty: { paddingVertical: 24 },
  addRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: "dashed",
    marginTop: 4,
  },
});
