import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppHeader, Avatar, Button, Card, Checkbox, Chip, Icon, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n, type MessageKey } from "@/i18n";
import { useAppointment } from "@/hooks/queries/usePatient";
import { useSubmitReview } from "@/hooks/queries/useDoctors";
import { formatApptDate } from "@/utils/appointments";

const ASPECT_KEYS = [
  "rating.aspectClearExplanation",
  "rating.aspectOnTime",
  "rating.aspectFriendly",
  "rating.aspectCleanClinic",
  "rating.aspectShortWait",
] as const satisfies readonly MessageKey[];

const STARS = [0, 1, 2, 3, 4] as const;

/** Doctor Rating — capture stars, aspects and a comment, then submit (design p33). */
export default function DoctorRatingScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { appointmentId: rawId } = useLocalSearchParams<{ appointmentId?: string }>();
  const appointmentId = String(rawId ?? "");

  const appt = useAppointment(appointmentId);
  const submit = useSubmitReview();

  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState<Set<MessageKey>>(new Set());
  const [comment, setComment] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  const doctorId = appt.data?.doctor_id ?? null;
  const doctorName = appt.data?.doctor?.full_name || "—";
  const doctorSub = [appt.data?.doctor?.specialty, formatApptDate(appt.data?.slot_date ?? null, t, num)]
    .filter(Boolean)
    .join(" · ");

  const toggleAspect = (key: MessageKey) => {
    setAspects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onSubmit = () => {
    if (rating === 0 || !doctorId) return;
    submit.mutate(
      {
        doctorId,
        rating,
        comment: comment.trim() || null,
        aspects: Array.from(aspects).map((k) => t(k)),
        appointmentId: appointmentId || null,
      },
      {
        onSuccess: () =>
          router.replace(`/rate/success?rating=${rating}&doctor=${encodeURIComponent(doctorName)}`),
        onError: (e) => Alert.alert(t("appointments.actionFailed"), e instanceof Error ? e.message : String(e)),
      }
    );
  };

  const canSubmit = rating > 0 && !!doctorId;

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={
        <View style={{ gap: spacing.xs }}>
          {rating === 0 ? (
            <Text variant="caption" color="textMuted" align="center">{t("rating.needStars")}</Text>
          ) : null}
          <Button label={t("rating.submit")} onPress={onSubmit} disabled={!canSubmit} loading={submit.isPending} />
        </View>
      }
    >
      <AppHeader showBack title={t("rating.title")} />

      {/* Doctor card (real appointment) */}
      <Card>
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={doctorName} size={52} />
          <View style={styles.docMeta}>
            <Text variant="title">{doctorName}</Text>
            {doctorSub ? <Text variant="caption" color="textMuted">{doctorSub}</Text> : null}
          </View>
        </View>
      </Card>

      {/* Star rating */}
      <View style={[styles.stars, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {STARS.map((i) => (
          <Pressable
            key={i}
            onPress={() => setRating(i + 1)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}`}
            accessibilityState={{ selected: i < rating }}
          >
            <Icon name="rating" size={36} filled={i < rating} tint={i < rating ? colors.warning : colors.textMuted} />
          </Pressable>
        ))}
      </View>
      {rating === 0 ? (
        <Text variant="caption" color="textFaint" align="center">{t("rating.tapToRate")}</Text>
      ) : null}

      {/* Aspects */}
      <Text variant="label" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>{t("rating.whatWentWell")}</Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {ASPECT_KEYS.map((key) => (
          <Chip key={key} label={t(key)} selected={aspects.has(key)} onPress={() => toggleAspect(key)} />
        ))}
      </View>

      {/* Comment */}
      <View style={{ marginTop: spacing.lg }}>
        <TextField
          label={t("rating.addComment")}
          placeholder={t("rating.commentPlaceholder")}
          value={comment}
          onChangeText={setComment}
          multiline
        />
      </View>

      {/* Anonymous (reviews store no reviewer name, so this is presentational) */}
      <View style={{ marginTop: spacing.md }}>
        <Checkbox checked={anonymous} onChange={setAnonymous} label={t("rating.postAnonymously")} />
      </View>

      <View style={{ height: spacing.md }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", gap: 12 },
  docMeta: { flex: 1, gap: 2 },
  stars: { justifyContent: "center", gap: 8, marginTop: 24 },
  chips: { flexWrap: "wrap", gap: 8 },
});
