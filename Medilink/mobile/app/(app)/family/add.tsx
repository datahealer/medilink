import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Button, Chip, DateField, MeMark, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { isValidDob, nameErrorKey } from "@/utils/validation";
import { useAddFamilyMember, useFamily } from "@/hooks/queries/useFamily";
import type { FamilyRelation, Gender } from "@/data/types";

type Relation = FamilyRelation;

const RELATIONS: { value: Relation; key: MessageKey }[] = [
  { value: "spouse", key: "family.relSpouse" },
  { value: "child", key: "family.relChild" },
  { value: "parent", key: "family.relParent" },
  { value: "sibling", key: "family.relSibling" },
  { value: "other", key: "family.relOther" },
];
const GENDERS: { value: Gender; key: MessageKey }[] = [
  { value: "male", key: "profile.genderMale" },
  { value: "female", key: "profile.genderFemale" },
  { value: "other", key: "profile.genderOther" },
];

const MAX_MEMBERS = 5;

export default function AddFamilyMemberScreen() {
  const { spacing, colors, radii, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();

  const family = useFamily();
  const add = useAddFamilyMember();

  const [fullName, setFullName] = useState("");
  const [relation, setRelation] = useState<Relation | undefined>(undefined);
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const atLimit = (family.data?.length ?? 0) >= MAX_MEMBERS;
  // DOB is optional here; validate only when provided (QA #1).
  const dobError = dob.trim() && !isValidDob(dob) ? t("validation.dob") : undefined;

  const onAdd = () => {
    setError(null);
    // Shared name rule (QA MED-001) — was a bare `trim().length < 2`, which let a family
    // member be created as "Ali123" or a 5,000-character paste. New record, so nothing to
    // grandfather: the full rule applies.
    const nameKey = nameErrorKey(fullName);
    if (nameKey) {
      setError(t(nameKey));
      return;
    }
    if (!relation) {
      setError(t("validation.required"));
      return;
    }
    if (dobError) {
      setError(dobError);
      return;
    }
    add.mutate(
      { full_name: fullName.trim(), relation, date_of_birth: dob.trim() || null, gender: gender ?? null },
      {
        onSuccess: () => {
          Alert.alert(t("family.added"));
          router.back();
        },
        onError: () => setError(t("errors.saveFailed")),
      }
    );
  };

  return (
    <Screen
      scroll
      padded
      contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}
      footer={<Button label={t("common.add")} loading={add.isPending} disabled={atLimit || !!dobError} onPress={onAdd} />}
    >
      <AppHeader title={t("family.addTitle")} />

      {/* "Add a Me profile" photo placeholder (PDF p16) — official Me submark. */}
      <View style={styles.photo}>
        <View style={[styles.photoCircle, { backgroundColor: colors.accent, borderRadius: radii.pill }]}>
          <MeMark height={40} color={colors.primary} />
        </View>
        <Text variant="caption" color="textMuted" style={{ marginTop: 8 }}>
          {t("family.addPhotoHint")}
        </Text>
      </View>

      {atLimit ? (
        <Text variant="body" color="warning" style={{ marginBottom: spacing.md }}>
          {t("family.maxReached")}
        </Text>
      ) : null}

      <TextField
        label={t("family.fullName")}
        value={fullName}
        onChangeText={setFullName}
        placeholder={t("family.fullNamePlaceholder")}
        containerStyle={{ marginBottom: spacing.md }}
      />

      <Text variant="label" color="textMuted" style={{ marginBottom: 8 }} align={isRTL ? "right" : "left"}>{t("family.relation")}</Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {RELATIONS.map((r) => (
          <Chip key={r.value} label={t(r.key)} selected={relation === r.value} onPress={() => setRelation(r.value)} />
        ))}
      </View>

      {/* Date of birth — optional; native picker capped at today (QA #1) */}
      <DateField
        label={t("family.dob")}
        value={dob}
        onChange={setDob}
        placeholder={t("profile.dobPlaceholder")}
        error={dobError}
        containerStyle={{ marginTop: spacing.md, marginBottom: spacing.md }}
      />

      <Text variant="label" color="textMuted" style={{ marginBottom: 8 }} align={isRTL ? "right" : "left"}>{t("family.gender")}</Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {GENDERS.map((g) => (
          <Chip
            key={g.value}
            label={t(g.key)}
            selected={gender === g.value}
            onPress={() => setGender(gender === g.value ? undefined : g.value)}
          />
        ))}
      </View>

      {error ? (
        <Text variant="caption" color="error" style={{ marginTop: spacing.md }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { alignItems: "center", marginBottom: 16 },
  photoCircle: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
});
