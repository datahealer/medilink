import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  AppHeader,
  Avatar,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Screen,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useFamily } from "@/hooks/queries/useFamily";
import { useProfile } from "@/hooks/queries/usePatient";
import { usePatientStore } from "@/stores/patientStore";

export default function PatientSwitcherScreen() {
  const { spacing, colors, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();

  const family = useFamily();
  const profile = useProfile();
  const activeId = usePatientStore((s) => s.activePatientId);
  const setActive = usePatientStore((s) => s.setActivePatient);

  const youName = profile.data?.account?.full_name ?? t("switcher.you");
  // Selection: null = the primary account holder ("You").
  const [selected, setSelected] = useState<string | null>(activeId);

  const options: { id: string | null; name: string; sub?: string }[] = [
    { id: null, name: youName, sub: t("switcher.you") },
    ...(family.data ?? []).map((m) => ({ id: m.id, name: m.full_name })),
  ];

  const selectedName = options.find((o) => o.id === selected)?.name ?? youName;

  const onContinue = () => {
    setActive(selected, selected === null ? null : selectedName);
    router.back();
  };

  return (
    <Screen
      scroll
      padded
      contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}
      footer={<Button label={t("switcher.continueAs", { name: selectedName })} onPress={onContinue} />}
    >
      <AppHeader title={t("switcher.title")} />
      <Text variant="body" color="textMuted" style={{ marginBottom: spacing.md }}>
        {t("switcher.subtitle")}
      </Text>

      {family.isLoading ? (
        <LoadingState />
      ) : family.isError ? (
        <ErrorState message={t("family.loadError")} onRetry={() => family.refetch()} />
      ) : (
        options.map((o) => {
          const isSel = selected === o.id;
          return (
            <Card
              key={o.id ?? "self"}
              onPress={() => setSelected(o.id)}
              style={{ marginBottom: spacing.sm, borderColor: isSel ? colors.primary : colors.border }}
            >
              <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Avatar name={o.name} size={40} />
                <View style={[styles.text, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
                  <Text variant="title" numberOfLines={1}>{o.name}</Text>
                  {o.sub ? <Text variant="caption" color="textMuted">{o.sub}</Text> : null}
                </View>
                {isSel ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center" },
  text: { flex: 1 },
});
