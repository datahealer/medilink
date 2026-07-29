import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Button, Card, Chip, MeMark, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { specialtyLabel } from "@/utils/specialties";
import { useScheduleAssist } from "@/hooks/queries/useAi";
import { ApiError } from "@/services/api";
import type { AiScheduleDoctorResult, AiScheduleEntities, AiScheduleTurn } from "@/data/types";

type Bubble =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; kind: "text"; text: string }
  | { id: number; role: "assistant"; kind: "results"; text?: string; results: AiScheduleDoctorResult[] }
  | {
      id: number;
      role: "assistant";
      kind: "no_results";
      text: string;
      nextAvailable: { date: string; doctorName: string | null; doctorId: string | null } | null;
    };

/** Patient-local YYYY-MM-DD (relative phrases like "tomorrow" resolve without UTC drift). */
function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const hhmm = (t: string) => (t ?? "").slice(0, 5);

/**
 * AI Scheduling Assistant (F-41, design p26). A conversational booking helper backed by the
 * live endpoint POST /api/ai/schedule-assist: natural-language requests ("cardiologist
 * tomorrow morning") return real doctors with real open slots (get_available_slots), and the
 * assistant asks follow-up questions when it needs a specialty or date. Booking hands off to
 * the doctor's detail screen — the app's single real booking flow (no fake in-chat booking).
 */
