import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import Svg, { Rect } from "react-native-svg";

import { AppCard, AppHeader, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useAppointment } from "@/hooks/queries/usePatient";

/** Deterministic pseudo-QR matrix (21×21, QR-v1 size) seeded from the reference, with
 *  the three finder patterns drawn in. Static visual only — not a scannable code. */
function useQrMatrix(seed: string): boolean[][] {
  return useMemo(() => {
    const N = 21;
    const grid: boolean[][] = Array.from({ length: N }, () => Array<boolean>(N).fill(false));
    // Simple xorshift seeded by the reference string.
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const rand = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return ((h >>> 0) % 1000) / 1000;
    };
    for (let r = 0; r < N; r++) {
      const row = grid[r]!;
      for (let c = 0; c < N; c++) row[c] = rand() > 0.52;
    }
    // Finder patterns at the three corners (7×7 with a 3×3 solid centre).
    const finder = (or: number, oc: number) => {
      for (let r = -1; r <= 7; r++)
        for (let c = -1; c <= 7; c++) {
          const rr = or + r;
          const cc = oc + c;
          if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
          const onRing = r === 0 || r === 6 || c === 0 || c === 6;
          const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          const quiet = r === -1 || r === 7 || c === -1 || c === 7;
          const gr = grid[rr]!;
          gr[cc] = quiet ? false : onRing || inCore;
        }
    };
    finder(0, 0);
    finder(0, N - 7);
    finder(N - 7, 0);
    return grid;
  }, [seed]);
}

/** Check-in (design p25) — confirmation, scannable QR pass + booking ref, live queue. */
export default function CheckInScreen() {
  const { colors, spacing, radii } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const id = String(rawId ?? "");

  const query = useAppointment(id);
  const reference = query.data?.reference_number || "ML-48213";
  const matrix = useQrMatrix(reference);
  const cell = 8; // px per module
  const dim = matrix.length * cell;

  // Static live-queue values (wired to realtime tomorrow).
  const queueNo = "A-07";
  const serving = "A-04";

  return (
    <Screen scroll padded edges={["top", "left", "right", "bottom"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}>
      <AppHeader title={t("appointments.checkIn")} showBack />

      {query.isLoading ? (
        <LoadingState />
      ) : (
        <View style={styles.center}>
          <Text variant="h2" align="center">{t("appointments.checkedInTitle")}</Text>
          <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.xs }}>
            {t("appointments.checkedInBody")}
          </Text>

          {/* QR pass — dark modules on a light card so it reads as a scannable pass. */}
          <AppCard variant="detail" style={{ marginTop: spacing.lg, alignItems: "center", alignSelf: "stretch" }}>
            <View style={[styles.qrFrame, { backgroundColor: colors.surface, borderRadius: radii.md, borderColor: colors.border }]}>
              <Svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
                <Rect x={0} y={0} width={dim} height={dim} fill={colors.surface} />
                {matrix.map((row, r) =>
                  row.map((on, c) =>
                    on ? (
                      <Rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill={colors.text} />
                    ) : null
                  )
                )}
              </Svg>
            </View>
            <Text variant="caption" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
              {t("appointments.checkInQrCaption", { ref: num(reference) })}
            </Text>
          </AppCard>

          {/* Live queue */}
          <AppCard variant="detail" style={{ marginTop: spacing.sm, alignSelf: "stretch" }}>
            <View style={styles.queueRow}>
              <View style={styles.queueCell}>
                <Text variant="caption" color="textMuted" align="center">{t("appointments.queueNumber")}</Text>
                <Text variant="display" color="primary" align="center" style={styles.queueValue}>{num(queueNo)}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.queueCell}>
                <Text variant="caption" color="textMuted" align="center">{t("appointments.nowServing")}</Text>
                <Text variant="display" color="textMuted" align="center" style={styles.queueValue}>{num(serving)}</Text>
              </View>
            </View>
          </AppCard>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", marginTop: 8 },
  qrFrame: { padding: 16, borderWidth: StyleSheet.hairlineWidth * 2 },
  queueRow: { flexDirection: "row", alignItems: "center" },
  queueCell: { flex: 1, paddingVertical: 8 },
  queueValue: { marginTop: 2 },
  divider: { width: StyleSheet.hairlineWidth * 2, alignSelf: "stretch", marginVertical: 4 },
});
