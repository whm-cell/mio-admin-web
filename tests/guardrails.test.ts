import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runGuardrails } from '../scripts/guard';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createdTempDirs: string[] = [];

function createFixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-admin-guard-'));
  createdTempDirs.push(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
  }
  return dir;
}

afterEach(() => {
  while (createdTempDirs.length > 0) {
    const dir = createdTempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('AST guardrails (scripts/guard.ts)', () => {
  it('passes on the real mio-admin-web repository and reports shape-review hotspots', () => {
    const result = runGuardrails(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('RouteEditorDrawer.tsx'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('ModelCatalogPage.tsx'))).toBe(true);
  });

  it('blocks fetch calls outside src/api.ts while allowing type references and shadowed identifiers', () => {
    const dir = createFixture({
      'src/api.ts': 'export const okFetch = () => fetch("/api/v1/admin/auth/me");\n',
      'src/components/BadFetch.tsx': [
        'export type FetchLike = typeof fetch;',
        'export function shadowed(fetch: (u: string) => void) { fetch("/ok"); }',
        'export function propAccess(obj: { fetch: () => void }) { obj.fetch(); }',
        'export function badDirect() { return fetch("/bad"); }',
        'export function badWindow() { return window.fetch("/bad"); }',
        'export function badGlobal() { return globalThis.fetch("/bad"); }',
      ].join('\n'),
    });

    const result = runGuardrails(dir);
    expect(result.ok).toBe(false);
    const fetchErrors = result.errors.filter((e) => e.startsWith('[FORBIDDEN_FETCH]'));
    expect(fetchErrors).toHaveLength(3);
    expect(fetchErrors.every((e) => e.includes('src/components/BadFetch.tsx'))).toBe(true);
  });

  it('blocks localStorage/sessionStorage outside src/savedCredentials.ts while respecting shadowing', () => {
    const dir = createFixture({
      'src/savedCredentials.ts': 'export const okRead = () => window.localStorage.getItem("k");\n',
      'src/components/BadStorage.tsx': [
        'export function shadowed() { const localStorage = { getItem: () => null }; return localStorage.getItem("k"); }',
        'export function badLocal() { return localStorage.getItem("x"); }',
        'export function badSession() { return sessionStorage.getItem("x"); }',
        'export function badGlobal() { return globalThis.localStorage.setItem("x", "1"); }',
      ].join('\n'),
    });

    const result = runGuardrails(dir);
    expect(result.ok).toBe(false);
    const storageErrors = result.errors.filter((e) => e.startsWith('[FORBIDDEN_STORAGE]'));
    expect(storageErrors).toHaveLength(3);
    expect(storageErrors.every((e) => e.includes('src/components/BadStorage.tsx'))).toBe(true);
  });

  it('blocks reverse dependencies from foundation modules to UI modules', () => {
    const dir = createFixture({
      'src/components/Widget.tsx': 'export const Widget = () => null;\n',
      'src/api.ts': "import { Widget } from './components/Widget';\nexport const x = Widget;\n",
      'src/types.ts': "import type App from './App';\nexport type A = typeof App;\n",
      'src/App.tsx': 'export default function App() { return null; }\n',
    });

    const result = runGuardrails(dir);
    expect(result.ok).toBe(false);
    const revErrors = result.errors.filter((e) => e.startsWith('[REVERSE_DEPENDENCY]'));
    expect(revErrors).toHaveLength(2);
    expect(revErrors.some((e) => e.includes('src/api.ts'))).toBe(true);
    expect(revErrors.some((e) => e.includes('src/types.ts'))).toBe(true);
  });

  it('blocks src importing tests or scripts and blocks unresolved relative imports', () => {
    const dir = createFixture({
      'tests/helper.ts': 'export const helper = 1;\n',
      'src/App.tsx': [
        "import { helper } from '../tests/helper';",
        "import { missing } from './doesNotExist';",
        'export const val = [helper, missing];',
      ].join('\n'),
    });

    const result = runGuardrails(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith('[FORBIDDEN_LAYER_IMPORT]'))).toBe(true);
    expect(result.errors.some((e) => e.startsWith('[UNRESOLVED_IMPORT]'))).toBe(true);
  });

  it('detects relative import cycles', () => {
    const dir = createFixture({
      'src/components/A.tsx': "import { b } from './B';\nexport const a = b;\n",
      'src/components/B.tsx': "import { a } from './A';\nexport const b = a;\n",
    });

    const result = runGuardrails(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith('[IMPORT_CYCLE]'))).toBe(true);
  });

  it('blocks unknown files and revived presets files in src', () => {
    const dir = createFixture({
      'stray-notes.txt': 'untracked file\n',
      'src/presets.ts': 'export const PRESETS = [];\n',
      'src/components/presets.tsx': 'export const Presets = () => null;\n',
    });

    const result = runGuardrails(dir);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.startsWith('[UNKNOWN_FILE]') && e.includes('stray-notes.txt')),
    ).toBe(true);
    const presetsErrors = result.errors.filter((e) => e.startsWith('[FORBIDDEN_PRESETS_FILE]'));
    expect(presetsErrors).toHaveLength(2);
  });

  it('blocks personal host path prefixes and raw secret key literals', () => {
    const fakeMacVolumePath = ['', 'Volumes', 'private-disk', 'repo'].join('/');
    const fakeUserHomePath = ['', 'Users', 'dev', 'secret'].join('/');
    const fakeWinUserPath = ['C:', 'Users', 'dev', 'repo'].join('\\');
    const fakeSecretKey = ['sk', '1234567890abcdefghijklmnop'].join('-');

    const dir = createFixture({
      'README.md': [
        `Path A: ${fakeMacVolumePath}`,
        `Path B: ${fakeUserHomePath}`,
        `Path C: ${fakeWinUserPath}`,
      ].join('\n'),
      'src/types.ts': `export const BAD_KEY = '${fakeSecretKey}';\n`,
    });

    const result = runGuardrails(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.filter((e) => e.startsWith('[PERSONAL_PATH]'))).toHaveLength(3);
    expect(result.errors.filter((e) => e.startsWith('[SECRET_LITERAL]'))).toHaveLength(1);
  });
});
