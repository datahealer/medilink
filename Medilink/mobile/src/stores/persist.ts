import * as SecureStore from "expo-secure-store";
import { type StateStorage } from "zustand/middleware";

/**
 * Zustand persistence backed by the OS keychain/keystore (expo-secure-store).
 *
 * These foundation prefs (theme, locale, onboarding flag) are tiny and well under
 * SecureStore's ~2KB-per-value limit, so no chunking is needed here. (The Supabase
 * *session* uses the chunking adapter in `src/lib/secureStore.ts`.)
 *
 * SecureStore keys must be alphanumeric + ".", "-", "_" — we namespace with dots.
 */
export const secureStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};
