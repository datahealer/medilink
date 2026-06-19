import * as SecureStore from "expo-secure-store";

/**
 * Supabase auth-storage adapter backed by the OS keychain/keystore via expo-secure-store.
 *
 * SecureStore caps a single value at ~2KB, but a Supabase session (access + refresh
 * JWT + user) can exceed that, so values are transparently chunked. A small index
 * key records the chunk count so reads can reassemble (and stale chunks get purged).
 */
const CHUNK_SIZE = 1800; // safely under the 2048-byte SecureStore limit
const indexKey = (key: string) => `${key}.__chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

export const SecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(indexKey(key));
    if (countRaw == null) {
      // Non-chunked legacy / small value.
      return SecureStore.getItemAsync(key);
    }
    const count = parseInt(countRaw, 10);
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part == null) return null; // corrupt/partial — treat as missing
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    await removeChunks(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(
        chunkKey(key, i),
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      );
    }
    await SecureStore.setItemAsync(indexKey(key), String(count));
    // Drop any non-chunked value left from a prior small session.
    await SecureStore.deleteItemAsync(key);
  },

  async removeItem(key: string): Promise<void> {
    await removeChunks(key);
    await SecureStore.deleteItemAsync(key);
  },
};

async function removeChunks(key: string): Promise<void> {
  const countRaw = await SecureStore.getItemAsync(indexKey(key));
  if (countRaw == null) return;
  const count = parseInt(countRaw, 10);
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
  await SecureStore.deleteItemAsync(indexKey(key));
}
