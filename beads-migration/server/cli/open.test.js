import { describe, expect, test } from 'vitest';
import { computeOpenCommand } from './open.js';

describe('computeOpenCommand', () => {
  test('returns macOS open command', () => {
    const r = computeOpenCommand('http://127.0.0.1:3000', 'darwin');

    expect(r.cmd).toBe('open');
    expect(r.args).toEqual(['http://127.0.0.1:3000']);
  });

  test('returns Linux xdg-open command', () => {
    const r = computeOpenCommand('http://127.0.0.1:3000', 'linux');

    expect(r.cmd).toBe('xdg-open');
    expect(r.args).toEqual(['http://127.0.0.1:3000']);
  });

  test('returns Windows start command via cmd', () => {
    const r = computeOpenCommand('http://127.0.0.1:3000', 'win32');

    expect(r.cmd).toBe('cmd');
    expect(r.args.slice(0, 3)).toEqual(['/c', 'start', '']);
    expect(r.args[r.args.length - 1]).toBe('http://127.0.0.1:3000');
  });
});
