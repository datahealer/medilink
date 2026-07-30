import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { reportError } from "@/services/reporting";
import { reloadApp } from "@/utils/restart";

/** Themed, localized fallback shown when a descendant render throws. */
function ErrorFallback({ onReset, error }: { onReset: () => void; error?: Error }) {
  const { colors, spacing } = useTheme();
  const { t } = useI18n();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <Text variant="title" align="center">
          {t("errors.crashTitle")}
        </Text>
        <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
          {t("errors.crashBody")}
        </Text>
        {__DEV__ && error?.message ? (
          <Text variant="caption" color="error" align="center" style={{ marginTop: spacing.md }}>
            {error.message}
          </Text>
        ) : null}
        <View style={{ marginTop: spacing.lg, minWidth: 200 }}>
          <Button label={t("common.retry")} onPress={onReset} />
        </View>
      </View>
    </SafeAreaView>
  );
}

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * App-wide error boundary. Catches render/lifecycle errors anywhere in the
 * navigation tree so an uncaught exception shows a recoverable fallback instead of
 * a white screen. Mounted inside the Theme + I18n providers so the fallback is
 * themed and localized. React error boundaries only catch render-phase errors —
 * async/event-handler errors are still handled by the existing per-screen states.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Render errors carry no PII, so the component stack is safe to attach — and it is the
    // one piece of context that makes a production crash diagnosable. `reportError` still
    // logs to the console, so dev behaviour is unchanged when no DSN is configured.
    reportError(error, {
      tags: { surface: "error-boundary" },
      extra: { componentStack: info.componentStack },
    });
  }

  reset = () => {
    // In dev this fully reloads the JS bundle (cleanest recovery); in a production
    // build there is no reload primitive, so clear the error and re-mount the subtree.
    if (!reloadApp()) this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
