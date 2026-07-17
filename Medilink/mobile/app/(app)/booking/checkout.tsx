import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { AppHeader, Button, ErrorState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { useReleaseHold } from "@/hooks/queries/usePatient";

/**
 * BP-5 — In-app Thawani hosted-checkout (no external browser). Renders the hosted
 * checkout URL in a WebView and intercepts the return redirects:
 *   • …/payment-success → close, go to the confirmation screen (which verifies).
 *   • …/payment-cancel  → close, RELEASE the pending hold (free the slot), go back.
 * Closing the screen / hardware-back is also treated as a cancel (release the hold).
 * The WebView only ever loads Thawani pages — our return URLs are caught before load.
 */
export default function CheckoutScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ url?: string; appointment_id?: string }>();
  const checkoutUrl = decodeURIComponent(String(params.url ?? ""));
  const appointmentId = String(params.appointment_id ?? "");

  const releaseHold = useReleaseHold();
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  // Guard so a return/cancel is handled exactly once (nav events can fire twice).
  const settled = useRef(false);

  const goSuccess = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    router.replace(`/booking/payment-success?appointment_id=${appointmentId}`);
  }, [appointmentId]);

  const releaseAndBack = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    // Free the reserved slot immediately (don't wait for the 10-min TTL sweep).
    if (appointmentId) releaseHold.mutate(appointmentId);
    router.back();
  }, [appointmentId, releaseHold]);

  // Intercept our own return URLs before the WebView loads them.
  const shouldLoad = useCallback(
    (url: string): boolean => {
      if (url.includes("/payment-success")) {
        goSuccess();
        return false;
      }
      if (url.includes("/payment-cancel")) {
        releaseAndBack();
        return false;
      }
      return true;
    },
    [goSuccess, releaseAndBack]
  );

  const confirmCancel = useCallback(() => {
    if (settled.current) return;
    Alert.alert(t("payments.checkoutCancelTitle"), t("payments.checkoutCancelBody"), [
      { text: t("payments.checkoutKeep"), style: "cancel" },
      { text: t("payments.checkoutCancelConfirm"), style: "destructive", onPress: releaseAndBack },
    ]);
  }, [t, releaseAndBack]);

  // Android hardware back = cancel (with confirmation) while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        confirmCancel();
        return true; // we handle it
      });
      return () => sub.remove();
    }, [confirmCancel])
  );

  if (!checkoutUrl) {
    return (
      <Screen padded edges={["top", "left", "right", "bottom"]}>
        <AppHeader title={t("payments.checkoutTitle")} showBack={false} />
        <ErrorState message={t("payments.checkoutUnavailable")} onRetry={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <AppHeader
          title={t("payments.checkoutTitle")}
          showBack={false}
          right={
            <Button variant="ghost" fullWidth={false} label={t("payments.checkoutCancelConfirm")} onPress={confirmCancel} />
          }
        />
      </View>

      {errored ? (
        <View style={styles.center}>
          <ErrorState
            message={t("payments.checkoutError")}
            onRetry={() => {
              setErrored(false);
              setLoading(true);
            }}
          />
        </View>
      ) : (
        <View style={styles.flex}>
          <WebView
            source={{ uri: checkoutUrl }}
            originWhitelist={["https://*", "http://*"]}
            onShouldStartLoadWithRequest={(req) => shouldLoad(req.url)}
            onNavigationStateChange={(nav: WebViewNavigation) => {
              // Fallback for platforms/redirects where the request hook doesn't fire.
              if (nav.url.includes("/payment-success")) goSuccess();
              else if (nav.url.includes("/payment-cancel")) releaseAndBack();
            }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setErrored(true);
            }}
            // Unrecoverable WebView crash (renderer process gone) before payment →
            // treat as cancel so the held slot is freed (settled-guarded: a no-op if
            // the payment already succeeded).
            onRenderProcessGone={releaseAndBack}
            onContentProcessDidTerminate={releaseAndBack}
            startInLoadingState={false}
          />
          {loading ? (
            <View style={[styles.center, styles.overlay, { backgroundColor: colors.background }]}>
              <ActivityIndicator color={colors.primary} />
              <Text variant="caption" color="textMuted" style={{ marginTop: 12 }}>
                {t("payments.secured")}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  overlay: { ...StyleSheet.absoluteFillObject },
});
