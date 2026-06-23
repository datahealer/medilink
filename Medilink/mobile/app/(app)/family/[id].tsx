import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import {
  AppHeader,
  Button,
  Chip,
  ErrorState,
  LoadingState,
  Screen,
  Text,
  TextField,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";
import {
  useFamily,
  useRemoveFamilyMember,
  useUpdateFamilyMember,
} from "@/hooks/queries/useFamily";
import { usePatientStore } from "@/stores/patientStore";
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

export default function EditFamilyMemberScreen() {
  const { spacing } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const family = useFamily();
  const update = useUpdateFamilyMember();
  const remove = useRemoveFamilyMember();
  const patientStore = usePatientStore();

  const member = family.data?.find((m) => m.id === id);

  const [fullName, setFullName] = useState("");
  const [relation, setRelation] = useState<Relation | undefined>(undefined);
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (hydrated || !member) return;
    setFullName(member.full_name);
    setRelation(member.relation);
    setDob(member.date_of_birth ?? "");
    setGender(member.gender ?? undefined);
    setHydrated(true);
  }, [member, hydrated]);

  if (family.isLoading) {
    return (
      <Screen padded>
        <AppHeader title={t("family.editTitle")} />
        <LoadingState />
      </Screen>
    );
  }
  if (family.isError || !member) {
    return (
      <Screen padded>
        <AppHeader title={t("family.editTitle")} />
        <ErrorState message={t("family.loadError")} onRetry={() => family.refetch()} />
      </Screen>
    );
  }

  const onSave = () => {
    setError(null);
    if (fullName.trim().length < 2) {
      setError(t("validation.nameMin"));
      return;
    }
    update.mutate(
      { id: member.id, patch: { full_name: fullName.trim(), relation, date_of_birth: dob.trim() || null, gender: gender ?? null } },
      {
        onSuccess: () => {
          Alert.alert(t("family.saved"));
          router.back();
        },
        onError: () => setError(t("errors.saveFailed")),
      }
    );
  };

  const onRemove = () => {
    Alert.alert(t("family.removeTitle"), t("family.removeBody", { name: member.full_name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.remove"),
        style: "destructive",
        onPress: () =>
          remove.mutate(member.id, {
            onSuccess: () => {
              // If this member was the active patient, fall back to the primary account.
              if (patientStore.activePatientId === member.id) patientStore.reset();
              Alert.alert(t("family.removed"));
              router.back();
            },
            onError: () => Alert.alert(t("errors.saveFailed")),
          }),
      },
    ]);
  };

  return (
    <Screen
      scroll
      padded
      contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label={t("common.saveChanges")} loading={update.isPending} onPress={onSave} />
          <Button label={t("common.remove")} variant="destructive" loading={remove.isPending} onPress={onRemove} />
        </View>
      }
    >
      <AppHeader title={t("family.editTitle")} />

      <TextField
        label={t("family.fullName")}
        value={fullName}
        onChangeText={setFullName}
        containerStyle={{ marginBottom: spacing.md }}
      />

      <Text variant="label" color="textMuted" style={{ marginBottom: 8 }}>{t("family.relation")}</Text>
      <View style={styles.chips}>
        {RELATIONS.map((r) => (
          <Chip key={r.value} label={t(r.key)} selected={relation === r.value} onPress={() => setRelation(r.value)} />
        ))}
      </View>

      <TextField
        label={t("family.dob")}
        value={dob}
        onChangeText={setDob}
        placeholder={t("profile.dobPlaceholder")}
        autoCapitalize="none"
        containerStyle={{ marginTop: spacing.md, marginBottom: spacing.md }}
      />

      <Text variant="label" color="textMuted" style={{ marginBottom: 8 }}>{t("family.gender")}</Text>
      <View style={styles.chips}>
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
});
