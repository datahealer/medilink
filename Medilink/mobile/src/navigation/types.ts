import type { NavigatorScreenParams } from "@react-navigation/native";

/**
 * Typed navigation surface. Routes are declared here so screens (added later) and
 * `navigation.navigate(...)` calls are type-checked from day one. No screen
 * components exist yet — this is the contract, not the UI.
 */
export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  VerifyOtp: { phone?: string; email?: string } | undefined;
};

export type AppTabParamList = {
  Home: undefined;
  Appointments: undefined;
  Records: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: NavigatorScreenParams<AppTabParamList>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
