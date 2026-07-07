import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { BackButton, Button, OtpInput, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { authService } from "@/services/authService";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 24;

export default function OtpScreen() {
  const { spacing } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();
  const { target, phone } = useLocalSearchParams<{ target?: string; phone?: string }>();
  // Prefer the display target; fall back to the raw phone, then a generic phrase.
  const shownTarget = (target || phone || "").trim();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [showError, setShowError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const verify = async () => {
    setFormError(null);
    if (code.length < OTP_LENGTH) {
      setShowError(true);
      return;
    }
    setLoading(true);
    const res = await authService.verifyOtp(code, phone);
    setLoading(false);
    if (res.ok) {
      // Phone verified — the user is already signed in → go to the dashboard.
      router.replace("/dashboard");
    } else {
      setFormError(t(res.messageKey ?? "errors.unknown"));
    }
  };

  const resend = async () => {
    if (secondsLeft > 0) return;
    setFormError(null);
    const res = await authService.sendOtp(phone);
    if (!res.ok) setFormError(t(res.messageKey ?? "errors.unknown"));
    setSecondsLeft(RESEND_SECONDS);
    setCode("");
    setShowError(false);
  };

  const mmss = `0:${String(secondsLeft).padStart(2, "0")}`;

  return (
    <Screen scroll padded contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}>
      <View style={{ marginBottom: 8, marginStart: -8 }}>
        <BackButton />
      </View>

      <Text variant="h1">{t("otp.title")}</Text>
      <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
        {/* Show the real number when we have it; never render a dangling "sent to ." (audit P2.1). */}
        {shownTarget ? t("otp.subtitle", { target: shownTarget }) : t("otp.subtitleGeneric")}
      </Text>

      <OtpInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (showError) setShowError(false);
        }}
        length={OTP_LENGTH}
        error={showError}
        onComplete={() => {}}
      />
      {showError ? (
        <Text variant="caption" color="error" style={{ marginTop: spacing.sm }}>
          {t("validation.otpIncomplete")}
        </Text>
      ) : null}
      {formError ? (
        <Text variant="caption" color="error" style={{ marginTop: spacing.sm }} accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}

      <View style={{ height: spacing.lg }} />
      <Button label={t("otp.verify")} loading={loading} onPress={verify} />

      <View style={[styles.resendRow, { marginTop: spacing.lg }]}>
        {secondsLeft > 0 ? (
          <Text variant="label" color="textMuted">
            {t("otp.resendIn", { seconds: mmss })}
          </Text>
        ) : (
          <Pressable onPress={resend} hitSlop={8} accessibilityRole="button">
            <Text variant="label" color="primary">
              {t("otp.resend")}
            </Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  resendRow: { alignItems: "center" },
});
