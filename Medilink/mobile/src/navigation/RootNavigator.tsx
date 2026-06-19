import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  NavigationContainer,
  type LinkingOptions,
  type Theme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/theme/ThemeProvider";
import type { RootStackParamList } from "@/navigation/types";

const RootStack = createNativeStackNavigator<RootStackParamList>();

// Deep-link map (scheme `medilink://`). Screen names are wired as screens land.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["medilink://"],
  config: {
    screens: {
      Auth: { screens: { Welcome: "welcome", Login: "login", Signup: "signup" } },
      App: {
        screens: {
          Home: "home",
          Appointments: "appointments",
          Records: "records",
          Account: "account",
        },
      },
    },
  },
};

/**
 * Foundation placeholder. Stands in for the Auth/App stacks until real screens are
 * built — keeps the navigator runnable without shipping any product UI.
 */
function Placeholder({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <Text style={{ color: colors.foreground }}>{label}</Text>
    </View>
  );
}

export function RootNavigator() {
  const { session, initializing } = useAuth();
  const { colors, scheme } = useTheme();

  const navTheme: Theme = {
    dark: scheme === "dark",
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.foreground,
      border: colors.border,
      notification: colors.accent,
    },
  };

  if (initializing) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <RootStack.Screen name="App">
            {() => <Placeholder label="Signed in — app screens pending" />}
          </RootStack.Screen>
        ) : (
          <RootStack.Screen name="Auth">
            {() => <Placeholder label="Signed out — auth screens pending" />}
          </RootStack.Screen>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
