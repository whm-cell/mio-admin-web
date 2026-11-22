import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSavedCredentials,
  readSavedCredentials,
  saveCredentials,
  syncSavedCredentialsAfterUpdate,
} from '../src/savedCredentials';

const STORAGE_KEY = 'mio.admin.saved_credentials';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    store,
    storage: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
    },
  };
}

describe('savedCredentials', () => {
  let memory: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    memory = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: memory.storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves, reads, and clears credentials cleanly', () => {
    expect(readSavedCredentials()).toBeNull();

    saveCredentials('miioo_admin', 'initial-pass-123');
    expect(memory.store.get(STORAGE_KEY)).toBe(
      JSON.stringify({ username: 'miioo_admin', password: 'initial-pass-123' }),
    );
    expect(readSavedCredentials()).toEqual({
      username: 'miioo_admin',
      password: 'initial-pass-123',
    });

    clearSavedCredentials();
    expect(readSavedCredentials()).toBeNull();
    expect(memory.store.has(STORAGE_KEY)).toBe(false);
  });

  it('returns null on malformed or incomplete storage JSON', () => {
    memory.store.set(STORAGE_KEY, '{broken-json');
    expect(readSavedCredentials()).toBeNull();

    memory.store.set(STORAGE_KEY, JSON.stringify({ username: 'only_user' }));
    expect(readSavedCredentials()).toBeNull();

    memory.store.set(STORAGE_KEY, JSON.stringify({ username: 123, password: 'pw' }));
    expect(readSavedCredentials()).toBeNull();

    memory.store.set(STORAGE_KEY, 'null');
    expect(readSavedCredentials()).toBeNull();
  });

  it('syncSavedCredentialsAfterUpdate handles empty state, username, password, and both', () => {
    // Empty state: must remain empty rather than writing partial credentials
    syncSavedCredentialsAfterUpdate({ username: 'ghost', newPassword: 'new-password' });
    expect(readSavedCredentials()).toBeNull();

    saveCredentials('admin_v1', 'pass_v1');

    // Username-only update
    syncSavedCredentialsAfterUpdate({ username: 'admin_v2' });
    expect(readSavedCredentials()).toEqual({ username: 'admin_v2', password: 'pass_v1' });

    // Password-only update
    syncSavedCredentialsAfterUpdate({ newPassword: 'pass_v2' });
    expect(readSavedCredentials()).toEqual({ username: 'admin_v2', password: 'pass_v2' });

    // Both username and password update
    syncSavedCredentialsAfterUpdate({ username: 'admin_v3', newPassword: 'pass_v3' });
    expect(readSavedCredentials()).toEqual({ username: 'admin_v3', password: 'pass_v3' });
  });

  it('ignores storage exceptions such as private-mode quota failures', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('storage blocked');
        },
        setItem: () => {
          throw new Error('quota exceeded');
        },
        removeItem: () => {
          throw new Error('storage blocked');
        },
      },
    });

    expect(() => saveCredentials('admin', 'secret1234')).not.toThrow();
    expect(readSavedCredentials()).toBeNull();
    expect(() => clearSavedCredentials()).not.toThrow();
  });
});
