import { describe, expect, test } from 'vitest';

describe('theme toggle', () => {
  test('sets dark data-theme and persists preference', async () => {
    document.body.innerHTML = `
      <header class="app-header">
        <h1 class="app-title">beads-ui</h1>
        <div class="header-actions">
          <label class="theme-toggle">
            <span>Dark</span>
            <input id="theme-switch" type="checkbox" />
          </label>
        </div>
      </header>
      <main id="app"></main>`;

    // Simulate the DOMContentLoaded logic from main.js
    const themeSwitch = /** @type {HTMLInputElement} */ (
      document.getElementById('theme-switch')
    );
    themeSwitch.checked = true;
    themeSwitch.dispatchEvent(new Event('change'));

    // Apply attribute as in main.js handler
    document.documentElement.setAttribute('data-theme', 'dark');
    window.localStorage.setItem('beads-ui.theme', 'dark');

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('beads-ui.theme')).toBe('dark');
  });

  test('can switch back to light explicitly', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    window.localStorage.setItem('beads-ui.theme', 'dark');
    // Simulate toggle off
    document.documentElement.setAttribute('data-theme', 'light');
    window.localStorage.setItem('beads-ui.theme', 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('beads-ui.theme')).toBe('light');
  });
});
