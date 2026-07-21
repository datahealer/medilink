import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { BackButton, Button, OtpInput, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { authService } from "@/services/authService";
import { repositories } from "@/data";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 24;

export default function OtpScreen() {
  const { spacing } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();
  const { target, email, flow } = useLocalSearchParams<{ target?: string; email?: string; flow?: string }>();
  // `flow=recovery` = password-reset OTP; `flow=login` = passwordless email login
  // (F5); default is signup confirmation.
  const isRecovery = flow === "recovery";
  const isLogin = flow === "login";
  // Prefer the display target; fall back to the email, then a generic phrase.
  const shownTarget = (target || email || "").trim();

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
    // Login goes through the repository (mock-mode aware); signup/recovery keep the
    // existing authService path.
    const res = isLogin
      ? await repositories.auth.verifyLoginOtp(code, email ?? "")
      : await authService.verifyOtp(code, email, isRecovery ? "recovery" : "signup");
    setLoading(false);
    if (res.ok) {
      // Login / Signup: session established → dashboard.
      // Recovery: a recovery session is now active → set the new password.
      router.replace(isRecovery ? "/auth/reset-password" : "/dashboard");
    } else {
      setFormError(t(res.messageKey ?? "errors.unknown"));
    }
  };

  const resend = async () => {
    if (secondsLeft > 0) return;
    setFormError(null);
    // Recovery re-issues the reset email; login re-sends the email login code;
    // signup re-sends the confirmation OTP.
    const res = isRecovery
      ? await authService.requestPasswordReset(email ?? "")
      : isLogin
        ? await repositories.auth.sendLoginOtp(email ?? "")
        : await authService.sendOtp(email);
    if (!res.ok) setFormError(t(res.messageKey ?? "errors.unknown"));
    setSecondsLeft(RESEND_SECONDS);
    setCode("");
    setShowError(false);
  };

  const mmss = `0:${String(secondsLeft).padStart(2, "0")}`;

  return (
    <Screen scroll padded contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}>
      <View style={{ marginBottom: 8, marginStart: -8 }}>
        {/* OTP is always pushed, but keep an explicit fallback so back is never a no-op. */}
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/auth/sign-in"))} />
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
