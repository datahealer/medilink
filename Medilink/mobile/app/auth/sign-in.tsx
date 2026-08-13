import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";

import {
  BackButton,
  Button,
  Checkbox,
  Icon,
  PasswordField,
  PhoneField,
  Screen,
  Text,
  TextField,
} from "@/components/ui";
import { isGoogleConfigured } from "@/config/env";
import { getRememberedEmail } from "@/lib/authPersistence";
import { repositories, isMockData } from "@/data";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { reportError } from "@/services/reporting";
import { AUTH_ROUTE_SIGN_UP, crossLinkAction } from "@/utils/authNav";
import { signInSchema, type SignInForm } from "@/utils/validation";
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  phoneE164,
  type PhoneCountry,
} from "@medilink/shared/mobile";

/** Countries whose numbers may be used to sign in. Mirrors the backend allow-list. */
const PHONE_LOGIN_COUNTRIES: PhoneCountry[] = [PHONE_COUNTRIES.OM, PHONE_COUNTRIES.IN];

export default function SignInScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // F5: identifier channel for passwordless login. Phone is intentionally disabled
  // (blocked on an SMS provider — plan F4 §5); Email OTP is the live path.
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [sendingCode, setSendingCode] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [phoneLocal, setPhoneLocal] = useState("");

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<SignInForm>({
    resolver: zodResolver(signInSchema(t)),
    defaultValues: { email: "", password: "", remember: false },
    // QA MED-017 — "onTouched", not "onBlur". RHF's `reValidateMode` only takes effect
    // AFTER the first submit, so under "onBlur" a user who fixed an invalid email kept
    // staring at the stale error until they blurred the field again. "onTouched"
    // validates on the first blur (so we don't shout while they're still typing) and on
    // every change after that, which clears the error the moment it is corrected.
    mode: "onTouched",
  });

  // QA MED-018 — restore "Remember me".
  //
  // The form previously hardcoded `remember: false` and never read the saved preference
  // back, so the checkbox reset to unchecked on every visit and signing in without
  // re-ticking it silently disabled the feature. A stored address IS the preference:
  // present → prefill the field and tick the box; absent → the previous empty default,
  // which is also what a fresh install sees.
  //
  // Only the email is restored. The password field stays empty by design — it is never
  // persisted anywhere (see lib/authPersistence.ts).
  useEffect(() => {
    let active = true;
    void (async () => {
      const remembered = await getRememberedEmail();
      if (!active || !remembered) return;
      setValue("email", remembered);
      setValue("remember", true);
    })();
    return () => {
      active = false;
    };
  }, [setValue]);

  // F5: send a passwordless email login code, then go to the OTP screen (flow=login).
  const onSendCode = async () => {
    setFormError(null);
    const valid = await trigger("email");
    if (!valid) return;
    const email = getValues("email").trim();
    setSendingCode(true);
    try {
      const res = await repositories.auth.sendLoginOtp(email);
      if (res.ok) {
        router.push(`/auth/otp?flow=login&email=${encodeURIComponent(email)}&target=${encodeURIComponent(email)}`);
      } else {
        setFormError(t(res.messageKey ?? "errors.unknown"));
      }
    } catch {
      setFormError(t("errors.unknown"));
    } finally {
      setSendingCode(false);
    }
  };

  const onSubmit = async (values: SignInForm) => {
    if (__DEV__) console.log("[MediLink] sign-in button pressed");
    setFormError(null);
    setLoading(true);
    try {
      // Route through the active repository (mock in DATA_MODE=mock, real otherwise) —
      // never call the backend transport directly, so mock mode stays offline.
      const res = await repositories.auth.signIn(values);
      if (res.ok) {
        if (__DEV__ && isMockData) console.log("[MediLink] mock sign-in success");
        router.replace("/dashboard");
      } else {
        setFormError(t(res.messageKey ?? "errors.unknown"));
      }
    } catch (error) {
      // No credentials or identifiers in the report — only that sign-in threw.
      reportError(error, { tags: { surface: "sign-in" } });
      setFormError(t("errors.unknown"));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Native Google sign-in. Routed through the repository like every other auth call, so
   * mock mode stays offline (it returns "not configured" rather than hitting Google).
   *
   * Cancellation is silent by contract: `{ ok: false }` with NO messageKey means the
   * user dismissed the account sheet, and showing an error there would be wrong.
   */
  const onGoogle = async () => {
    setFormError(null);
    setGoogleLoading(true);
    try {
      const res = await repositories.auth.googleSignIn();
      if (res.ok) {
        // Onboarding is decided by (app)/_layout: a brand-new Google patient has a NULL
        // date_of_birth and is redirected to /setup from there. Never route around it.
        router.replace("/dashboard");
      } else if (res.messageKey) {
        setFormError(t(res.messageKey));
      }
    } catch (error) {
      // No tokens or identifiers in the report — only that the flow threw.
      reportError(error, { tags: { surface: "sign-in-google" } });
      setFormError(t("errors.googleSignInFailed"));
    } finally {
      setGoogleLoading(false);
    }
  };

  /**
   * QA MED-023 — "Create one" used replace(), which dropped THIS screen from the stack so
   * Back from sign-up landed on the guest wall. The rule (and why it is not a blanket
   * push) lives in utils/authNav.ts.
   */
  const goToSignUp = () => {
    const routeNames = (navigation.getState()?.routes ?? []).map((r) => r.name);
    if (crossLinkAction(routeNames, AUTH_ROUTE_SIGN_UP) === "back") {
      router.back();
    } else {
      router.push("/auth/sign-up");
    }
  };

  return (
    <Screen scroll padded contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}>
      <View style={[styles.header, { flexDirection: isRTL ? "row-reverse" : "row" }, isRTL ? { marginEnd: -8 } : { marginStart: -8 }]}>
        {/* Explicit fallback: a returning user or a deep link can land here as the stack
            root, where back() would no-op. Cross-links now push (QA MED-023), so in the
            normal guest-wall flow canGoBack() is true and this resolves to the real
            previous screen. */}
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))} />
      </View>

      <Text variant="h1">{t("signIn.welcomeBack")}</Text>
      <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
        {t("signIn.subtitle")}
      </Text>

      {/* Dev-only: shown only when running on mock data (DATA_MODE=mock). */}
      {isMockData ? (
        <View
          style={[
            styles.demoBanner,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" },
          ]}
        >
          <Icon name="lab" size={16} tint={colors.primary} />
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            Demo mode: use demo@medilink.test / Demo1234!
          </Text>
        </View>
      ) : null}

      {/* F5: Email / Mobile identifier selector. */}
      <View style={[styles.segment, { borderColor: colors.border, marginBottom: spacing.md, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable
          onPress={() => setChannel("email")}
          accessibilityRole="button"
          accessibilityState={{ selected: channel === "email" }}
          style={[styles.segmentBtn, channel === "email" && { backgroundColor: colors.primary }]}
        >
          <Text variant="label" style={{ color: channel === "email" ? "#FFFFFF" : colors.textMuted }}>
            {t("signIn.identifierEmail")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setChannel("phone");
            setFormError(null);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: channel === "phone" }}
          style={[styles.segmentBtn, channel === "phone" && { backgroundColor: colors.primary }]}
        >
          <Text variant="label" style={{ color: channel === "phone" ? "#FFFFFF" : colors.textMuted }}>
            {t("signIn.identifierPhone")}
          </Text>
        </Pressable>
      </View>

      {/* PHONE LOGIN — passwordless, for accounts that have a VERIFIED number attached
          (Settings → Mobile number). Delivery is Twilio Verify configured as Supabase's SMS
          provider, so this stays a pure Supabase Auth call and yields a normal session.

          Existing accounts only: `shouldCreateUser: false` is set in shared/api/auth.ts, so
          this can never create a phone-only user — which matters because `profiles.email`
          is NOT NULL and such a signup would fail at the provisioning trigger. */}
      {channel === "phone" ? (
        <View style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginBottom: spacing.sm }}>
            {PHONE_LOGIN_COUNTRIES.map((c) => (
              <Pressable
                key={c.iso}
                onPress={() => {
                  setPhoneCountry(c);
                  // Clear on switch — 8 Oman digits are not the first 8 of an Indian
                  // number, and carrying them across produces a plausible wrong number.
                  setPhoneLocal("");
                  setFormError(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: c.iso === phoneCountry.iso }}
                style={[
                  styles.segmentBtn,
                  {
                    flex: 0,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: c.iso === phoneCountry.iso ? colors.primary : colors.border,
                    backgroundColor: c.iso === phoneCountry.iso ? colors.primary : "transparent",
                  },
                ]}
              >
                <Text variant="label" style={{ color: c.iso === phoneCountry.iso ? "#FFFFFF" : colors.textMuted }}>
                  {c.dialCode}
                </Text>
              </Pressable>
            ))}
          </View>

          <PhoneField
            label={t("signIn.identifierPhone")}
            dialCode={phoneCountry.dialCode}
            value={phoneLocal}
            onChangeText={(v) => {
              setPhoneLocal(v);
              if (formError) setFormError(null);
            }}
          />

          <Text variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
            {t("signIn.sendCodeHintPhone")}
          </Text>

          <View style={{ height: spacing.md }} />
          <Button
            label={t("signIn.sendCode")}
            loading={sendingCode}
            onPress={async () => {
              setFormError(null);
              // Normalised here so a malformed number never costs an SMS; the server
              // re-normalises and re-validates regardless.
              const e164 = phoneE164(phoneLocal, phoneCountry);
              if (!e164) {
                setFormError(t("validation.phone"));
                return;
              }
              setSendingCode(true);
              const res = await repositories.auth.sendPhoneLoginOtp(e164);
              setSendingCode(false);
              // Enumeration-safe: an unknown number still routes to the OTP screen with
              // neutral copy — only rate-limit / network failures stop the flow.
              if (!res.ok) {
                setFormError(t(res.messageKey ?? "errors.unknown"));
                return;
              }
              router.push(`/auth/otp?flow=phone&target=${encodeURIComponent(e164)}`);
            }}
          />
        </View>
      ) : null}

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label={t("signIn.email")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="name@example.com"
            containerStyle={{ marginBottom: spacing.md }}
          />
        )}
      />

      {/* F5: passwordless email login (primary). Neutral enumeration-safe messaging. */}
      <Button label={t("signIn.sendCode")} loading={sendingCode} onPress={onSendCode} />
      <Text variant="caption" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
        {t("signIn.sendCodeHint")}
      </Text>

      {/* Password sign-in kept as a secondary path during the OTP transition. */}
      <View style={[styles.divider, { marginVertical: spacing.lg }]}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Text variant="caption" color="textMuted" style={{ marginHorizontal: 12 }}>
          {t("signIn.orPassword")}
        </Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordField
            label={t("signIn.password")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
            // No placeholder: the previous "••••••••" was eight literal U+2022 BULLET
            // characters, which rendered as fake masked input in an empty field and
            // vanished on the first keystroke (QA MED-003). The label already says
            // "Password", so no replacement string is needed — and adding one would
            // reintroduce untranslated copy. Sign-up and reset-password never had one.
          />
        )}
      />

      <View style={[styles.rowBetween, { marginTop: spacing.md, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Controller
          control={control}
          name="remember"
          render={({ field: { onChange, value } }) => (
            <View style={{ flex: 1 }}>
              <Checkbox checked={!!value} onChange={onChange} label={t("signIn.remember")} />
            </View>
          )}
        />
        <Pressable onPress={() => router.push("/auth/forgot-password")} hitSlop={8} accessibilityRole="link">
          <Text variant="label" color="primary">
            {t("signIn.forgot")}
          </Text>
        </Pressable>
      </View>

      <View style={{ height: spacing.lg }} />
      <Button label={t("signIn.submit")} loading={loading} onPress={handleSubmit(onSubmit)} />

      {/* Visible error box directly under the Login button. */}
      {formError ? (
        <View
          style={[styles.errorBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.error, flexDirection: isRTL ? "row-reverse" : "row" }]}
          accessibilityLiveRegion="polite"
        >
          <Icon name="alert" size={16} tint={colors.error} />
          <Text variant="caption" color="error" style={{ flex: 1 }}>
            {formError}
          </Text>
        </View>
      ) : null}

      {/* Social sign-in. The whole block is omitted when no provider is available on
          this platform, so the screen never ends with a stray "or" and a dead button.
          Today that means: Android → Google; iOS → nothing until Apple Sign-In ships
          (App Store Guideline 4.8 requires Apple alongside any social login, so Google
          on iOS is deliberately gated off — see src/config/env.ts). */}
      {isGoogleConfigured ? (
        <>
          <View style={[styles.divider, { marginVertical: spacing.lg }]}>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <Text variant="caption" color="textMuted" style={{ marginHorizontal: 12 }}>
              {t("signIn.or")}
            </Text>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          </View>

          <Button
            label={t("signIn.google")}
            variant="outline"
            loading={googleLoading}
            onPress={onGoogle}
            leading={<Ionicons name="logo-google" size={18} color={colors.primary} />}
          />
        </>
      ) : null}

      <View style={[styles.footer, { marginTop: spacing.xl, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text variant="body" color="textMuted">
          {t("signIn.noAccount")}{" "}
        </Text>
        {/* QA MED-023 — push so Back returns HERE, but pop if sign-up is already the
            screen below us (user toggling), so the stack cannot grow. See utils/authNav.ts. */}
        <Pressable onPress={goToSignUp} hitSlop={8} accessibilityRole="link">
          <Text variant="label" color="primary">
            {t("signIn.createOne")}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 8 },
  segment: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 14, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10 },
  rowBetween: { alignItems: "center", justifyContent: "space-between" },
  divider: { flexDirection: "row", alignItems: "center" },
  line: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  footer: { justifyContent: "center", alignItems: "center" },
  demoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
});
