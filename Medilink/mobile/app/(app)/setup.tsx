import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { BloodGroup, Gender } from "@/data/types";

import { AppHeader, Button, Chip, DateField, PhoneField, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useProfile, useUpdateProfile } from "@/hooks/queries/usePatient";
import { CIVIL_NUMBER_LENGTH, isValidCivilNumber, isValidOmanPhone } from "@/utils/validation";

const GENDERS: { value: Gender; key: "genderMale" | "genderFemale" | "genderOther" }[] = [
  { value: "male", key: "genderMale" },
  { value: "female", key: "genderFemale" },
  { value: "other", key: "genderOther" },
];

const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mandatory first-time profile setup. Reached only via the (app) gate when the
 * patient has no `date_of_birth` yet (schema-free "not onboarded" signal, matching
 * the web rule). Saving a valid DOB flips that signal and lets the gate pass the
 * user into the app. Civil Number behaves exactly like Edit Profile (optional,
 * numeric, ≤8 digits, validated). Saves through the existing profile API.
 */
export default function SetupScreen() {
  const { spacing, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();

  const profile = useProfile();
  const update = useUpdateProfile();

  const account = profile.data?.account;
  const patient = profile.data?.patient;

  const [fullName, setFullName] = useState(account?.full_name ?? "");
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [dob, setDob] = useState(patient?.date_of_birth ?? "");
  const [gender, setGender] = useState<Gender | undefined>(patient?.gender ?? undefined);
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | undefined>(
    patient?.blood_group && patient.blood_group !== "unknown" ? patient.blood_group : undefined
  );
  const [civilNumber, setCivilNumber] = useState(patient?.civil_number ?? "");
  const [emergency, setEmergency] = useState(patient?.emergency_contact ?? "");

  const civilError = isValidCivilNumber(civilNumber) ? undefined : t("validation.civilNumber");
  const dobValid = DOB_RE.test(dob.trim());
  // Emergency contact is a phone number now (QA #3): optional, Oman 8-digit when set.
  const emergencyError = isValidOmanPhone(emergency) ? undefined : t("validation.phone");
  const canFinish = !!fullName.trim() && dobValid && !!gender && !civilError && !emergencyError;

  const onFinish = () => {
    if (!canFinish) return;
    update.mutate(
      {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        date_of_birth: dob.trim(),
        gender: gender ?? null,
        blood_group: bloodGroup ?? "unknown",
        civil_number: civilNumber.trim() || null,
        emergency_contact: emergency.trim() || null,
      },
      {
        // DOB is now set → the (app) gate stops forcing setup; go to the app.
        onSuccess: () => router.replace("/dashboard"),
        onError: () => Alert.alert(t("errors.saveFailed")),
      }
    );
  };

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}
      footer={
        <Button
          label={t("setup.finish")}
          loading={update.isPending}
          disabled={!canFinish}
          onPress={onFinish}
        />
      }
    >
      <AppHeader title={t("setup.title")} />
      <Text variant="body" color="textMuted" style={{ marginBottom: spacing.lg }}>
        {t("setup.subtitle")}
      </Text>

      <TextField
        label={t("profile.fullName")}
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        containerStyle={{ marginBottom: spacing.md }}
      />

      {/* Date of birth — native picker, capped at today (QA #1); stored as YYYY-MM-DD */}
      <DateField
        label={t("profile.dob")}
        value={dob}
        onChange={setDob}
        placeholder={t("profile.dobPlaceholder")}
        error={dob.trim() && !dobValid ? t("validation.required") : undefined}
        containerStyle={{ marginBottom: spacing.md }}
      />

      <Text variant="label" color="textMuted" style={{ marginBottom: 8, letterSpacing: 0.5 }}>
        {t("profile.gender").toUpperCase()}
      </Text>
      <View style={[styles.chips, { marginBottom: spacing.md, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {GENDERS.map((g) => (
          <Chip
            key={g.value}
            label={t(`profile.${g.key}`)}
            selected={gender === g.value}
            onPress={() => setGender(gender === g.value ? undefined : g.value)}
          />
        ))}
      </View>

      {/* Blood group — enum chips (no free-text; prevents invalid values like "XY") — QA #2 */}
      <Text variant="label" color="textMuted" style={{ marginBottom: 8, letterSpacing: 0.5 }}>
        {t("profile.bloodGroup").toUpperCase()}
      </Text>
      <View style={[styles.chips, { marginBottom: spacing.md, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {BLOOD_GROUPS.map((bg) => (
          <Chip
            key={bg}
            label={bg}
            selected={bloodGroup === bg}
            onPress={() => setBloodGroup(bloodGroup === bg ? undefined : bg)}
          />
        ))}
      </View>

      {/* Civil number — optional; identical rules to Edit Profile */}
      <TextField
        label={t("profile.civilNumber")}
        value={civilNumber}
        // Clamp length in JS (not via native `maxLength`) to avoid the controlled-input
        // boundary bug that makes the last digit un-editable. See edit-profile.tsx. (F2)
        onChangeText={(v) => setCivilNumber(v.replace(/[^0-9]/g, "").slice(0, CIVIL_NUMBER_LENGTH))}
        keyboardType="number-pad"
        placeholder={t("profile.civilNumberPlaceholder")}
        error={civilError}
        containerStyle={{ marginBottom: spacing.md }}
      />

      <TextField
        label={t("profile.phone")}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        containerStyle={{ marginBottom: spacing.md }}
      />

      {/* Emergency contact — phone number only (QA #3): numeric, +968, validated */}
      <PhoneField
        label={t("profile.emergencyContact")}
        value={emergency}
        onChangeText={setEmergency}
        placeholder={t("profile.emergencyPlaceholder")}
        error={emergencyError}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
