import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Button, Card, Chip, ErrorState, Icon, LoadingState, MeMark, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { streamSymptomCheck, type SymptomCheckMeta } from "@/services/aiSymptomCheck";

type Status = "idle" | "streaming" | "done" | "error";

/**
 * AI Symptom Checker (F-40, design p26). Streams the live SSE endpoint
 * POST /api/ai/symptom-check: shows an urgency badge, possible conditions, the streamed
 * plain-language explanation, home remedies, and the disclaimer — then hands off to the
 * doctor recommendations (F-39) for booking. No mock data or scripted transcript.
 */
export default function AiSymptomCheckerScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();

  const [draft, setDraft] = useState("");
  const [entered, setEntered] = useState("");
  const [meta, setMeta] = useState<SymptomCheckMeta | null>(null);
  const [explanation, setExplanation] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const abortRef = useRef<null | (() => void)>(null);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.(), []);

  const run = useCallback((symptoms: string) => {
    abortRef.current?.();
    setEntered(symptoms);
    setMeta(null);
    setExplanation("");
    setError("");
    setStatus("streaming");
    abortRef.current = streamSymptomCheck(symptoms, {
      onMeta: (m) => setMeta(m),
      onText: (full) => setExplanation(full),
      onDone: () => setStatus((s) => (s === "error" ? s : "done")),
      onError: (msg) => {
        setError(msg);
        setStatus("error");
      },
    });
  }, []);

  const submit = () => {
    const trimmed = draft.trim();
    if (trimmed) run(trimmed);
  };
  const reset = () => {
    abortRef.current?.();
    setEntered("");
    setMeta(null);
    setExplanation("");
    setError("");
    setStatus("idle");
  };

  const urgencyTone = (u: SymptomCheckMeta["urgency_level"]) =>
    u === "emergency"
      ? { bg: colors.error, label: t("aiAssistant.urgencyEmergency") }
      : u === "see-doctor"
        ? { bg: colors.warning ?? colors.primary, label: t("aiAssistant.urgencySeeDoctor") }
        : { bg: colors.success ?? colors.primary, label: t("aiAssistant.urgencySelfCare") };

  // Strip markdown bold markers so headings read cleanly as plain text.
  const clean = (s: string) => s.replace(/\*\*/g, "");

  const showResult = status !== "idle";

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
      footer={
        !showResult ? (
          <View style={{ gap: spacing.sm }}>
            <TextField
              value={draft}
              onChangeText={setDraft}
              placeholder={t("aiAssistant.inputPlaceholder")}
              onSubmitEditing={submit}
              returnKeyType="search"
            />
            <Button label={t("aiAssistant.check")} onPress={submit} disabled={!draft.trim()} />
          </View>
        ) : status === "done" || status === "error" ? (
          <View style={{ gap: spacing.sm }}>
            {status === "done" ? (
              <Button
                label={t("aiAssistant.seeDoctors")}
                onPress={() => router.push(`/ai/recommendations?symptoms=${encodeURIComponent(entered)}`)}
              />
            ) : null}
            <Button variant="outline" label={t("aiAssistant.newCheck")} onPress={reset} />
          </View>
        ) : undefined
      }
    >
      <AppHeader title={t("aiAssistant.title")} showBack right={<MeMark height={16} color={colors.primary} />} />

      {!showResult ? (
        <>
          {/* Intro */}
          <View style={[styles.bubbleRow, { flexDirection: isRTL ? "row-reverse" : "row", marginBottom: spacing.md }]}>
            <View style={[styles.avatarDot, { backgroundColor: colors.primaryMuted, ...(isRTL ? { marginStart: spacing.xs } : { marginEnd: spacing.xs }) }]}>
              <MeMark height={16} color={colors.primary} />
            </View>
            <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg, borderStartStartRadius: radii.sm }]}>
              <Text variant="body" align={isRTL ? "right" : "left"}>{t("aiAssistant.intro")}</Text>
            </View>
          </View>

          {/* Example chips */}
          <View style={{ marginBottom: spacing.md }}>
            <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.sm }}>
              {t("aiAssistant.examplesLabel")}
            </Text>
            <View style={[styles.chipRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {[t("aiAssistant.example1"), t("aiAssistant.example2"), t("aiAssistant.example3"), t("aiAssistant.example4")].map((ex) => (
                <Chip key={ex} label={ex} onPress={() => setDraft(ex)} />
              ))}
            </View>
          </View>

          <View style={[styles.disclaimer, { flexDirection: isRTL ? "row-reverse" : "row", backgroundColor: colors.surfaceAlt, borderRadius: radii.md, padding: spacing.md }]}>
            <Icon name="info" size={18} color="textMuted" />
            <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
              {t("aiAssistant.disclaimer")}
            </Text>
          </View>
        </>
      ) : status === "error" ? (
        <ErrorState message={error || t("aiAssistant.errorBody")} onRetry={() => run(entered)} />
      ) : (
        <>
          {/* Query echo */}
          <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.sm }}>
            {entered}
          </Text>

          {/* Urgency badge */}
          {meta ? (
            <View style={[styles.badge, { alignSelf: isRTL ? "flex-end" : "flex-start", backgroundColor: urgencyTone(meta.urgency_level).bg, borderRadius: 999, marginBottom: spacing.md }]}>
              <Text variant="caption" weight="700" style={{ color: "#fff", letterSpacing: 0.4 }}>
                {urgencyTone(meta.urgency_level).label.toUpperCase()}
              </Text>
            </View>
          ) : (
            <View style={{ paddingVertical: spacing.md }}><LoadingState /></View>
          )}

          {/* Possible conditions */}
          {meta && meta.conditions?.length > 0 ? (
            <View style={{ marginBottom: spacing.md }}>
              <Text variant="label" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.xs }}>
                {t("aiAssistant.conditions").toUpperCase()}
              </Text>
              <View style={[styles.chipRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                {meta.conditions.map((c) => <Chip key={c} label={c} />)}
              </View>
            </View>
          ) : null}

          {/* Streamed explanation */}
          {explanation ? (
            <Card style={{ marginBottom: spacing.md }}>
              <Text variant="body" align={isRTL ? "right" : "left"}>{clean(explanation)}</Text>
              {status === "streaming" ? (
                <Text variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>{t("aiAssistant.analyzing")}</Text>
              ) : null}
            </Card>
          ) : status === "streaming" && meta ? (
            <View style={{ paddingVertical: spacing.md }}><LoadingState /></View>
          ) : null}

          {/* Home remedies (self-care only, per backend) */}
          {meta && meta.home_remedies?.length > 0 ? (
            <View style={{ marginBottom: spacing.md }}>
              <Text variant="label" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.xs }}>
                {t("aiAssistant.remedies").toUpperCase()}
              </Text>
              {meta.home_remedies.map((r) => (
                <Text key={r} variant="body" align={isRTL ? "right" : "left"} style={{ marginBottom: 2 }}>{`•  ${r}`}</Text>
              ))}
            </View>
          ) : null}

          {/* Disclaimer */}
          {meta?.disclaimer ? (
            <View style={[styles.disclaimer, { flexDirection: isRTL ? "row-reverse" : "row", backgroundColor: colors.surfaceAlt, borderRadius: radii.md, padding: spacing.md }]}>
              <Icon name="info" size={18} color="textMuted" />
              <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
                {meta.disclaimer}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { alignItems: "flex-end", width: "100%" },
  avatarDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 10 },
  chipRow: { flexWrap: "wrap", gap: 8 },
  disclaimer: { alignItems: "center" },
  badge: { paddingHorizontal: 12, paddingVertical: 6 },
});
