import { describe, expect, test, vi } from 'vitest';
import { runBd, runBdJson } from './bd.js';
import { handleMessage } from './ws.js';

vi.mock('./bd.js', () => ({
  runBd: vi.fn(),
  runBdJson: vi.fn()
}));

function makeStubSocket() {
  return {
    sent: /** @type {string[]} */ ([]),
    readyState: 1,
    OPEN: 1,
    /** @param {string} msg */
    send(msg) {
      this.sent.push(String(msg));
    }
  };
}

describe('ws labels handlers', () => {
  test('label-add validates payload', async () => {
    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'x',
          type: /** @type {any} */ ('label-add'),
          payload: {}
        })
      )
    );
    const obj = JSON.parse(ws.sent[0]);
    expect(obj.ok).toBe(false);
    expect(obj.error.code).toBe('bad_request');
  });

  test('label-add runs bd and replies with show', async () => {
    const rb = /** @type {import('vitest').Mock} */ (runBd);
    const rj = /** @type {import('vitest').Mock} */ (runBdJson);
    rb.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });
    rj.mockResolvedValueOnce({
      code: 0,
      stdoutJson: { id: 'UI-1', labels: ['frontend'] }
    });

    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'a',
          type: /** @type {any} */ ('label-add'),
          payload: { id: 'UI-1', label: 'frontend' }
        })
      )
    );

    const call = rb.mock.calls[0][0];
    expect(call.slice(0, 3)).toEqual(['label', 'add', 'UI-1']);
    const obj = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(obj.ok).toBe(true);
    expect(obj.payload && obj.payload.id).toBe('UI-1');
  });

  test('label-remove runs bd and replies with show', async () => {
    const rb = /** @type {import('vitest').Mock} */ (runBd);
    const rj = /** @type {import('vitest').Mock} */ (runBdJson);
    rb.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });
    rj.mockResolvedValueOnce({
      code: 0,
      stdoutJson: { id: 'UI-1', labels: [] }
    });

    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'b',
          type: /** @type {any} */ ('label-remove'),
          payload: { id: 'UI-1', label: 'frontend' }
        })
      )
    );

    const call = rb.mock.calls[rb.mock.calls.length - 1][0];
    expect(call.slice(0, 3)).toEqual(['label', 'remove', 'UI-1']);
    const obj = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(obj.ok).toBe(true);
    expect(obj.payload && obj.payload.id).toBe('UI-1');
  });
});
