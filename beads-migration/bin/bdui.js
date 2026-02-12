#!/usr/bin/env node
/**
 * Thin CLI entry for `bdui`.
 * Delegates to `server/cli/index.js` and sets the process exit code.
 */
import { main } from '../server/cli/index.js';
import { debug } from '../server/logging.js';

const argv = process.argv.slice(2);

try {
  const code = await main(argv);
  if (Number.isFinite(code)) {
    process.exitCode = code;
  }
} catch (err) {
  debug('cli')('fatal %o', err);
  process.exitCode = 1;
}
