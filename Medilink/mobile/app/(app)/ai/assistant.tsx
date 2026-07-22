import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Button, Icon, MeMark, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

/**
 * AI Symptom Checker (design p26). The patient describes their symptoms; on submit we
 * carry the real text to the AI Recommendations screen, which calls the live
 * POST /api/ai/suggest-doctor endpoint. (A full multi-turn chat is a future
 * enhancement — this screen intentionally forwards the typed symptoms, never a
 * scripted transcript.)
 */
export default function AiAssistantScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    router.push(`/ai/recommendations?symptoms=${encodeURIComponent(trimmed)}`);
  };

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder={t("aiAssistant.inputPlaceholder")}
            onSubmitEditing={submit}
            returnKeyType="search"
            trailing={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("aiAssistant.seeRecommendations")}
                accessibilityState={{ disabled: !canSubmit }}
                hitSlop={8}
                disabled={!canSubmit}
                onPress={submit}
                style={{ opacity: canSubmit ? 1 : 0.35 }}
              >
                <Icon name="chevron" color="primary" direction={isRTL ? "left" : "right"} />
              </Pressable>
            }
          />
          <Button label={t("aiAssistant.seeRecommendations")} onPress={submit} disabled={!canSubmit} />
        </View>
      }
    >
      <AppHeader
        title={t("aiAssistant.title")}
        showBack
        right={<MeMark height={16} color={colors.primary} />}
      />

      {/* Assistant intro (static UI copy, not a scripted conversation). */}
      <View
        style={[
          styles.bubbleRow,
          { flexDirection: isRTL ? "row-reverse" : "row", marginBottom: spacing.md },
        ]}
      >
        <View
          style={[
            styles.avatarDot,
            { backgroundColor: colors.primaryMuted, ...(isRTL ? { marginStart: spacing.xs } : { marginEnd: spacing.xs }) },
          ]}
        >
          <MeMark height={16} color={colors.primary} />
        </View>
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: colors.surfaceAlt,
              borderRadius: radii.lg,
              borderStartStartRadius: radii.sm,
            },
          ]}
        >
          <Text variant="body" align={isRTL ? "right" : "left"}>
            {t("aiAssistant.intro")}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.disclaimer,
          {
            flexDirection: isRTL ? "row-reverse" : "row",
            backgroundColor: colors.surfaceAlt,
            borderRadius: radii.md,
            padding: spacing.md,
          },
        ]}
      >
        <Icon name="info" size={18} color="textMuted" />
        <Text
          variant="caption"
          color="textMuted"
          align={isRTL ? "right" : "left"}
          style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}
        >
          {t("aiAssistant.disclaimer")}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { alignItems: "flex-end", width: "100%" },
  avatarDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 10 },
  disclaimer: { alignItems: "center" },
});