export default function AiScheduleScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const assist = useScheduleAssist();

  const idRef = useRef(0);
  const nextId = () => ++idRef.current;

  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const entitiesRef = useRef<AiScheduleEntities | undefined>(undefined);
  const historyRef = useRef<AiScheduleTurn[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  // Opening greeting.
  useEffect(() => {
    setMessages([{ id: nextId(), role: "assistant", kind: "text", text: t("aiSchedule.greeting") }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(id);
  }, [messages, assist.isPending]);

  const examples = useMemo(
    () => [t("aiSchedule.example1"), t("aiSchedule.example2"), t("aiSchedule.example3")],
    [t]
  );

  const send = (raw: string) => {
    const query = raw.trim();
    if (!query || assist.isPending) return;
    setDraft("");
    setMessages((m) => [...m, { id: nextId(), role: "user", text: query }]);

    assist.mutate(
      { query, clientDate: localDate(), history: historyRef.current, pendingEntities: entitiesRef.current },
      {
        onSuccess: (res) => {
          entitiesRef.current = res.entities;
          let assistantText = "";
          if (res.kind === "message") {
            assistantText = res.message;
            setMessages((m) => [...m, { id: nextId(), role: "assistant", kind: "text", text: res.message }]);
          } else if (res.kind === "results") {
            assistantText = t("aiSchedule.foundResults");
            setMessages((m) => [
              ...m,
              { id: nextId(), role: "assistant", kind: "results", text: t("aiSchedule.foundResults"), results: res.results },
            ]);
          } else {
            assistantText = res.message;
            setMessages((m) => [
              ...m,
              { id: nextId(), role: "assistant", kind: "no_results", text: res.message, nextAvailable: res.nextAvailable },
            ]);
          }
          historyRef.current = [
            ...historyRef.current,
            { role: "user" as const, content: query },
            { role: "assistant" as const, content: assistantText },
          ].slice(-8); // keep the last few turns for context, bounded
        },
        onError: (err) => {
          const text = err instanceof ApiError && err.status === 401 ? t("common.sessionExpired") : t("aiSchedule.error");
          setMessages((m) => [...m, { id: nextId(), role: "assistant", kind: "text", text }]);
        },
      }
    );
  };

  const showExamples = messages.length <= 1 && !assist.isPending;

  return (
    <Screen
      scroll={false}
      padded={false}
      edges={["top", "left", "right", "bottom"]}
      footer={
        <View style={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}>
          <View style={[styles.inputRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={styles.flex}>
              <TextField
                value={draft}
                onChangeText={setDraft}
                placeholder={t("aiSchedule.inputPlaceholder")}
                onSubmitEditing={() => send(draft)}
                returnKeyType="send"
                editable={!assist.isPending}
              />
            </View>
            <Button
              label={t("aiSchedule.send")}
              onPress={() => send(draft)}
              disabled={!draft.trim() || assist.isPending}
              style={isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }}
            />
          </View>
        </View>
      }
    >
      <View style={{ paddingHorizontal: spacing.lg }}>
        <AppHeader title={t("aiSchedule.title")} showBack right={<MeMark height={16} color={colors.primary} />} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((b) => {
          if (b.role === "user") {
            return (
              <View key={b.id} style={[styles.userWrap, { alignItems: isRTL ? "flex-start" : "flex-end" }]}>
                <View style={[styles.bubble, styles.userBubble, { backgroundColor: colors.primary, borderRadius: radii.lg }]}>
                  <Text variant="body" style={{ color: colors.textOnPrimary }}>{b.text}</Text>
                </View>
              </View>
            );
          }
          // assistant
          return (
            <View key={b.id} style={[styles.assistantWrap, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={[styles.avatarDot, { backgroundColor: colors.primaryMuted, ...(isRTL ? { marginStart: spacing.xs } : { marginEnd: spacing.xs }) }]}>
                <MeMark height={14} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                {b.kind === "text" ? (
                  <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg, alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
                    <Text variant="body" align={isRTL ? "right" : "left"}>{b.text}</Text>
                  </View>
                ) : b.kind === "no_results" ? (
                  <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg, alignSelf: isRTL ? "flex-end" : "flex-start", width: "100%" }]}>
                    <Text variant="body" align={isRTL ? "right" : "left"}>{b.text}</Text>
                    {b.nextAvailable ? (
                      <View style={{ marginTop: spacing.sm }}>
                        <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"}>
                          {t("aiSchedule.nextAvailable", {
                            doctor: b.nextAvailable.doctorName ?? t("aiSchedule.aDoctor"),
                            date: b.nextAvailable.date,
                          })}
                        </Text>
                        {b.nextAvailable.doctorId ? (
                          <Button
                            label={t("aiSchedule.viewDoctor")}
                            variant="outline"
                            onPress={() => router.push(`/doctors/${b.nextAvailable!.doctorId}`)}
                            style={{ marginTop: spacing.sm }}
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ width: "100%", gap: spacing.sm }}>
                    {b.text ? (
                      <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg, alignSelf: isRTL ? "flex-end" : "flex-start" }]}>
                        <Text variant="body" align={isRTL ? "right" : "left"}>{b.text}</Text>
                      </View>
                    ) : null}
                    {b.results.map((r) => (
                      <Card key={r.doctorId}>
                        <View style={[styles.docRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                          <View style={styles.flex}>
                            <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{r.doctorName}</Text>
                            <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>
                              {specialtyLabel(r.specialty, r.specialty, t)}
                            </Text>
                            <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: 2 }}>
                              {num(
                                [r.rating != null ? `★ ${r.rating.toFixed(1)}` : null, r.feeOmr != null ? `OMR ${r.feeOmr}` : null]
                                  .filter(Boolean)
                                  .join(" · ")
                              )}
                            </Text>
                          </View>
                        </View>

                        <Text variant="label" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.sm }}>
                          {t("aiSchedule.slotsOn", { date: r.slotDate })}
                        </Text>
                        {r.timeFallback ? (
                          <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: 2 }}>
                            {t("aiSchedule.timeFallback")}
                          </Text>
                        ) : null}
                        <View style={[styles.slotRow, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.xs }]}>
                          {r.slots.map((s) => (
                            <Chip key={`${s.start}-${s.end}`} label={hhmm(s.start)} onPress={() => router.push(`/doctors/${r.doctorId}`)} />
                          ))}
                        </View>

                        <Button
                          label={t("aiSchedule.book")}
                          onPress={() => router.push(`/doctors/${r.doctorId}`)}
                          style={{ marginTop: spacing.md }}
                        />
                      </Card>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {assist.isPending ? (
          <View style={[styles.assistantWrap, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={[styles.avatarDot, { backgroundColor: colors.primaryMuted, ...(isRTL ? { marginStart: spacing.xs } : { marginEnd: spacing.xs }) }]}>
              <MeMark height={14} color={colors.primary} />
            </View>
            <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg, flexDirection: "row", alignItems: "center" }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="caption" color="textMuted" style={isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }}>
                {t("aiSchedule.thinking")}
              </Text>
            </View>
          </View>
        ) : null}

        {showExamples ? (
          <View style={{ marginTop: spacing.sm }}>
            <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.xs }}>
              {t("aiSchedule.examplesLabel")}
            </Text>
            <View style={[styles.slotRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {examples.map((ex) => (
                <Chip key={ex} label={ex} onPress={() => send(ex)} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  userWrap: { width: "100%" },
  assistantWrap: { width: "100%", alignItems: "flex-start" },
  avatarDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 2 },
  bubble: { maxWidth: "88%", paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { maxWidth: "82%" },
  docRow: { alignItems: "center" },
  slotRow: { flexWrap: "wrap", gap: 8 },
  inputRow: { alignItems: "center" },
});
