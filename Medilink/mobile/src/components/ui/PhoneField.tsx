import React, { forwardRef } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { DEFAULT_PHONE_COUNTRY, phoneCountryForDialCode, phoneInput } from "@medilink/shared/mobile";

import { useTheme } from "@/hooks/useTheme";
import { TextField, type TextFieldProps } from "./TextField";
import { Text } from "./Text";

export interface PhoneFieldProps extends Omit<TextFieldProps, "leading" | "keyboardType"> {
  /** Country dial code. Drives BOTH the prefix shown and the length cap applied. */
  dialCode?: string;
  /**
   * Render the dial-code prefix inside the field. Default `true`.
   *
   * `false` when the caller already shows the code — `CountryPhoneField` puts it on the
   * country trigger to the left, and repeating it here would read as "+968 +968". The cap
   * still follows `dialCode` either way: hiding the prefix must never mean losing the rule.
   */
  showDialCode?: boolean;
}

/**
 * Phone input with a country dial-code prefix. Defaults to Oman (+968) but the
 * `dialCode` prop keeps it reusable; the prefix block is where a country-code
 * picker would mount in a later iteration.
 *
 * The field holds ONLY the 8 editable local digits — never the dial code, which is
 * rendered separately and re-attached at the write boundary (`omanPhoneE164`). Keeping the
 * prefix out of the value is what makes `+968+96891234567` structurally impossible.
 *
 * ── SANITISATION LIVES HERE, NOT IN EACH SCREEN (QA MED-007) ──
 *
 * Every keystroke and paste is filtered through `phoneInput`: Arabic-Indic digits are folded
 * to ASCII, non-digits are dropped, a pasted country code is removed, and the result is
 * capped at the COUNTRY's local length. So `#`, `;`, `*`, `+`, letters and emoji cannot enter
 * the value even though a soft keyboard or the clipboard may offer them.
 *
 * ── THE CAP FOLLOWS `dialCode` (QA G2) ──
 *
 * It used to be hardcoded to Oman's 8 regardless of the dial code shown, so this component
 * physically could not hold a 10-digit Indian number even when told it was rendering +91.
 * The country is now resolved from `dialCode`, and an unrecognised code falls back to Oman
 * rather than to "no limit" — a silent uncapped field is how unvalidated input reaches the
 * database.
 *
 * Two deliberate choices:
 *  • `number-pad`, not `phone-pad` — the phone pad offers `+ * # ,`, which this field can
 *    never accept, so showing them invites the exact input QA reported.
 *  • NO native `maxLength`. A controlled TextInput sitting exactly at `maxLength` hits an
 *    RN reconciliation bug where edits to the final character get reverted; the length cap
 *    is applied in JS instead. Same reasoning as the Civil Number fields (F2).
 *
 * TODO: replace the static prefix with a CountryCodePicker (search + flags).
 */
export const PhoneField = forwardRef<TextInput, PhoneFieldProps>(function PhoneField(
  { dialCode = "+968", showDialCode = true, onChangeText, ...rest },
  ref
) {
  const { colors, isRTL } = useTheme();
  const country = phoneCountryForDialCode(dialCode) ?? DEFAULT_PHONE_COUNTRY;
  return (
    <TextField
      ref={ref}
      keyboardType="number-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      onChangeText={onChangeText ? (raw) => onChangeText(phoneInput(raw, country)) : undefined}
      leading={
        !showDialCode ? null : (
        <View
          style={[
            styles.prefix,
            { borderColor: colors.border },
            // The TextField flips its adornment side in RTL, so the prefix's separator
            // border + spacing must move to the other edge (native layout stays LTR).
            isRTL
              ? { paddingStart: 10, marginStart: 6, borderStartWidth: StyleSheet.hairlineWidth * 2 }
              : { paddingEnd: 10, marginEnd: 6, borderEndWidth: StyleSheet.hairlineWidth * 2 },
          ]}
        >
          {/* Latin digits, force LTR so "+968" never reverses in an Arabic UI. */}
          <Text variant="title" color="textMuted" style={{ writingDirection: "ltr" }}>
            {dialCode}
          </Text>
        </View>
        )
      }
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  prefix: {
    justifyContent: "center",
  },
});
