import { appendFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

export function out(message) {
  process.stdout.write(`${message}\n`);
}

export function err(message) {
  process.stderr.write(`${message}\n`);
}

export function githubError(message) {
  err(`::error::${message}`);
}

export function githubWarning(message) {
  err(`::warning::${message}`);
}

export function githubNotice(message) {
  err(`::notice::${message}`);
}

/**
 * @param {Record<string, string|boolean|number|null|undefined>} outputs
 * @param {string|null} [path]
 */
export function writeGithubOutput(outputs, path = process.env.GITHUB_OUTPUT || null) {
  const lines = [];
  for (const [key, value] of Object.entries(outputs)) {
    let string = value;
    if (typeof string === 'boolean') string = string ? 'true' : 'false';
    if (string == null) string = '';
    string = String(string);
    if (string.includes('\n')) {
      const delimiter = `EOF_${randomBytes(8).toString('hex')}`;
      lines.push(`${key}<<${delimiter}`, string, delimiter);
    } else {
      lines.push(`${key}=${string}`);
    }
  }

  if (!path) {
    for (const line of lines) out(line);
    return;
  }
  appendFileSync(path, `${lines.join('\n')}\n`);
}

/**
 * @param {string} markdown
 * @param {string|null} [path]
 */
export function appendStepSummary(markdown, path = process.env.GITHUB_STEP_SUMMARY || null) {
  if (!path) {
    out(markdown);
    return;
  }
  appendFileSync(path, `${markdown}\n`);
}

/**
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    let arg = argv[i];
    if (!arg.startsWith('--')) continue;
    arg = arg.slice(2);
    if (arg.includes('=')) {
      const [key, ...rest] = arg.split('=');
      args[key] = rest.join('=');
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[arg] = next;
      i++;
    } else {
      args[arg] = 'true';
    }
  }
  return args;
}

/**
 * @param {Record<string, string>} args
 * @param {string} key
 */
export function requireArg(args, key) {
  if (!args[key]) {
    githubError(`Missing required argument --${key}`);
    process.exit(1);
  }
  return args[key];
}

export function writeFile(path, contents) {
  writeFileSync(path, contents);
}
