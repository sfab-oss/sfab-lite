import { parseArgs } from "node:util";

/**
 * pnpm script forwarding uses `--` (`pnpm upload-kernel-r2 -- --remote`).
 * Node then sees `['--', '--remote']`; parseArgs treats everything after `--`
 * as positionals and throws. Drop the separator so flags still parse.
 */
export function parseCli(options, argv = process.argv.slice(2)) {
  return parseArgs({
    args: argv.filter((arg) => arg !== "--"),
    options,
  });
}
