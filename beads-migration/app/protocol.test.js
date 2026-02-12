import { describe, expect, test } from 'vitest';
import {
  MESSAGE_TYPES,
  decodeReply,
  decodeRequest,
  isMessageType,
  isReply,
  isRequest,
  makeError,
  makeOk,
  makeRequest
} from './protocol.js';

describe('protocol', () => {
  test('version and message types', () => {
    expect(Array.isArray(MESSAGE_TYPES)).toBe(true);
    expect(MESSAGE_TYPES.length).toBeGreaterThan(3);
    expect(isMessageType('edit-text')).toBe(true);
    expect(isMessageType('unknown-type')).toBe(false);
  });

  test('makeRequest / isRequest / decodeRequest', () => {
    const req = makeRequest(
      'edit-text',
      { id: 'UI-1', field: 'title', value: 'X' },
      'r-1'
    );
    expect(isRequest(req)).toBe(true);
    const round = decodeRequest(JSON.parse(JSON.stringify(req)));
    expect(round.id).toBe('r-1');
    expect(round.type).toBe('edit-text');
  });

  test('makeOk / makeError / isReply / decodeReply', () => {
    const req = makeRequest(
      'edit-text',
      { id: 'UI-1', field: 'title', value: 'T' },
      'r-2'
    );
    const ok = makeOk(req, { id: 'UI-1', title: 'T' });
    expect(isReply(ok)).toBe(true);
    const ok2 = decodeReply(JSON.parse(JSON.stringify(ok)));
    expect(ok2.ok).toBe(true);

    const err = makeError(req, 'not_found', 'Issue not found');
    expect(isReply(err)).toBe(true);
    const err2 = decodeReply(JSON.parse(JSON.stringify(err)));
    expect(err2.ok).toBe(false);
    if (!('error' in err2) || !err2.error) {
      throw new Error('Expected error to be present when ok=false');
    }
    expect(err2.error.code).toBe('not_found');
  });

  test('invalid envelopes are rejected', () => {
    expect(() => decodeRequest({})).toThrow();
    expect(() => decodeReply({ ok: true })).toThrow();
  });
});

describe('server/protocol', () => {
  test('isMessageType returns true for known type', () => {
    const res = isMessageType('edit-text');

    expect(res).toBe(true);
  });

  test('isMessageType returns false for unknown type', () => {
    const res = isMessageType('not-a-type');

    expect(res).toBe(false);
  });

  test('makeRequest and decodeRequest round-trip', () => {
    const req = makeRequest(
      'edit-text',
      { id: 'UI-9', field: 'title', value: 'X' },
      'r-9'
    );

    const decoded = decodeRequest(JSON.parse(JSON.stringify(req)));

    expect(isRequest(req)).toBe(true);
    expect(decoded.id).toBe('r-9');
    expect(decoded.type).toBe('edit-text');
  });

  test('makeOk and makeError create valid replies', () => {
    const req = makeRequest(
      'edit-text',
      { id: 'UI-1', field: 'title', value: 'T' },
      'r-10'
    );

    const ok = makeOk(req, [{ id: 'UI-1' }]);
    const err = makeError(req, 'boom', 'Something went wrong');

    expect(isReply(ok)).toBe(true);
    expect(isReply(err)).toBe(true);
    expect(ok.ok).toBe(true);
    expect(err.ok).toBe(false);
  });

  test('decodeReply accepts ok and error envelopes', () => {
    const req = makeRequest('edit-text', { id: 'UI-1', text: 'x' }, 'r-11');
    const ok = makeOk(req, { id: 'UI-1' });
    const err = makeError(req, 'validation', 'Invalid');

    const ok2 = decodeReply(JSON.parse(JSON.stringify(ok)));
    const err2 = decodeReply(JSON.parse(JSON.stringify(err)));

    expect(ok2.ok).toBe(true);
    expect(err2.ok).toBe(false);
  });

  test('invalid envelopes throw on decode', () => {
    expect(() => decodeRequest({})).toThrow();
    expect(() => decodeReply({ ok: true })).toThrow();
  });

  test('exports protocol constants', () => {
    expect(Array.isArray(MESSAGE_TYPES)).toBe(true);
    expect(MESSAGE_TYPES.length).toBeGreaterThan(0);
  });
});
