/**
 * Known status values in canonical order.
 *
 * @type {Array<'open'|'in_progress'|'closed'>}
 */
export const STATUSES = ['open', 'in_progress', 'closed'];

/**
 * Map canonical status to display label.
 *
 * @param {string | null | undefined} status
 * @returns {string}
 */
export function statusLabel(status) {
  switch ((status || '').toString()) {
    case 'open':
      return 'Open';
    case 'in_progress':
      return 'In progress';
    case 'closed':
      return 'Closed';
    default:
      return (status || '').toString() || 'Open';
  }
}
