const STORAGE_KEY = 'mio.admin.saved_credentials';

export interface SavedAdminCredentials {
  username: string;
  password: string;
}

export function readSavedCredentials(): SavedAdminCredentials | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedAdminCredentials>;
    if (typeof parsed.username === 'string' && typeof parsed.password === 'string') {
      return { username: parsed.username, password: parsed.password };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCredentials(username: string, password: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, password }));
  } catch {
    // Ignore private-mode storage quota errors
  }
}

export function clearSavedCredentials(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function syncSavedCredentialsAfterUpdate(patch: {
  username?: string;
  newPassword?: string;
}): void {
  const existing = readSavedCredentials();
  if (!existing) return;
  saveCredentials(patch.username ?? existing.username, patch.newPassword ?? existing.password);
}
