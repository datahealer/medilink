import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import {
  PHONE_COUNTRY_LIST,
  searchPhoneCountries,
  type PhoneCountry,
} from "@medilink/shared/mobile";

import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { Icon } from "./Icon";
import { PhoneField } from "./PhoneField";
import { Text } from "./Text";
import { TextField } from "./TextField";

export interface CountryPhoneFieldProps {
  label?: string;
  /** The selected country. Owned by the caller so the value and the country stay in sync. */
  country: PhoneCountry;
  onCountryChange: (country: PhoneCountry) => void;
  /** LOCAL subscriber digits only — never the dial code. */
  value: string;
  onChangeText: (local: string) => void;
  error?: string;
  /** Countries to offer. Defaults to the full registry; pass a subset to restrict. */
  countries?: readonly PhoneCountry[];
  testID?: string;
}

/**
 * Country selector + local phone input, as one reusable field.
 *
 * ── ONE NORMALISATION SYSTEM, NOT TWO ──
 *
 * This adds a picker; it adds NO parsing, validation or formatting of its own. The country
 * list, the per-country length, detection and E.164 assembly all come from the existing
 * shared registry (`PHONE_COUNTRIES` / `phoneE164` / `phoneLocal`), and the text input is
 * the existing `PhoneField`, which already folds Arabic-Indic digits, strips a pasted dial
 * code and caps at the country's length. A second phone system is exactly how the +91
 * truncation bug (G2) happened, so there deliberately isn't one.
 *
 * ── THE VALUE IS ALWAYS LOCAL DIGITS ──
 *
 * `value` holds subscriber digits only. The dial code is rendered, never typed, and is
 * re-attached at the write boundary with `phoneE164`. That is what makes `+968+96891234567`
 * structurally impossible rather than merely unlikely.
 *
 * ── SWITCHING COUNTRY CLEARS THE NUMBER ──
 *
 * Deliberate, and it is a correctness rule rather than a convenience. Eight Oman digits are
 * not the first eight of a ten-digit Indian number; carrying them across produces a
 * plausible-looking WRONG number that passes every length check. The caller performs the
 * clear (it owns the value), and both call sites do.
 */
export function CountryPhoneField({
  label,
  country,
  onCountryChange,
  value,
  onChangeText,
  error,
  countries = PHONE_COUNTRY_LIST,
  testID,
}: CountryPhoneFieldProps) {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchPhoneCountries(query, countries), [query, countries]);
  const nameFor = (c: PhoneCountry) => (locale === "ar" ? c.nameAr : c.name);

  return (
    <View testID={testID}>
      {label ? (
        <Text variant="label" color="textMuted" style={{ marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
          {label}
        </Text>
      ) : null}

      <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {/* Country trigger. 48px tall — comfortably past the 44dp minimum touch target. */}
        <Pressable
          onPress={() => {
            setQuery("");
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t("phoneCountry.selectLabel", { country: nameFor(country) })}
          accessibilityHint={t("phoneCountry.selectHint")}
          style={[
            styles.trigger,
            {
              flexDirection: isRTL ? "row-reverse" : "row",
              borderColor: error ? colors.error : colors.border,
              backgroundColor: colors.surface,
              borderRadius: radii.md,
            },
          ]}
        >
          <Text variant="title">{country.flag}</Text>
          {/* Latin digits, forced LTR so "+968" never reverses in an Arabic UI. */}
          <Text
            variant="body"
            style={[{ writingDirection: "ltr" }, isRTL ? { marginEnd: 6 } : { marginStart: 6 }]}
          >
            {country.dialCode}
          </Text>
          <Icon name="chevron" direction="down" size={16} tint={colors.textMuted} />
        </Pressable>

        {/* The input holds LOCAL digits only. PhoneField owns sanitisation and the cap. */}
        <View style={styles.input}>
          <PhoneField
            dialCode={country.dialCode}
            value={value}
            onChangeText={onChangeText}
            error={error}
            // The dial code is already shown by the trigger to the left; repeating it inside
            // the input would read as "+968 +968". The LENGTH CAP still follows dialCode.
            showDialCode={false}
          />
        </View>
      </View>

      <Modal
        visible={open}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setOpen(false)}
        // Android hardware back closes the sheet rather than leaving the screen.
        presentationStyle="pageSheet"
      >
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: spacing.lg }}>
          <View
            style={[
              styles.sheetHeader,
              { paddingHorizontal: spacing.lg, flexDirection: isRTL ? "row-reverse" : "row" },
            ]}
          >
            <Text variant="title">{t("phoneCountry.title")}</Text>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <Icon name="close" size={22} tint={colors.text} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder={t("phoneCountry.searchPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t("phoneCountry.searchPlaceholder")}
              leading={<Icon name="search" size={18} tint={colors.textMuted} />}
            />
          </View>

          <FlatList
            data={results as PhoneCountry[]}
            keyExtractor={(c) => c.iso}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
            ListEmptyComponent={
              <Text variant="body" color="textMuted" style={{ textAlign: "center", paddingTop: spacing.xl }}>
                {t("phoneCountry.noResults")}
              </Text>
            }
            renderItem={({ item }) => {
              const selected = item.iso === country.iso;
              return (
                <Pressable
                  onPress={() => {
                    onCountryChange(item);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${nameFor(item)} ${item.dialCode}`}
                  style={[
                    styles.item,
                    {
                      flexDirection: isRTL ? "row-reverse" : "row",
                      backgroundColor: selected ? colors.surface : "transparent",
                      borderRadius: radii.md,
                    },
                  ]}
                >
                  <Text variant="title">{item.flag}</Text>
                  <Text
                    variant="body"
                    style={[{ flex: 1 }, isRTL ? { marginEnd: 12, textAlign: "right" } : { marginStart: 12 }]}
                    numberOfLines={1}
                  >
                    {nameFor(item)}
                  </Text>
                  <Text variant="body" color="textMuted" style={{ writingDirection: "ltr" }}>
                    {item.dialCode}
                  </Text>
                  {selected ? (
                    <Icon
                      name="done"
                      size={18}
                      tint={colors.primary}
                      style={isRTL ? { marginEnd: 8 } : { marginStart: 8 }}
                    />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "flex-start", gap: 8 },
  trigger: {
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 4,
  },
  input: { flex: 1 },
  sheetHeader: { alignItems: "center", justifyContent: "space-between", paddingBottom: 8 },
  item: { alignItems: "center", paddingVertical: 12, paddingHorizontal: 8, minHeight: 48 },
});
