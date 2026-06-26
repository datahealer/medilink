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
import { useFamily } from "@/hooks/queries/useFamily";
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
  const setPatient = useBookingStore((s) => s.setPatient);
  const setReason = useBookingStore((s) => s.setReason);
  const confirm = useBookingStore((s) => s.confirm);

  const profile = useProfile();
  const family = useFamily();
  const create = useCreateAppointment();
  const activeId = usePatientStore((s) => s.activePatientId);
  const setActivePatient = usePatientStore((s) => s.setActivePatient);

  const primaryName = profile.data?.account?.full_name ?? t("booking.you");
  // Only honour the active-patient selection if it's a REAL member of the current
  // family list. A stale/mock id (e.g. a persisted "mock-100" from mock mode) must
  // never reach the booking RPC, which expects a real UUID — fall back to "self".
  const activeMember = activeId && family.data ? family.data.find((m) => m.id === activeId) : undefined;
  const bookForId = activeMember ? activeMember.id : null;
  const patientName = activeMember
    ? activeMember.full_name
    : `${firstName(primaryName)} (${t("booking.you")})`;

  // Keep the booking draft's patient in sync with the validated selection.
  useEffect(() => {
    setPatient(bookForId, patientName);
  }, [bookForId, patientName, setPatient]);

  // Self-heal: clear a persisted active-patient id that no longer matches a real
  // family member (stale mock id, or a since-deleted member).
  useEffect(() => {
    if (activeId && family.data && !family.data.some((m) => m.id === activeId)) {
      setActivePatient(null, null);
    }
  }, [activeId, family.data, setActivePatient]);

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
        forFamilyMemberId: bookForId ?? undefined,
      },
      {
        onSuccess: (res) => {
          confirm(res.reference || res.id);
          router.replace("/booking/success");
        },
        onError: (e) => {
          // Surface the real backend reason (RPC error code / Postgres message),
          // never a generic string — see bookingStore + appointment.create().
          const detail =
            e instanceof Error
              ? e.message
              : e && typeof e === "object" && "message" in e
                ? String((e as { message: unknown }).message)
                : String(e);
          Alert.alert(t("booking.bookingFailed"), detail);
        },
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
