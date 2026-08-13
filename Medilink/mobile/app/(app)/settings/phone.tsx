import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Button, PhoneField, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { repositories } from "@/data";
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  phoneE164,
  type PhoneCountry,
} from "@medilink/shared/mobile";

/**
 * Verify / change the signed-in patient's mobile number.
 *
 * The verification itself runs SERVER-SIDE (`/api/auth/phone/{start,check}`): the client
 * never calls `supabase.auth.updateUser({ phone })`, because that stages the number in
 * `auth.users.phone_change` — a column with no uniqueness constraint that GoTrue searches
 * to resolve the user at verification time, so an abandoned attempt by another account can
 * capture the number. See the note in shared/src/api/auth.ts.
 *
 * This screen therefore only collects and normalises a number, then hands off to the
 * existing OTP screen with `flow=phoneLink`.
 */
const COUNTRIES: PhoneCountry[] = [PHONE_COUNTRIES.OM, PHONE_COUNTRIES.IN];

export default function PhoneSettingsScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const [country, setCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [local, setLocal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The badge reads `auth.users.phone_confirmed_at` via the backend, NOT
   * `profiles.phone_verified` — the retired verify-otp route set that mirror to true after
   * checking a code that was never actually delivered, so legacy rows can claim a
   * verification that never happened.
   */
  const [current, setCurrent] = useState<{ phone: string | null; confirmed: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void repositories.auth.getPhoneConfirmation().then((s) => {
      if (alive) setCurrent(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onSend = async () => {
    setError(null);
    // Normalised HERE so an obviously-wrong number never costs an SMS. The backend
    // re-normalises and re-validates regardless — this check is UX, that one is the rule.
    const e164 = phoneE164(local, country);
    if (!e164) {
      setError(t("validation.phone"));
      return;
    }
    setLoading(true);
    const res = await repositories.auth.startPhoneLink(e164);
    setLoading(false);
    if (!res.ok) {
      setError(t(res.messageKey ?? "errors.unknown"));
      return;
    }
    router.push(`/auth/otp?flow=phoneLink&target=${encodeURIComponent(e164)}`);
  };

  return (
    <Screen scroll padded contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}>
      <AppHeader title={t("phone.title")} showBack />

      <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}>
        {t("phone.subtitle")}
      </Text>

      {/* Current state. `num` localises the digits so Arabic reads ٩٦٨+ rather than 968+. */}
      <Text variant="label" color="textMuted" align={isRTL ? "right" : "left"}>
        {t("phone.current")}
      </Text>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, marginTop: 4 }}>
        <Text variant="title">{current?.phone ? num(current.phone) : t("phone.notAdded")}</Text>
        {current?.phone ? (
          <Text variant="caption" style={{ color: current.confirmed ? colors.success : colors.textMuted }}>
            {current.confirmed ? t("phone.verified") : t("phone.unverified")}
          </Text>
        ) : null}
      </View>

      <View style={{ height: spacing.xl }} />

      {/* Country selector — an allow-list, mirroring the backend's. Oman is the market;
          India is supported because the team tests there and patients travel. */}
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginBottom: spacing.md }}>
        {COUNTRIES.map((c) => {
          const on = c.iso === country.iso;
          return (
            <Button
              key={c.iso}
              label={num(c.dialCode)}
              variant={on ? "primary" : "ghost"}
              onPress={() => {
                setCountry(c);
                // Clear on switch: 8 Oman digits are not the first 8 of an Indian number,
                // and carrying them over produces a plausible-looking wrong number.
                setLocal("");
                setError(null);
              }}
            />
          );
        })}
      </View>

      <PhoneField
        label={t("phone.label")}
        dialCode={country.dialCode}
        value={local}
        onChangeText={(v) => {
          setLocal(v);
          if (error) setError(null);
        }}
        error={error ?? undefined}
      />

      <View style={{ height: spacing.lg }} />
      <Button label={t("phone.send")} loading={loading} onPress={onSend} />
    </Screen>
  );
}
