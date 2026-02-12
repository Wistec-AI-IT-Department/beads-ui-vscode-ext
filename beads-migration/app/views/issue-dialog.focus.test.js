import { describe, expect, test } from 'vitest';
import { createIssueDialog } from './issue-dialog.js';

// Provide a minimal dialog polyfill for jsdom environments
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = /** @type {any} */ (HTMLDialogElement.prototype);
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    proto.close = function close() {
      this.removeAttribute('open');
    };
  }
}

describe('issue-dialog focus restoration', () => {
  test('restores focus to previously focused element after close', async () => {
    document.body.innerHTML =
      '<div id="mount"></div><button id="card">Card</button>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const card_btn = /** @type {HTMLButtonElement} */ (
      document.getElementById('card')
    );
    card_btn.focus();
    expect(document.activeElement).toBe(card_btn);

    const store = { getState: () => ({ selected_id: null }) };
    const dlg = createIssueDialog(mount, /** @type {any} */ (store), () => {});
    dlg.open('UI-1');

    // Simulate closing the dialog
    dlg.close();

    // Focus returns to the previously focused element
    expect(document.activeElement).toBe(card_btn);
  });
});
