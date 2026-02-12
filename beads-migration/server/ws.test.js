import { describe, expect, test, vi } from 'vitest';
import { handleMessage } from './ws.js';

/** @returns {any} */
function makeStubSocket() {
  return {
    sent: /** @type {string[]} */ ([]),
    readyState: 1,
    OPEN: 1,
    /** @param {string} msg */
    send(msg) {
      this.sent.push(String(msg));
    },
    ping: vi.fn(),
    terminate: vi.fn()
  };
}

describe('ws message handling', () => {
  test('invalid JSON yields bad_json error', () => {
    const ws = makeStubSocket();
    handleMessage(/** @type {any} */ (ws), Buffer.from('{oops'));
    expect(ws.sent.length).toBe(1);
    const obj = JSON.parse(ws.sent[0]);
    expect(obj.ok).toBe(false);
    expect(obj.error.code).toBe('bad_json');
  });

  test('invalid envelope yields bad_request', () => {
    const ws = makeStubSocket();
    handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(JSON.stringify({ not: 'a request' }))
    );
    const last = ws.sent[ws.sent.length - 1];
    const obj = JSON.parse(last);
    expect(obj.ok).toBe(false);
    expect(obj.error.code).toBe('bad_request');
  });

  test('unknown message type returns unknown_type error', () => {
    const ws = makeStubSocket();
    const req = { id: '1', type: 'some-unknown', payload: {} };
    handleMessage(/** @type {any} */ (ws), Buffer.from(JSON.stringify(req)));
    const last = ws.sent[ws.sent.length - 1];
    const obj = JSON.parse(last);
    expect(obj.ok).toBe(false);
    expect(obj.error.code).toBe('unknown_type');
  });
});

// Note: broadcast behavior is integration-tested later when a full server can run.
