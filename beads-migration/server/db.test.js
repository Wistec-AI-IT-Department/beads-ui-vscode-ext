import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { findNearestBeadsDb, resolveDbPath } from './db.js';

/** @type {string[]} */
const tmps = [];

function mkdtemp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-ui-test-'));
  tmps.push(dir);
  return dir;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  for (const d of tmps.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe('resolveDbPath', () => {
  test('uses explicit_db when provided', () => {
    const res = resolveDbPath({ cwd: '/x', explicit_db: './my.db', env: {} });
    expect(res.path.endsWith('/x/my.db')).toBe(true);
    expect(res.source).toBe('flag');
  });

  test('uses BEADS_DB from env when set', () => {
    const res = resolveDbPath({ cwd: '/x', env: { BEADS_DB: '/abs/env.db' } });
    expect(res.path).toBe('/abs/env.db');
    expect(res.source).toBe('env');
  });

  test('finds nearest .beads/ui.db walking up', () => {
    const root = mkdtemp();
    const nested = path.join(root, 'a', 'b', 'c');
    fs.mkdirSync(nested, { recursive: true });
    const beads = path.join(root, '.beads');
    fs.mkdirSync(beads);
    const ui_db = path.join(beads, 'ui.db');
    fs.writeFileSync(ui_db, '');

    const found = findNearestBeadsDb(nested);
    expect(found).toBe(ui_db);

    const res = resolveDbPath({ cwd: nested, env: {} });
    expect(res.path).toBe(ui_db);
    expect(res.source).toBe('nearest');
  });

  test('falls back to ~/.beads/default.db when none found', async () => {
    // Mock os.homedir to a deterministic location using spy
    const home = mkdtemp();
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const mod = await import('./db.js');
    const res = mod.resolveDbPath({ cwd: '/no/db/here', env: {} });
    expect(res.path).toBe(path.join(home, '.beads', 'default.db'));
    expect(res.source).toBe('home-default');
  });
});
