import React, { forwardRef } from "react";
import { StyleSheet, View, type TextInput } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { TextField, type TextFieldProps } from "./TextField";
import { Text } from "./Text";

export interface PhoneFieldProps extends Omit<TextFieldProps, "leading" | "keyboardType"> {
  /** Country dial code shown as a prefix. Reusable — swap for a picker later. */
  dialCode?: string;
}

/**
 * Phone input with a country dial-code prefix. Defaults to Oman (+968) but the
 * `dialCode` prop keeps it reusable; the prefix block is where a country-code
 * picker would mount in a later iteration.
 *
 * TODO: replace the static prefix with a CountryCodePicker (search + flags).
 */
export const PhoneField = forwardRef<TextInput, PhoneFieldProps>(function PhoneField(
  { dialCode = "+968", ...rest },
  ref
) {
  const { colors, isRTL } = useTheme();
  return (
    <TextField
      ref={ref}
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      maxLength={8}
      leading={
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
