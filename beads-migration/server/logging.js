/**
 * Debug logger helper for Node server/CLI.
 */
import createDebug from 'debug';

/**
 * Create a namespaced logger for Node runtime.
 *
 * @param {string} ns - Module namespace suffix (e.g., 'ws', 'watcher').
 */
export function debug(ns) {
  return createDebug(`beads-ui:${ns}`);
}

/**
 * Enable all `beads-ui:*` debug logs at runtime for Node/CLI.
 * Safe to call multiple times.
 */
export function enableAllDebug() {
  // `debug` exposes a global enable/disable API.
  // Enabling after loggers are created updates their `.enabled` state.
  createDebug.enable(process.env.DEBUG || 'beads-ui:*');
}
