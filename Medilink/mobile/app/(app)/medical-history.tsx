import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { SmokingStatus } from "@/data/types";

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
import { useMedicalHistory, useUpsertMedicalHistory } from "@/hooks/queries/usePatient";

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
  const { spacing, colors, radii } = useTheme();
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...items, v]);
    setDraft("");
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text variant="label" color="textMuted" style={{ marginBottom: 8 }}>{label}</Text>
      <TextField
        value={draft}
        onChangeText={setDraft}
        placeholder={placeholder}
        onSubmitEditing={add}
        returnKeyType="done"
        trailing={
          <Pressable
            onPress={add}
            hitSlop={8}
            accessibilityRole="button"
            style={[styles.addBtn, { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm }]}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </Pressable>
        }
      />
      {items.length ? (
        <View style={styles.chips}>
          {items.map((it) => (
            <Chip key={it} label={it} onRemove={() => onChange(items.filter((x) => x !== it))} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function MedicalHistoryScreen() {
  const { spacing } = useTheme();
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
      <View style={styles.chips}>
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
