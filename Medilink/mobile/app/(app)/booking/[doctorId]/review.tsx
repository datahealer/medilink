import React, { useEffect } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  AppCard,
  AppHeader,
  Avatar,
  Button,
  Icon,
  Screen,
  Stepper,
  SummaryCard,
  type SummaryRow,
  Text,
  TextField,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useProfile, useCreateAppointment } from "@/hooks/queries/usePatient";
import { usePatientStore } from "@/stores/patientStore";
import { useBookingStore } from "@/stores/bookingStore";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Booking step 2 — Review & Patient (PDF p21). */
export default function ReviewScreen() {
  const { spacing, colors, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const doctorName = useBookingStore((s) => s.doctorName);
  const specialty = useBookingStore((s) => s.specialty);
  const facility = useBookingStore((s) => s.facility);
  const clinicName = useBookingStore((s) => s.clinicName);
  const dateLabel = useBookingStore((s) => s.dateLabel);
  const slot = useBookingStore((s) => s.slot);
  const reason = useBookingStore((s) => s.reason);
  const doctorId = useBookingStore((s) => s.doctorId);
  const facilityId = useBookingStore((s) => s.facilityId);
  const dateId = useBookingStore((s) => s.dateId);
  const slotStart = useBookingStore((s) => s.slotStart);
  const patientId = useBookingStore((s) => s.patientId);
  const setPatient = useBookingStore((s) => s.setPatient);
  const setReason = useBookingStore((s) => s.setReason);
  const confirm = useBookingStore((s) => s.confirm);

  const profile = useProfile();
  const create = useCreateAppointment();
  const activeId = usePatientStore((s) => s.activePatientId);
  const activeName = usePatientStore((s) => s.activePatientName);

  const primaryName = profile.data?.account?.full_name ?? t("booking.you");
  const patientName = activeId
    ? activeName ?? primaryName
    : `${firstName(primaryName)} (${t("booking.you")})`;

  // Keep the booking draft's patient in sync with the active-patient selection.
  useEffect(() => {
    setPatient(activeId, patientName);
  }, [activeId, patientName, setPatient]);

  const onProceed = () => {
    if (!doctorId || !facilityId || !dateId || !slotStart) {
      Alert.alert(t("booking.bookingFailed"), t("booking.missingInfo"));
      return;
    }
    // Real atomic booking (payment remains a later batch — go straight to success).
    create.mutate(
      {
        doctorId,
        facilityId,
        slotDate: dateId,
        slotStart,
        type: "in_person",
        forFamilyMemberId: patientId ?? undefined,
      },
      {
        onSuccess: (res) => {
          confirm(res.reference || res.id);
          router.replace("/booking/success");
        },
        onError: (e) =>
          Alert.alert(t("booking.bookingFailed"), e instanceof Error ? e.message : undefined),
      }
    );
  };

  const rows: SummaryRow[] = [
    { label: t("booking.clinic"), value: clinicName },
    { label: t("booking.dateTime"), value: `${dateLabel} · ${slot ?? ""}` },
    { label: t("booking.type"), value: t("booking.inPerson") },
  ];

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={<Button label={create.isPending ? t("common.loading") : t("booking.confirmBooking")} onPress={onProceed} disabled={create.isPending} />}
    >
      <AppHeader title={t("booking.reviewTitle")} showBack right={<Text variant="caption" color="textMuted">{t("booking.step", { current: num("2"), total: num("4") })}</Text>} />

      <Stepper current={2} total={4} />

      {/* Doctor */}
      <View style={{ height: spacing.md }} />
      <AppCard variant="detail">
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={doctorName} size={48} />
          <View style={[styles.flex, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
            <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{doctorName}</Text>
            <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>{`${specialty} · ${facility}`}</Text>
          </View>
        </View>
      </AppCard>

      {/* Schedule summary */}
      <View style={{ height: spacing.sm }} />
      <SummaryCard rows={rows} />

      {/* Patient */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("booking.patient")}</Text>
      <AppCard variant="detail">
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={patientName} size={40} />
          <Text variant="title" numberOfLines={1} style={[styles.flex, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]} align={isRTL ? "right" : "left"}>{patientName}</Text>
          <Pressable onPress={() => router.push("/patient-switcher")} hitSlop={8} accessibilityRole="button" style={[styles.changeRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text variant="label" color="primary">{t("booking.change")}</Text>
            <Icon name="chevron" direction={isRTL ? "left" : "right"} size={18} tint={colors.primary} />
          </Pressable>
        </View>
      </AppCard>

      {/* Reason */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("booking.reasonLabel")}</Text>
      <TextField
        value={reason}
        onChangeText={setReason}
        placeholder={t("booking.reasonPlaceholder")}
        autoCapitalize="sentences"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center" },
  flex: { flex: 1 },
  section: { marginTop: 20, marginBottom: 10 },
  changeRow: { alignItems: "center", gap: 2 },
});
