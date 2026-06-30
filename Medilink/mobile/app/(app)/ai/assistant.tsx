import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Button, Chip, Icon, MeMark, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

type BubbleProps = { text: string; from: "assistant" | "user" };

/** AI Symptom Checker chat (design p26) — static transcript with mock bubbles. */
export default function AiAssistantScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  const Bubble = ({ text, from }: BubbleProps) => {
    const isAssistant = from === "assistant";
    return (
      <View
        style={[
          styles.bubbleRow,
          {
            flexDirection: isRTL ? "row-reverse" : "row",
            justifyContent: isAssistant ? "flex-start" : "flex-end",
            marginBottom: spacing.sm,
          },
        ]}
      >
        {isAssistant ? (
          <View style={[styles.avatarDot, { backgroundColor: colors.primaryMuted, marginEnd: spacing.xs }]}>
            <MeMark height={16} color={colors.primary} />
          </View>
        ) : null}
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isAssistant ? colors.surfaceAlt : colors.primary,
              borderRadius: radii.lg,
              borderStartStartRadius: isAssistant ? radii.sm : radii.lg,
              borderEndEndRadius: isAssistant ? radii.lg : radii.sm,
            },
          ]}
        >
          <Text
            variant="body"
            color={isAssistant ? "text" : "textOnPrimary"}
            align={isRTL ? "right" : "left"}
          >
            {text}
          </Text>
        </View>
      </View>
    );
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
            trailing={
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => undefined}>
                <Icon name="chevron" color="primary" />
              </Pressable>
            }
          />
          <Button
            label={t("aiAssistant.seeRecommendations")}
            onPress={() => router.push("/ai/recommendations")}
          />
        </View>
      }
    >
      <AppHeader
        title={t("aiAssistant.title")}
        showBack
        right={<MeMark height={16} color={colors.primary} />}
      />

      <Bubble from="assistant" text={t("aiAssistant.greeting", { name: "Aisha" })} />
      <Bubble from="user" text={t("aiAssistant.sampleUser")} />
      <Bubble from="assistant" text={t("aiAssistant.followUp")} />

      <View
        style={[
          styles.chipRow,
          { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.xs },
        ]}
      >
        {[t("aiAssistant.quickYes"), t("aiAssistant.quickNo"), t("aiAssistant.quickSometimes")].map(
          (label) => (
            <Chip key={label} label={label} onPress={() => undefined} />
          ),
        )}
      </View>

      <View
        style={[
          styles.disclaimer,
          {
            flexDirection: isRTL ? "row-reverse" : "row",
            backgroundColor: colors.surfaceAlt,
            borderRadius: radii.md,
            padding: spacing.md,
            marginTop: spacing.md,
          },
        ]}
      >
        <Icon name="info" size={18} color="textMuted" />
        <Text
          variant="caption"
          color="textMuted"
          align={isRTL ? "right" : "left"}
          style={{ flex: 1, marginStart: spacing.sm }}
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
  chipRow: { flexWrap: "wrap", gap: 8 },
  disclaimer: { alignItems: "center" },
});
