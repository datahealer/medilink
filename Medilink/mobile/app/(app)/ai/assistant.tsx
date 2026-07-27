import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { AppHeader, Avatar, Button, Card, Chip, LoadingState, Markdown, MeMark, Screen, Text, TextField, TypingIndicator, UrgencyBadge } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { specialtyLabel } from "@/utils/specialties";
import { repositories } from "@/data";
import { streamSymptomChat, type ChatTurn, type SymptomCheckMeta } from "@/services/aiSymptomCheck";
import type { AiSuggestedDoctor } from "@/data/types";

// ── Message model ────────────────────────────────────────────────────────────
interface UserMsg { id: number; role: "user"; text: string; ts: number }
interface AiTextMsg {
  id: number; role: "ai"; kind: "text"; text: string; ts: number;
  meta: SymptomCheckMeta | null; status: "streaming" | "done" | "error"; error?: string;
  synthetic?: boolean; recommendAnswered?: boolean;
}
interface AiDoctorsMsg {
  id: number; role: "ai"; kind: "doctors"; ts: number;
  status: "loading" | "done" | "error"; doctors: AiSuggestedDoctor[]; reasoning: string | null;
}
type Msg = UserMsg | AiTextMsg | AiDoctorsMsg;

/**
 * AI Symptom Checker — a continuous ChatGPT-style conversation (F-40). The full history is
 * sent to the streaming endpoint on every turn so the assistant never forgets earlier
 * symptoms; it asks focused follow-ups (gathering) until it can give an assessment (urgency
 * badge + plain-language explanation + disclaimer), then offers to recommend doctors via the
 * existing suggest-doctor API — after which the user can keep chatting and the assessment
 * updates. Streaming, typing indicator, timestamps, markdown, quick replies, copy, regenerate,
 * retry, and "start new conversation" are all supported. Theme- and RTL-aware.
 */
