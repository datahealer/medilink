import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { BloodGroup, Gender } from "@/data/types";

import {
  AppHeader,
  Avatar,
  Button,
  Chip,
  ErrorState,
  Icon,
  LoadingState,
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
  isValidCivilNumber,
  isValidDob,
  isValidName,
  isValidOmanPhone,
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
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [dob, setDob] = useState(patient?.date_of_birth ?? "");
  const [gender, setGender] = useState<Gender | undefined>(patient?.gender ?? undefined);
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | undefined>(
    patient?.blood_group && patient.blood_group !== "unknown" ? patient.blood_group : undefined
  );
  const [address, setAddress] = useState(patient?.address ?? "");
  const [emergency, setEmergency] = useState(patient?.emergency_contact ?? "");
  const [civilNumber, setCivilNumber] = useState(patient?.civil_number ?? "");
  const civilError = isValidCivilNumber(civilNumber) ? undefined : t("validation.civilNumber");
  const nameError = isValidName(fullName) ? undefined : t("validation.nameMin");
  const dobError = isValidDob(dob) ? undefined : t("validation.dob");
  const phoneError = isValidOmanPhone(phone) ? undefined : t("validation.phone");
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
    if (civilError || nameError || dobError || phoneError) return;
    update.mutate(
      {
        full_name: fullName.trim(),
        phone: phone.trim(),
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

      {/* Photo */}
      <View style={styles.photo}>
        <Avatar name={fullName} uri={patient?.profile_photo_url} size={88} />
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

      {/* Date of birth (validated free-text: YYYY-MM-DD, not in the future) */}
      <TextField
        label={t("profile.dob")}
        value={dob}
        onChangeText={setDob}
        placeholder={t("profile.dobPlaceholder")}
        autoCapitalize="none"
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

      <TextField
        label={t("profile.phone")}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        error={phoneError}
        containerStyle={{ marginTop: spacing.md, marginBottom: spacing.md }}
      />
      <TextField
        label={t("profile.address")}
        value={address}
        onChangeText={setAddress}
        placeholder={t("profile.addressPlaceholder")}
        containerStyle={{ marginBottom: spacing.md }}
      />
      <TextField
        label={t("profile.emergencyContact")}
        value={emergency}
        onChangeText={setEmergency}
        placeholder={t("profile.emergencyPlaceholder")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { alignItems: "center", marginBottom: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
