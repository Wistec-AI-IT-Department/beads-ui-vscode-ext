import DOMPurify from 'dompurify';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import { marked } from 'marked';

/**
 * Render Markdown safely as HTML using marked and DOMPurify.
 * Returns a lit-html TemplateResult via the unsafeHTML directive so it can be
 * embedded directly in templates.
 *
 * @param {string} markdown - Markdown source text
 */
export function renderMarkdown(markdown) {
  const parsed = /** @type {string} */ (marked.parse(markdown));
  const html_string = DOMPurify.sanitize(parsed);
  return unsafeHTML(html_string);
}