export default function AiSymptomCheckerScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const idRef = useRef(0);
  const nextId = () => ++idRef.current;
  const greeting = useCallback(
    (): AiTextMsg => ({ id: nextId(), role: "ai", kind: "text", text: t("aiAssistant.greeting"), ts: Date.now(), meta: null, status: "done", synthetic: true }),
    [t]
  );

  const [messages, setMessages] = useState<Msg[]>(() => [greeting()]);
  const [draft, setDraft] = useState("");
  const abortRef = useRef<null | (() => void)>(null);
  const scrollRef = useRef<ScrollView>(null);
  const streaming = messages.some((m) => m.role === "ai" && m.kind === "text" && m.status === "streaming");

  useEffect(() => () => abortRef.current?.(), []);
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [messages]);

  const patch = useCallback((id: number, updater: (m: Msg) => Msg) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? updater(m) : m)));
  }, []);

  /** Build the ChatGPT-style history the backend needs (skip synthetic/empty/errored + doctor cards). */
  const buildHistory = (msgs: Msg[]): ChatTurn[] =>
    msgs
      .filter((m): m is UserMsg | AiTextMsg => m.role === "user" || (m.role === "ai" && m.kind === "text"))
      .filter((m) => (m.role === "user" ? !!m.text.trim() : !m.synthetic && !!m.text.trim() && m.status !== "error"))
      .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.text }))
      .slice(-16);

  /** Stream one assistant turn for the given history into a target AI bubble. */
  const runStream = useCallback((history: ChatTurn[], aiId: number) => {
    abortRef.current?.();
    abortRef.current = streamSymptomChat(history, {
      onMeta: (meta) => patch(aiId, (m) => (m.role === "ai" && m.kind === "text" ? { ...m, meta } : m)),
      onText: (full) => patch(aiId, (m) => (m.role === "ai" && m.kind === "text" ? { ...m, text: full } : m)),
      onDone: () => patch(aiId, (m) => (m.role === "ai" && m.kind === "text" && m.status !== "error" ? { ...m, status: "done" } : m)),
      onError: (msg) => patch(aiId, (m) => (m.role === "ai" && m.kind === "text" ? { ...m, status: "error", error: msg } : m)),
    });
  }, [patch]);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;
    setDraft("");
    const userMsg: UserMsg = { id: nextId(), role: "user", text, ts: Date.now() };
    const aiMsg: AiTextMsg = { id: nextId(), role: "ai", kind: "text", text: "", ts: Date.now(), meta: null, status: "streaming" };
    setMessages((prev) => {
      runStream(buildHistory([...prev, userMsg]), aiMsg.id);
      return [...prev, userMsg, aiMsg];
    });
  };

  /** Regenerate / retry: re-stream the last assistant turn from the history up to it. */
  const regenerate = (aiId: number) => {
    if (streaming) return;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === aiId);
      if (idx < 0) return prev;
      const history = buildHistory(prev.slice(0, idx));
      if (history.length === 0) return prev;
      const fresh: AiTextMsg = { id: aiId, role: "ai", kind: "text", text: "", ts: Date.now(), meta: null, status: "streaming" };
      runStream(history, aiId);
      return prev.map((m) => (m.id === aiId ? fresh : m));
    });
  };

  const recommendDoctors = (fromId: number) => {
    patch(fromId, (m) => (m.role === "ai" && m.kind === "text" ? { ...m, recommendAnswered: true } : m));
    const symptoms = messages.filter((m): m is UserMsg => m.role === "user").map((m) => m.text).join(". ").slice(0, 1000);
    const docMsg: AiDoctorsMsg = { id: nextId(), role: "ai", kind: "doctors", ts: Date.now(), status: "loading", doctors: [], reasoning: null };
    setMessages((prev) => [...prev, docMsg]);
    repositories.ai
      .suggestDoctors(symptoms)
      .then((res) => patch(docMsg.id, (m) => (m.role === "ai" && m.kind === "doctors" ? { ...m, status: "done", doctors: res.doctors, reasoning: res.reasoning } : m)))
      .catch(() => patch(docMsg.id, (m) => (m.role === "ai" && m.kind === "doctors" ? { ...m, status: "error" } : m)));
  };

  const declineDoctors = (fromId: number) => {
    patch(fromId, (m) => (m.role === "ai" && m.kind === "text" ? { ...m, recommendAnswered: true } : m));
    setMessages((prev) => [...prev, { id: nextId(), role: "ai", kind: "text", text: t("aiAssistant.recommendDeclined"), ts: Date.now(), meta: null, status: "done", synthetic: true }]);
  };

  const copy = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
    } catch {
      /* clipboard native module not present in this build — degrade silently */
    }
  };

  const newConversation = () => {
    Alert.alert(t("aiAssistant.newConversation"), t("aiAssistant.newConversationConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("aiAssistant.newConversation"),
        style: "destructive",
        onPress: () => {
          abortRef.current?.();
          setDraft("");
          setMessages([greeting()]);
        },
      },
    ]);
  };

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return num(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  };
  const urgencyLabel = (level: string) =>
    level === "emergency" ? t("aiAssistant.urgencyEmergency")
      : level === "urgent-24h" ? t("aiAssistant.urgencyUrgent24h")
        : level === "see-doctor" ? t("aiAssistant.urgencySeeDoctor")
          : t("aiAssistant.urgencySelfCare");

  const showExamples = messages.length <= 1 && !streaming;
  const examples = useMemo(() => [t("aiAssistant.example1"), t("aiAssistant.example2"), t("aiAssistant.example3"), t("aiAssistant.example4")], [t]);

  return (
    <Screen
      scroll={false}
      padded={false}
      edges={["top", "left", "right", "bottom"]}
      footer={
        <View style={[styles.inputRow, { flexDirection: isRTL ? "row-reverse" : "row", maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }]}>
          <View style={styles.flex}>
            <TextField
              value={draft}
              onChangeText={setDraft}
              placeholder={t("aiAssistant.inputPlaceholder")}
              onSubmitEditing={() => send(draft)}
              returnKeyType="send"
              editable={!streaming}
            />
          </View>
          <Button
            label={t("aiAssistant.send")}
            onPress={() => send(draft)}
            disabled={!draft.trim() || streaming}
            style={isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }}
          />
        </View>
      }
    >
      <View style={{ paddingHorizontal: spacing.lg }}>
        <AppHeader
          title={t("aiAssistant.title")}
          showBack
          right={
            <Pressable onPress={newConversation} hitSlop={8} accessibilityLabel={t("aiAssistant.newConversation")}>
              <Text variant="caption" weight="700" color="primary">{t("aiAssistant.newConversation")}</Text>
            </Pressable>
          }
        />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <View key={m.id} style={{ alignItems: isRTL ? "flex-start" : "flex-end" }}>
                <View style={[styles.bubble, styles.userBubble, { backgroundColor: colors.primary, borderRadius: radii.lg }]}>
                  <Text variant="body" style={{ color: colors.textOnPrimary }}>{m.text}</Text>
                </View>
                <Text variant="caption" color="textMuted" style={styles.ts}>{fmtTime(m.ts)}</Text>
              </View>
            );
          }

          if (m.kind === "doctors") {
            return (
              <View key={m.id} style={[styles.aiRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <AiAvatar />
                <View style={styles.flex}>
                  {m.status === "loading" ? (
                    <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg }]}>
                      <LoadingState />
                      <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"}>{t("aiAssistant.doctorsLoading")}</Text>
                    </View>
                  ) : m.status === "error" ? (
                    <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg }]}>
                      <Text variant="body" align={isRTL ? "right" : "left"}>{t("aiAssistant.doctorsError")}</Text>
                    </View>
                  ) : m.doctors.length === 0 ? (
                    <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg }]}>
                      <Text variant="body" align={isRTL ? "right" : "left"}>{t("aiAssistant.noDoctors")}</Text>
                    </View>
                  ) : (
                    <View style={{ gap: spacing.sm }}>
                      {m.reasoning ? (
                        <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg }]}>
                          <Text variant="body" align={isRTL ? "right" : "left"}>{m.reasoning}</Text>
                        </View>
                      ) : null}
                      {m.doctors.map((d) => (
                        <Card key={d.id}>
                          <View style={[styles.docRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                            <Avatar name={d.full_name} size={48} />
                            <View style={[styles.flex, isRTL ? { marginEnd: spacing.md } : { marginStart: spacing.md }]}>
                              <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{d.full_name}</Text>
                              {d.specialty ? <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>{specialtyLabel(d.specialty, d.specialty, t)}</Text> : null}
                              {d.clinic ? <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>{d.clinic}</Text> : null}
                              {(d.rating != null || d.fee_omr != null) ? (
                                <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: 2 }}>
                                  {num([d.rating != null ? `★ ${d.rating.toFixed(1)}` : null, d.fee_omr != null ? `OMR ${d.fee_omr}` : null].filter(Boolean).join(" · "))}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                          <Button label={t("aiAssistant.book")} onPress={() => router.push(`/doctors/${d.id}`)} style={{ marginTop: spacing.md }} />
                        </Card>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          }

          // ai text (question / assessment / greeting)
          const isAssessment = m.meta?.phase === "assessment" && m.meta.is_medical;
          return (
            <View key={m.id} style={[styles.aiRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <AiAvatar />
              <View style={styles.flex}>
                <View style={[styles.bubble, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg }]}>
                  {m.meta?.is_emergency ? (
                    <View style={[styles.emergency, { backgroundColor: colors.error, borderRadius: radii.md }]}>
                      <Text variant="caption" weight="700" style={{ color: "#fff" }}>{t("aiAssistant.emergencyBanner")}</Text>
                    </View>
                  ) : null}

                  {isAssessment && m.meta ? (
                    <View style={{ marginBottom: spacing.sm }}>
                      <UrgencyBadge level={m.meta.urgency_level} label={urgencyLabel(m.meta.urgency_level)} />
                    </View>
                  ) : null}

                  {m.status === "error" ? (
                    <Text variant="body" color="error" align={isRTL ? "right" : "left"}>{m.error || t("aiAssistant.errorBody")}</Text>
                  ) : m.text ? (
                    <Markdown color="text">{m.text}</Markdown>
                  ) : (
                    <TypingIndicator />
                  )}

                  {isAssessment && m.meta?.disclaimer ? (
                    <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.sm }}>{m.meta.disclaimer}</Text>
                  ) : null}
                </View>

                {/* Action row: copy / regenerate / retry / timestamp */}
                {m.status === "done" && !m.synthetic && m.text ? (
                  <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Pressable onPress={() => copy(m.text)} hitSlop={6} accessibilityLabel={t("aiAssistant.copy")}><Text variant="caption" color="textMuted">{t("aiAssistant.copy")}</Text></Pressable>
                    <Pressable onPress={() => regenerate(m.id)} hitSlop={6} disabled={streaming} accessibilityLabel={t("aiAssistant.regenerate")}><Text variant="caption" color="textMuted">{t("aiAssistant.regenerate")}</Text></Pressable>
                    <Text variant="caption" color="textMuted" style={styles.ts}>{fmtTime(m.ts)}</Text>
                  </View>
                ) : m.status === "error" ? (
                  <Pressable onPress={() => regenerate(m.id)} style={styles.retry}>
                    <Text variant="caption" weight="700" color="primary">{t("aiAssistant.retry")}</Text>
                  </Pressable>
                ) : !m.synthetic && m.status === "done" ? (
                  <Text variant="caption" color="textMuted" style={styles.ts}>{fmtTime(m.ts)}</Text>
                ) : null}

                {/* Recommend-doctors CTA (only on a fresh assessment) */}
                {isAssessment && m.meta?.ask_recommend_doctors && !m.recommendAnswered && m.status === "done" ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <Text variant="body" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.xs }}>{t("aiAssistant.recommendPrompt")}</Text>
                    <View style={[styles.chipRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      <Chip label={t("aiAssistant.yes")} onPress={() => recommendDoctors(m.id)} />
                      <Chip label={t("aiAssistant.no")} onPress={() => declineDoctors(m.id)} />
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}

        {showExamples ? (
          <View style={{ marginTop: spacing.sm }}>
            <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.xs }}>{t("aiAssistant.examplesLabel")}</Text>
            <View style={[styles.chipRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {examples.map((ex) => <Chip key={ex} label={ex} onPress={() => send(ex)} />)}
            </View>
          </View>
        ) : null}

        <Text variant="caption" color="textMuted" align="center" style={{ marginTop: spacing.md }}>{t("aiAssistant.disclaimer")}</Text>
      </ScrollView>
    </Screen>
  );
}

function AiAvatar() {
  const { colors, spacing, isRTL } = useTheme();
  return (
    <View style={[styles.avatar, { backgroundColor: colors.primaryMuted, ...(isRTL ? { marginStart: spacing.xs } : { marginEnd: spacing.xs }) }]}>
      <MeMark height={14} color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  aiRow: { width: "100%", alignItems: "flex-start" },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 2 },
  bubble: { maxWidth: "100%", paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { maxWidth: "82%" },
  ts: { marginTop: 3, opacity: 0.8 },
  actions: { alignItems: "center", gap: 14, marginTop: 4 },
  retry: { alignItems: "center", marginTop: 6 },
  emergency: { paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10 },
  chipRow: { flexWrap: "wrap", gap: 8 },
  docRow: { alignItems: "center" },
  inputRow: { alignItems: "center" },
});
