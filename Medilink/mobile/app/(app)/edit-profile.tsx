import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { omanPhoneE164 } from "@medilink/shared/mobile";
import type { BloodGroup, Gender } from "@/data/types";

import {
  AppHeader,
  Avatar,
  Button,
  Chip,
  DateField,
  ErrorState,
  Icon,
  LoadingState,
  PhoneField,
  Screen,
  Text,
  TextField,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import {
  useMedicalHistory,
  useProfile,
  useUpdateProfile,
  useUploadProfilePhoto,
  useUpsertMedicalHistory,
} from "@/hooks/queries/usePatient";
import {
  CIVIL_NUMBER_LENGTH,
  extractOmanLocalPhone,
  isValidCivilNumber,
  isValidDob,
  isValidOmanPhone,
  nameErrorKey,
} from "@/utils/validation";

const GENDERS: { value: Gender; key: "genderMale" | "genderFemale" | "genderOther" }[] = [
  { value: "male", key: "genderMale" },
  { value: "female", key: "genderFemale" },
  { value: "other", key: "genderOther" },
];

const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function EditProfileScreen() {
  const { spacing, colors, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();

  const profile = useProfile();
  const history = useMedicalHistory();
  const update = useUpdateProfile();
  const upsertHistory = useUpsertMedicalHistory();
  const uploadPhoto = useUploadProfilePhoto();

  const account = profile.data?.account;
  const patient = profile.data?.patient;

  const [fullName, setFullName] = useState(account?.full_name ?? "");
  // Captured once, alongside the seed above, so "has the user edited the name?" is a value
  // comparison rather than a touched-flag that a programmatic set could desync.
  const [initialFullName] = useState(account?.full_name ?? "");
  // Stored canonically as +968XXXXXXXX; the editable field holds the 8 LOCAL digits.
  // THIS SEED IS THE MED-007 SAVE BLOCKER: it used to load the raw column value, so a
  // normally-registered patient got "+96891234567" in a field validated by /^[0-9]{8}$/ —
  // phoneError was permanently set and onSave() returned early on a field they never touched.
  const [phone, setPhone] = useState(extractOmanLocalPhone(account?.phone ?? ""));
  const [dob, setDob] = useState(patient?.date_of_birth ?? "");
  const [gender, setGender] = useState<Gender | undefined>(patient?.gender ?? undefined);
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | undefined>(
    patient?.blood_group && patient.blood_group !== "unknown" ? patient.blood_group : undefined
  );
  const [address, setAddress] = useState(patient?.address ?? "");
  // Legacy values may be "Name · +968 …"; show the extracted 8-digit number (QA #3 back-compat).
  const [emergency, setEmergency] = useState(extractOmanLocalPhone(patient?.emergency_contact ?? ""));
  const [civilNumber, setCivilNumber] = useState(patient?.civil_number ?? "");
  const civilError = isValidCivilNumber(civilNumber) ? undefined : t("validation.civilNumber");
  // The stored name may predate the shared name rule (a HAMS row, or a Google display name
  // containing an emoji). Enforcing the charset/length rules against a value the user has
  // not touched would make this whole screen unsaveable — they could not even change their
  // date of birth. So the loaded value is grandfathered until they edit it. (QA MED-001)
  const nameKey = nameErrorKey(fullName, { grandfathered: fullName === initialFullName });
  const nameError = nameKey ? t(nameKey) : undefined;
  const dobError = isValidDob(dob) ? undefined : t("validation.dob");
  const phoneError = isValidOmanPhone(phone) ? undefined : t("validation.phone");
  // Emergency contact is a phone number now (QA #3): optional, Oman 8-digit when set.
  const emergencyError = isValidOmanPhone(emergency) ? undefined : t("validation.phone");
  const [allergies, setAllergies] = useState<string[]>(history.data?.allergies ?? []);
  const [newAllergy, setNewAllergy] = useState("");

  // Wait for medical history too: the `allergies` state seeds from `history.data`
  // (once, on first render), so rendering the form before it loads would seed an
  // empty list and a save could wipe existing allergies.
  if (profile.isLoading || history.isLoading) {
    return (
      <Screen padded>
        <AppHeader title={t("profile.editTitle")} />
        <LoadingState />
      </Screen>
    );
  }
  if (profile.isError) {
    return (
      <Screen padded>
        <AppHeader title={t("profile.editTitle")} />
        <ErrorState message={t("profile.loadError")} onRetry={() => profile.refetch()} />
      </Screen>
    );
  }

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("profile.photoError"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    uploadPhoto.mutate(
      { uri: a.uri, name: a.fileName ?? "profile.jpg", mimeType: a.mimeType ?? "image/jpeg" },
      {
        onSuccess: () => Alert.alert(t("profile.photoUpdated")),
        onError: (e) =>
          Alert.alert(t("profile.photoError"), e instanceof Error ? e.message : undefined),
      }
    );
  };

  const addAllergy = () => {
    const v = newAllergy.trim();
    if (!v || allergies.includes(v)) {
      setNewAllergy("");
      return;
    }
    setAllergies([...allergies, v]);
    setNewAllergy("");
  };

  const onSave = () => {
    // Block save on any invalid field; each shows its error inline.
    if (civilError || nameError || dobError || phoneError || emergencyError) return;
    update.mutate(
      {
        full_name: fullName.trim(),
        // Re-attach the country code: field holds local digits, column holds E.164.
        phone: omanPhoneE164(phone) ?? "",
        date_of_birth: dob.trim() || null,
        gender: gender ?? null,
        blood_group: bloodGroup ?? "unknown",
        address: address.trim() || null,
        emergency_contact: emergency.trim() || null,
        civil_number: civilNumber.trim() || null,
      },
      {
        onSuccess: () => {
          // Only persist allergies when medical history actually loaded — otherwise the
          // (empty) local state would overwrite existing allergies.
          if (!history.isSuccess) {
            Alert.alert(t("profile.saved"));
            router.back();
            return;
          }
          // Persist allergies (PDF p15 edits them inline) alongside the profile.
          // Report success only after the allergy save actually succeeds.
          upsertHistory.mutate(
            { allergies },
            {
              onSuccess: () => {
                Alert.alert(t("profile.saved"));
                router.back();
              },
              onError: () => Alert.alert(t("errors.saveFailed")),
            }
          );
        },
        onError: () => Alert.alert(t("errors.saveFailed")),
      }
    );
  };

  return (
    <Screen
      scroll
      padded
      contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}
      footer={<Button label={t("common.saveChanges")} loading={update.isPending} onPress={onSave} />}
    >
      <AppHeader title={t("profile.editTitle")} />

      {/* Photo — the avatar and the "Change photo" caption are two tap targets for the
          SAME `pickPhoto` handler (QA MED-009: the avatar looked interactive but only the
          caption was wrapped in a Pressable). The caption stays because an unlabelled
          tappable avatar is undiscoverable; the avatar itself is what users actually aim
          at. No upload logic is duplicated — both call the existing handler, which owns
          permissions, the picker and the useUploadProfilePhoto mutation. */}
      <View style={styles.photo}>
        <Pressable
          onPress={pickPhoto}
          disabled={uploadPhoto.isPending}
          accessibilityRole="button"
          accessibilityLabel={t("profile.changePhoto")}
          accessibilityState={{ disabled: uploadPhoto.isPending, busy: uploadPhoto.isPending }}
          hitSlop={8}
          // Circular so the press feedback matches the avatar's shape rather than
          // flashing a square behind it.
          style={{ borderRadius: 44 }}
        >
          <Avatar name={fullName} uri={patient?.profile_photo_url} size={88} />
        </Pressable>
        <Pressable onPress={pickPhoto} hitSlop={8} disabled={uploadPhoto.isPending} style={{ marginTop: spacing.sm }}>
          <Text variant="label" color="primary">
            {uploadPhoto.isPending ? t("common.loading") : t("profile.changePhoto")}
          </Text>
        </Pressable>
      </View>

      {/* PDF p15 leads with: full name → blood group → DOB → allergies */}
      <TextField
        label={t("profile.fullName")}
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        error={nameError}
        containerStyle={{ marginBottom: spacing.md }}
      />

      {/* Blood group — enum chips (no free-text; prevents invalid values) */}
      <Text variant="label" color="textMuted" style={{ marginBottom: 8, letterSpacing: 0.5 }}>
        {t("profile.bloodGroup").toUpperCase()}
      </Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row", marginBottom: spacing.md }]}>
        {BLOOD_GROUPS.map((bg) => (
          <Chip
            key={bg}
            label={bg}
            selected={bloodGroup === bg}
            onPress={() => setBloodGroup(bloodGroup === bg ? undefined : bg)}
          />
        ))}
      </View>

      {/* Date of birth — native picker, capped at today (QA #1); stored as YYYY-MM-DD */}
      <DateField
        label={t("profile.dob")}
        value={dob}
        onChange={setDob}
        placeholder={t("profile.dobPlaceholder")}
        error={dobError}
        containerStyle={{ marginBottom: spacing.md }}
      />

      {/* Civil number (optional; 8 digits) — F2 */}
      <TextField
        label={t("profile.civilNumber")}
        value={civilNumber}
        // Clamp length in JS (not via native `maxLength`): a controlled TextInput whose
        // value sits exactly at `maxLength` hits a React Native reconciliation bug where
        // edits to the final character (delete/replace) get reverted. Slicing here keeps
        // the field fully JS-controlled so every digit stays editable. (F2)
        onChangeText={(v) => setCivilNumber(v.replace(/[^0-9]/g, "").slice(0, CIVIL_NUMBER_LENGTH))}
        keyboardType="number-pad"
        placeholder={t("profile.civilNumberPlaceholder")}
        error={civilError}
        containerStyle={{ marginBottom: spacing.md }}
      />

      {/* Allergies — removable chips + add (PDF p15) */}
      <Text variant="label" color="textMuted" style={{ marginBottom: 8, letterSpacing: 0.5 }}>{t("profile.allergies").toUpperCase()}</Text>
      {allergies.length ? (
        <View style={[styles.chips, { marginBottom: 8, flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {allergies.map((a) => (
            <Chip key={a} label={a} onRemove={() => setAllergies(allergies.filter((x) => x !== a))} />
          ))}
        </View>
      ) : null}
      <TextField
        value={newAllergy}
        onChangeText={setNewAllergy}
        placeholder={t("medical.addPlaceholder")}
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={addAllergy}
        trailing={
          <Pressable onPress={addAllergy} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.add")}>
            <Icon name="plus" size={20} tint={colors.primary} strokeWidth={2.2} />
          </Pressable>
        }
        containerStyle={{ marginBottom: spacing.md }}
      />

      {/* Additional profile fields (kept for completeness; surface on Profile p15) */}
      <Text variant="label" color="textMuted" style={{ marginBottom: 8, letterSpacing: 0.5 }}>{t("profile.gender").toUpperCase()}</Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {GENDERS.map((g) => (
          <Chip
            key={g.value}
            label={t(`profile.${g.key}`)}
            selected={gender === g.value}
            onPress={() => setGender(gender === g.value ? undefined : g.value)}
          />
        ))}
      </View>

      {/* Phone — PhoneField, not a raw TextField (QA MED-007). The old input had
          `keyboardType="phone-pad"` with no maxLength and no sanitisation, so `#`, `;`, `*`
          and 9+ digits reached the database. PhoneField holds the 8 local digits; +968 is
          rendered as a prefix and re-attached on save. */}
      <PhoneField
        label={t("profile.phone")}
        value={phone}
        onChangeText={setPhone}
        error={phoneError}
        placeholder="9000 0000"
        containerStyle={{ marginTop: spacing.md, marginBottom: spacing.md }}
      />
      <TextField
        label={t("profile.address")}
        value={address}
        onChangeText={setAddress}
        placeholder={t("profile.addressPlaceholder")}
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
  photo: { alignItems: "center", marginBottom: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
