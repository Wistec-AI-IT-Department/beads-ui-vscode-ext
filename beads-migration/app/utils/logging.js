/**
 * Debug logger helper for the browser app.
 */
import createDebug from 'debug';

/**
 * Create a namespaced logger.
 *
 * @param {string} ns - Module namespace suffix (e.g., 'ws', 'views:list').
 */
export function debug(ns) {
  return createDebug(`beads-ui:${ns}`);
}
