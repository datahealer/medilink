import React, { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router } from "expo-router";

import { Button, ProgressDots, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { useOnboardingStore } from "@/stores/onboardingStore";

interface Slide {
  titleKey: MessageKey;
  bodyKey: MessageKey;
}

const SLIDES: Slide[] = [
  { titleKey: "onboarding.slide1Title", bodyKey: "onboarding.slide1Body" },
  { titleKey: "onboarding.slide2Title", bodyKey: "onboarding.slide2Body" },
  { titleKey: "onboarding.slide3Title", bodyKey: "onboarding.slide3Body" },
];

export default function OnboardingScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const complete = useOnboardingStore((s) => s.complete);

  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  const finish = () => {
    complete();
    router.replace("/language");
  };

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(next, SLIDES.length - 1));
    listRef.current?.scrollToOffset({ offset: clamped * width, animated: true });
    setIndex(clamped);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(Math.abs(e.nativeEvent.contentOffset.x) / width);
    setIndex(next);
  };

  return (
    <Screen padded={false} dismissKeyboardOnTap={false}>
      {/* Skip */}
      <View style={[styles.skipRow, { paddingHorizontal: spacing.lg, alignItems: isRTL ? "flex-start" : "flex-end" }]}>
        <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel={t("common.skip")} hitSlop={8}>
          <Text variant="label" color="textMuted">
            {t("common.skip")}
          </Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width, paddingHorizontal: spacing.lg }]}>
            {/* Illustration placeholder — a plain lavender circle, matching the PDF
                onboarding artboards (no logo/pattern inside). */}
            <View style={[styles.illustration, { backgroundColor: colors.accent }]} />
            <Text variant="h1" align="center" style={{ marginTop: spacing.xl }}>
              {t(item.titleKey)}
            </Text>
            <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
              {t(item.bodyKey)}
            </Text>
          </View>
        )}
      />

      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
        <ProgressDots count={SLIDES.length} activeIndex={index} />
        <View style={[styles.controls, { marginTop: spacing.lg, flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={styles.controlSide}>
            {index > 0 ? (
              <Button label={t("common.back")} variant="ghost" fullWidth={false} onPress={() => goTo(index - 1)} />
            ) : null}
          </View>
          <View style={styles.controlSide}>
            {/* PDF onboarding uses a rounded button for both Next and Get Started. */}
            <Button
              label={isLast ? t("common.getStarted") : t("common.next")}
              fullWidth={false}
              onPress={() => (isLast ? finish() : goTo(index + 1))}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skipRow: { alignItems: "flex-end", paddingVertical: 12 },
  slide: { flex: 1, alignItems: "center", justifyContent: "center" },
  illustration: { width: 200, height: 200, borderRadius: 100, alignItems: "center", justifyContent: "center" },
  controls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  controlSide: { flex: 1 },
});
