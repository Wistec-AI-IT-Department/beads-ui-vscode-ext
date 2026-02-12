/**
 * @import { Config } from 'prettier'
 */

/** @type {Config} */
export default {
  singleQuote: true,
  trailingComma: 'none',
  proseWrap: 'always',
  plugins: ['@trivago/prettier-plugin-sort-imports'],
  importOrder: ['^@(.*)$', '<THIRD_PARTY_MODULES>', '^[./]'],
  importOrderSortSpecifiers: true
};
