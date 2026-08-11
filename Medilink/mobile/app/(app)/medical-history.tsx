import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { SmokingStatus } from "@/data/types";

import {
  AppHeader,
  Button,
  Chip,
  ErrorState,
  Icon,
  LoadingState,
  Screen,
  Text,
  TextField,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useMedicalHistory, useUpsertMedicalHistory } from "@/hooks/queries/usePatient";
import {
  MEDICAL_TAG_MAX,
  medicalTagErrorKey,
  medicalTagProblem,
  normalizeMedicalTag,
} from "@/utils/validation";

type Smoking = SmokingStatus;
const SMOKING: { value: Smoking; key: "smokingNever" | "smokingFormer" | "smokingCurrent" | "smokingUnknown" }[] = [
  { value: "never", key: "smokingNever" },
  { value: "former", key: "smokingFormer" },
  { value: "current", key: "smokingCurrent" },
  { value: "unknown", key: "smokingUnknown" },
];

/** Add/remove list of free-text tags (allergies, conditions, …). */
function TagEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const { spacing, colors, radii, isRTL } = useTheme();
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  // QA MED-011: was `draft.trim()` + a case-SENSITIVE `includes`, with no length or
  // charset rule. Now the shared medical-tag rule decides, and the user is told which
  // rule failed instead of the tag silently vanishing.
  const add = () => {
    const value = normalizeMedicalTag(draft);
    const problem = medicalTagProblem(draft, items);

    // A blank submit is not worth an error message — just clear and move on, which is
    // what pressing "done" on an empty field should do.
    if (problem === "required") {
      setDraft("");
      setError(undefined);
      return;
    }
    if (problem) {
      setError(t(medicalTagErrorKey(draft, items)!));
      return;
    }

    onChange([...items, value]);
    setDraft("");
    setError(undefined);
  };

  // Clear the message as soon as the user starts correcting it.
  const onDraftChange = (next: string) => {
    setDraft(next);
    if (error) setError(undefined);
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text variant="label" color="textMuted" style={{ marginBottom: 8 }}>{label}</Text>
      <TextField
        value={draft}
        onChangeText={onDraftChange}
        placeholder={placeholder}
        onSubmitEditing={add}
        returnKeyType="done"
        error={error}
        // Hard stop well past MEDICAL_TAG_MAX: the validator gives the real message, but
        // this stops a multi-thousand-character paste from ever entering the field.
        maxLength={MEDICAL_TAG_MAX * 2}
        trailing={
          <Pressable
            onPress={add}
            hitSlop={8}
            accessibilityRole="button"
            style={[styles.addBtn, { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm }]}
          >
            <Icon name="plus" size={20} tint={colors.primary} strokeWidth={2.2} />
          </Pressable>
        }
      />
      {items.length ? (
        <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {items.map((it) => (
            <Chip key={it} label={it} onRemove={() => onChange(items.filter((x) => x !== it))} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function MedicalHistoryScreen() {
  const { spacing, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();

  const history = useMedicalHistory();
  const upsert = useUpsertMedicalHistory();

  const [allergies, setAllergies] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [surgeries, setSurgeries] = useState<string[]>([]);
  const [smoking, setSmoking] = useState<Smoking>("unknown");
  const [notes, setNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Seed local state once the query resolves.
  React.useEffect(() => {
    if (hydrated || history.isLoading) return;
    const h = history.data;
    if (h) {
      setAllergies(h.allergies ?? []);
      setConditions(h.conditions ?? []);
      setMedications(h.medications ?? []);
      setSurgeries(h.surgeries ?? []);
      setSmoking(h.smoking_status ?? "unknown");
      setNotes(h.notes ?? "");
    }
    setHydrated(true);
  }, [history.isLoading, history.data, hydrated]);

  if (history.isLoading) {
    return (
      <Screen padded>
        <AppHeader title={t("medical.title")} />
        <LoadingState />
      </Screen>
    );
  }
  if (history.isError) {
    return (
      <Screen padded>
        <AppHeader title={t("medical.title")} />
        <ErrorState message={t("medical.loadError")} onRetry={() => history.refetch()} />
      </Screen>
    );
  }

  const onSave = () => {
    upsert.mutate(
      { allergies, conditions, medications, surgeries, smoking_status: smoking, notes: notes.trim() || null },
      {
        onSuccess: () => {
          Alert.alert(t("medical.saved"));
          router.back();
        },
        onError: () => Alert.alert(t("errors.saveFailed")),
      }
    );
  };

  return (
    <Screen
      scroll
      padded
      contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}
      footer={<Button label={t("common.save")} loading={upsert.isPending} onPress={onSave} />}
    >
      <AppHeader title={t("medical.title")} />

      <TagEditor label={t("medical.allergies")} items={allergies} onChange={setAllergies} placeholder={t("medical.addPlaceholder")} />
      <TagEditor label={t("medical.conditions")} items={conditions} onChange={setConditions} placeholder={t("medical.addPlaceholder")} />
      <TagEditor label={t("medical.medications")} items={medications} onChange={setMedications} placeholder={t("medical.addPlaceholder")} />
      <TagEditor label={t("medical.surgeries")} items={surgeries} onChange={setSurgeries} placeholder={t("medical.addPlaceholder")} />

      <Text variant="label" color="textMuted" style={{ marginTop: spacing.xs, marginBottom: 8 }}>{t("medical.smoking")}</Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {SMOKING.map((s) => (
          <Chip key={s.value} label={t(`medical.${s.key}`)} selected={smoking === s.value} onPress={() => setSmoking(s.value)} />
        ))}
      </View>

      <Text variant="label" color="textMuted" style={{ marginTop: spacing.lg, marginBottom: 8 }}>{t("medical.notes")}</Text>
      <TextField
        value={notes}
        onChangeText={setNotes}
        placeholder={t("medical.notesPlaceholder")}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        containerStyle={{ marginBottom: spacing.sm }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  addBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
