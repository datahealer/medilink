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
  LoadingState,
  Screen,
  Text,
  TextField,
} from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
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

const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS: { value: Gender; key: "genderMale" | "genderFemale" | "genderOther" }[] = [
  { value: "male", key: "genderMale" },
  { value: "female", key: "genderFemale" },
  { value: "other", key: "genderOther" },
];

export default function EditProfileScreen() {
  const { spacing, colors } = useTheme();
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
  const [allergies, setAllergies] = useState<string[]>(history.data?.allergies ?? []);
  const [newAllergy, setNewAllergy] = useState("");

  if (profile.isLoading) {
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
        onError: () => Alert.alert(t("profile.photoError")),
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
    update.mutate(
      {
        full_name: fullName.trim(),
        phone: phone.trim(),
        date_of_birth: dob.trim() || null,
        gender: gender ?? null,
        blood_group: bloodGroup ?? "unknown",
        address: address.trim() || null,
        emergency_contact: emergency.trim() || null,
      },
      {
        onSuccess: () => {
          // Persist allergies (PDF p15 edits them inline) alongside the profile.
          upsertHistory.mutate(
            { allergies },
            {
              onSettled: () => {
                Alert.alert(t("profile.saved"));
                router.back();
              },
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
        containerStyle={{ marginBottom: spacing.md }}
      />

      <Text variant="label" color="textMuted" style={{ marginBottom: 8 }}>{t("profile.bloodGroup")}</Text>
      <View style={styles.chips}>
        {BLOOD_GROUPS.map((b) => (
          <Chip key={b} label={b} selected={bloodGroup === b} onPress={() => setBloodGroup(bloodGroup === b ? undefined : b)} />
        ))}
      </View>

      <TextField
        label={t("profile.dob")}
        value={dob}
        onChangeText={setDob}
        placeholder={t("profile.dobPlaceholder")}
        autoCapitalize="none"
        containerStyle={{ marginTop: spacing.md, marginBottom: spacing.md }}
      />

      {/* Allergies — removable chips + add (PDF p15) */}
      <Text variant="label" color="textMuted" style={{ marginBottom: 8 }}>{t("profile.allergies")}</Text>
      {allergies.length ? (
        <View style={[styles.chips, { marginBottom: 8 }]}>
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
            <Ionicons name="add" size={20} color={colors.primary} />
          </Pressable>
        }
        containerStyle={{ marginBottom: spacing.md }}
      />

      {/* Additional profile fields (kept for completeness; surface on Profile p15) */}
      <Text variant="label" color="textMuted" style={{ marginBottom: 8 }}>{t("profile.gender")}</Text>
      <View style={styles.chips}>
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
