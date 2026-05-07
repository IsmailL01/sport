// Безопасное хранение auth-токенов через expo-secure-store
// (Keychain на iOS, EncryptedSharedPreferences на Android).

import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'auth.accessToken';
const REFRESH_KEY = 'auth.refreshToken';

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
};

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const access = await SecureStore.getItemAsync(ACCESS_KEY);
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!access || !refresh) return null;
  return { accessToken: access, refreshToken: refresh };
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
