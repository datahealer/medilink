/* eslint-env jest */
/**
 * Jest setup — MediLink mobile.
 *
 * Only mocks native modules that have no JS implementation under Jest. Everything
 * else runs the real code, so a test failure means the app is broken rather than
 * the mock being stale.
 */

// `expo-secure-store` is the session store; it has no Jest-safe native impl.
// An in-memory map keeps auth-adjacent code paths exercisable.
jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn((k) => Promise.resolve(store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn((k, v) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((k) => {
      store.delete(k);
      return Promise.resolve();
    }),
    __store: store,
  };
});

// Notifications: assert on calls, never hit the OS.
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: "ExponentPushToken[test]" })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  AndroidImportance: { DEFAULT: 3 },
}));

jest.mock("expo-device", () => ({ isDevice: true }));

// NetInfo drives React Query's online state; the listener must exist but stay inert.
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
}));

// Router: assert navigation targets without a navigation tree.
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  useSegments: jest.fn(() => []),
  Redirect: () => null,
  Stack: { Screen: () => null },
  Link: () => null,
}));

// `react-native-webview` calls TurboModuleRegistry.getEnforcing at import time, which
// throws under Jest ("'RNCWebViewModule' could not be found"). It is reached indirectly by
// anything importing the `@/components/ui` barrel, because that barrel exports OsmMapView —
// so without this stub a component test fails purely for its import graph. Rendering the map
// itself is a device concern (see DEVICE_TEST_CHECKLIST.md), not something Jest can assert.
jest.mock("react-native-webview", () => {
  const React = require("react");
  return { WebView: (props) => React.createElement("WebView", props) };
});

// Google Sign-In calls TurboModuleRegistry.getEnforcing('RNGoogleSignin') at IMPORT time,
// so it throws under Jest for any suite that merely reaches it through the import graph —
// src/data/real/index.ts → authService → googleAuth pulls it into the data-layer
// integration tests, which never touch Google at all. This stub keeps those suites honest
// about what they are testing. The behavioural tests in
// src/services/__tests__/googleAuth.test.ts declare their own richer jest.mock, which takes
// precedence over this one.
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ type: "cancelled" })),
    signOut: jest.fn(() => Promise.resolve()),
  },
  isErrorWithCode: jest.fn(() => false),
  statusCodes: {
    SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    IN_PROGRESS: "IN_PROGRESS",
    PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
  },
}));

// `src/utils/restart.ts` touches DevSettings at module load (to decide whether a
// dev reload is possible). Under Jest that emits a NativeEventEmitter warning, so
// stub it — the reload path itself is never exercised in tests.
jest.mock("react-native/Libraries/Utilities/DevSettings", () => ({
  addMenuItem: jest.fn(),
  reload: jest.fn(),
}));

// Run with production-like __DEV__ so the `if (__DEV__) console.warn(...)`
// diagnostics scattered through the data layer stay quiet AND the code paths under
// test match what actually ships. Set to true in a single test if you need to
// assert on dev-only behaviour.
global.__DEV__ = false;
