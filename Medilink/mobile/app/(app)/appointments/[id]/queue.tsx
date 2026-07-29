import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, RefreshControl, StyleSheet, Vibration, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import {
  AppCard,
  AppHeader,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  QueuePositionRing,
  QueueTimeline,
  Screen,
  SummaryCard,
  type QueueStep,
  type SummaryRow,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { formatApptDate, formatApptTime } from "@/utils/appointments";
import {
  useAcknowledgeQueueCall,
  useQueueRealtime,
  useQueueStatus,
} from "@/hooks/queries/useQueue";
import { QueueUnavailableError } from "@/data/types";
import type { QueueAcknowledgeKind, QueueStatus, QueueUnavailableReason } from "@/data/types";

/**
 * Live Queue (patient side).
 *
 * Renders `GET /api/patients/me/queue-status` and nothing else. Every number on
 * this screen — position, people ahead, ETA, now-serving — is computed by the
 * HAMS backend; this file contains no queue arithmetic by design. Realtime is an
 * invalidation signal only (see `useQueueRealtime`).
 *
 * Contract: docs/QUEUE_BACKEND_FOR_MEDILINK.md §2.
 */
export default function LiveQueueScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const appointmentId = String(rawId ?? "");

  const query = useQueueStatus(appointmentId);
  const status = query.data;

  // Subscribe only while there is something left to observe.
  const subscribeActive = !!status && status.phase !== "done";
  useQueueRealtime(appointmentId, subscribeActive);

  const acknowledge = useAcknowledgeQueueCall(appointmentId);
  const [ackError, setAckError] = useState<string | null>(null);

  // Announce the call once, when it happens — the highest-stakes transition on
  // the screen, and the one a patient may not be looking at.
  const announcedCall = useRef(false);
  useEffect(() => {
    if (status?.phase !== "called") {
      announcedCall.current = false;
      return;
    }
    if (announcedCall.current) return;
    announcedCall.current = true;
    // Built-in Vibration rather than expo-haptics: richer haptics would mean a new
    // native dependency and rebuild for one buzz. Screen-reader users get the
    // announcement below, which is the accessible equivalent.
    Vibration.vibrate(400);
    AccessibilityInfo.announceForAccessibility(t("queue.a11yCalled"));
  }, [status?.phase, t]);

  const onAcknowledge = useCallback(
    (kind: QueueAcknowledgeKind) => {
      setAckError(null);
      // Not optimistic: reception acts on this signal, so it only shows as sent
      // once the backend has actually written it.
      acknowledge.mutate(kind, {
        onError: () => setAckError(t("queue.acknowledgeFailed")),
      });
    },
    [acknowledge, t]
  );

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const refreshControl = (
    <RefreshControl
      refreshing={query.isRefetching && !query.isLoading}
      onRefresh={onRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  );

  // ---- loading / error / empty ------------------------------------------------

  if (query.isLoading) {
    return (
      <Screen padded edges={["top", "left", "right", "bottom"]}>
        <AppHeader title={t("queue.title")} showBack />
        <LoadingState />
      </Screen>
    );
  }

  if (query.isError || !status) {
    return (
      <Screen
        scroll
        padded
        edges={["top", "left", "right", "bottom"]}
        refreshControl={refreshControl}
      >
        <AppHeader title={t("queue.title")} showBack />
        <QueueUnavailable
          error={query.error}
          appointmentId={appointmentId}
          onRetry={onRefresh}
        />
      </Screen>
    );
  }

  // ---- resolved state ---------------------------------------------------------

  const doctorName = status.doctor?.fullName ?? "—";
  const step: QueueStep =
    status.phase === "done" ? "done" : status.phase === "called" ? "called" : "waiting";

  const detailRows: SummaryRow[] = [
    { label: t("queue.yourNumber"), value: num(status.position) },
    {
      label: t("appointments.nowServing"),
      value: status.nowServingPosition != null ? num(status.nowServingPosition) : "—",
    },
    { label: t("queue.doctorStatus"), value: doctorStatusLabel(status.doctor?.status, t) },
    { label: t("queue.queueStatus"), value: queueStatusLabel(status.status, t) },
    {
      label: t("queue.appointmentTime"),
      value:
        [
          formatApptDate(status.appointment.slotDate, t, num),
          formatApptTime(status.appointment.slotStart, num),
        ]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    {
      label: t("queue.checkedInAt"),
      value: status.checkedInAt ? formatClockTime(status.checkedInAt, num) : "—",
    },
    { label: t("queue.clinic"), value: status.facility.name ?? "—" },
  ];

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      refreshControl={refreshControl}
    >
      <AppHeader title={t("queue.title")} showBack />

      <FreshnessRow
        dataUpdatedAt={query.dataUpdatedAt}
        isRefetching={query.isRefetching}
        isPaused={query.isPaused}
      />

      {status.phase === "called" ? (
        <CalledCard
          doctorName={doctorName}
          acknowledgedKind={status.acknowledgedKind}
          pending={acknowledge.isPending}
          error={ackError}
          onAcknowledge={onAcknowledge}
        />
      ) : status.phase === "done" ? (
        <DoneCard onViewAppointment={() => router.replace(`/appointments/${appointmentId}`)} />
      ) : (
        <WaitingBlock status={status} />
      )}

      <View style={{ height: spacing.lg }} />

      <AppCard variant="detail">
        <Text variant="label" align={isRTL ? "right" : "left"}>
          {t("queue.timelineTitle")}
        </Text>
        <View style={{ height: spacing.md }} />
        <QueueTimeline
          current={step}
          labels={{
            checked_in: t("queue.stepCheckedIn"),
            waiting: t("queue.stepWaiting"),
            called: t("queue.stepCalled"),
            done: t("queue.stepDone"),
          }}
        />
      </AppCard>

      <View style={{ height: spacing.sm }} />
      <SummaryCard rows={detailRows} />

      <View style={{ height: spacing.md }} />
      <Button
        variant="outline"
        label={t("queue.viewAppointment")}
        onPress={() => router.push(`/appointments/${appointmentId}`)}
      />
      <View style={{ height: spacing.lg }} />
    </Screen>
  );
}

// ---- waiting ----------------------------------------------------------------

function WaitingBlock({ status }: { status: QueueStatus }) {
  const { spacing, isRTL } = useTheme();
  const { t, num } = useI18n();

  const isNext = status.peopleAhead === 0;
  const aheadLabel =
    status.peopleAhead === 1 ? t("queue.peopleAheadOne") : t("queue.peopleAheadOther");

  // Denominator for the ring: the deepest the queue has been for this patient.
  // Kept in a ref so the arc only ever fills forward, even though the server is
  // free to revise `people_ahead` upward (an emergency insert legitimately does).
  const peakAhead = useRef(status.peopleAhead);
  if (status.peopleAhead > peakAhead.current) peakAhead.current = status.peopleAhead;

  const a11y = useMemo(
    () =>
      t("queue.a11yPosition")
        .replace("{n}", num(status.peopleAhead))
        .replace("{mins}", num(status.estimatedWaitMinutes)),
    [t, num, status.peopleAhead, status.estimatedWaitMinutes]
  );

  return (
    <View accessible accessibilityLabel={a11y}>
      <View style={{ height: spacing.md }} />
      <QueuePositionRing
        peopleAhead={status.peopleAhead}
        total={peakAhead.current}
        label={isNext ? t("queue.youreNext") : aheadLabel}
      />
      <View style={{ height: spacing.md }} />

      {isNext ? (
        <Text variant="body" color="textMuted" align="center">
          {t("queue.youreNextBody")}
        </Text>
      ) : (
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text variant="caption" color="textMuted" align="center">
            {t("queue.estimatedWait")}
          </Text>
          <Text variant="h1" align="center">
            {t("queue.aboutMinutes").replace("{mins}", num(status.estimatedWaitMinutes))}
          </Text>
        </View>
      )}

      <View style={{ height: spacing.md }} />
      <View style={[styles.chipRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Chip label={doctorStatusLabel(status.doctor?.status, t)} />
        {status.nowServingPosition != null ? (
          <Chip label={`${t("appointments.nowServing")} · ${num(status.nowServingPosition)}`} />
        ) : null}
      </View>
    </View>
  );
}

// ---- called -----------------------------------------------------------------

function CalledCard({
  doctorName,
  acknowledgedKind,
  pending,
  error,
  onAcknowledge,
}: {
  doctorName: string;
  acknowledgedKind: QueueAcknowledgeKind | null;
  pending: boolean;
  error: string | null;
  onAcknowledge: (kind: QueueAcknowledgeKind) => void;
}) {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { t } = useI18n();

  return (
    <View style={{ marginTop: spacing.md }}>
      <View
        style={[
          styles.calledBanner,
          { backgroundColor: colors.successSurface, borderRadius: radii.lg, padding: spacing.lg },
        ]}
        accessible
        accessibilityLabel={t("queue.a11yCalled")}
      >
        <Text variant="h1" align="center" style={{ color: colors.success }}>
          {t("queue.calledTitle")}
        </Text>
        <Text variant="body" align="center" color="textMuted" style={{ marginTop: spacing.sm }}>
          {t("queue.calledBody").replace("{doctor}", doctorName)}
        </Text>
      </View>

      <View style={{ height: spacing.md }} />

      {acknowledgedKind ? (
        <Text variant="label" align="center" style={{ color: colors.success }}>
          {acknowledgedKind === "on_my_way"
            ? t("queue.acknowledgedOnMyWay")
            : t("queue.acknowledgedSeen")}
        </Text>
      ) : null}

      {/* Both acknowledgements stay available: a patient who tapped "seen" may
          then start walking, and the contract lets the latest signal win. */}
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Button
          label={t("queue.onMyWay")}
          loading={pending}
          onPress={() => onAcknowledge("on_my_way")}
        />
        <Button
          variant="outline"
          label={t("queue.seenTheCall")}
          disabled={pending}
          onPress={() => onAcknowledge("seen")}
        />
      </View>

      {error ? (
        <Text
          variant="caption"
          align={isRTL ? "right" : "left"}
          style={{ color: colors.error, marginTop: spacing.sm }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ---- done -------------------------------------------------------------------

function DoneCard({ onViewAppointment }: { onViewAppointment: () => void }) {
  const { spacing } = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ marginTop: spacing.lg }}>
      <EmptyState
        title={t("queue.doneTitle")}
        body={t("queue.doneBody")}
        actionLabel={t("queue.viewAppointment")}
        onAction={onViewAppointment}
      />
    </View>
  );
}

// ---- freshness / connection -------------------------------------------------

/**
 * Last-updated stamp. Mandatory honesty affordance: a queue screen that looks
 * live while disconnected actively misleads, so staleness is always visible.
 */
function FreshnessRow({
  dataUpdatedAt,
  isRefetching,
  isPaused,
}: {
  dataUpdatedAt: number;
  isRefetching: boolean;
  isPaused: boolean;
}) {
  const { colors, spacing, isRTL } = useTheme();
  const { t, num } = useI18n();
  const [, setTick] = useState(0);

  // Re-render once a minute so "updated N min ago" doesn't freeze on screen.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 60_000));
  const label = isPaused
    ? t("queue.offlineTitle")
    : isRefetching
      ? t("queue.reconnecting")
      : minutes < 1
        ? t("queue.updatedJustNow")
        : t("queue.updatedAgo").replace("{mins}", num(minutes));

  const dotColor = isPaused ? colors.warning : isRefetching ? colors.info : colors.success;

  return (
    <View
      style={[
        styles.freshRow,
        { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.xs, gap: spacing.xs },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

// ---- unavailable states -----------------------------------------------------

/**
 * Maps the contract's error codes onto distinct, actionable states. "Not checked
 * in" is a normal, expected answer — not an error — and offers the way forward
 * rather than a retry that cannot succeed.
 */
function QueueUnavailable({
  error,
  appointmentId,
  onRetry,
}: {
  error: unknown;
  appointmentId: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const reason: QueueUnavailableReason =
    error instanceof QueueUnavailableError ? error.reason : "server_error";

  switch (reason) {
    case "not_checked_in":
      return (
        <EmptyState
          title={t("queue.notCheckedInTitle")}
          body={t("queue.notCheckedInBody")}
          actionLabel={t("queue.checkInNow")}
          onAction={() => router.replace(`/appointments/${appointmentId}`)}
        />
      );
    case "not_in_queue":
      return (
        <EmptyState
          title={t("queue.notInQueueTitle")}
          body={t("queue.notInQueueBody")}
          actionLabel={t("queue.viewAppointment")}
          onAction={() => router.replace(`/appointments/${appointmentId}`)}
        />
      );
    case "forbidden":
    case "unauthorized":
      return <EmptyState title={t("queue.forbiddenTitle")} body={t("queue.forbiddenBody")} />;
    case "offline":
      return <ErrorState message={t("queue.offlineBody")} onRetry={onRetry} />;
    default:
      return <ErrorState message={t("queue.errorBody")} onRetry={onRetry} />;
  }
}

// ---- label helpers ----------------------------------------------------------

type T = ReturnType<typeof useI18n>["t"];

/** `doctors.status` → localized label. */
function doctorStatusLabel(status: string | null | undefined, t: T): string {
  switch (status) {
    case "available":
      return t("queue.doctorAvailable");
    case "with_patient":
      return t("queue.doctorWithPatient");
    case "on_break":
      return t("queue.doctorOnBreak");
    case "unavailable":
      return t("queue.doctorUnavailable");
    default:
      return "—";
  }
}

/** `queue_items.status` → localized label. */
function queueStatusLabel(status: string | null | undefined, t: T): string {
  switch (status) {
    case "waiting":
      return t("queue.statusWaiting");
    case "called":
      return t("queue.statusCalled");
    case "done":
      return t("queue.statusDone");
    case "expired":
      return t("queue.statusExpired");
    default:
      return "—";
  }
}

/** ISO timestamp → localized HH:MM. */
function formatClockTime(iso: string, num: (n: number | string) => string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${num(h12)}:${num(String(m).padStart(2, "0"))} ${ampm}`;
}

const styles = StyleSheet.create({
  chipRow: { justifyContent: "center", gap: 8, flexWrap: "wrap" },
  calledBanner: { alignItems: "center" },
  freshRow: { alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
