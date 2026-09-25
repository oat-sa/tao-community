#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs, writeGithubOutput, out, githubError, appendStepSummary } from '../lib/cli.js';
import { ComposerPackages } from '../lib/composer-packages.js';
import { ReleaseNotes } from '../lib/release-notes.js';
import { parsePackageUpdateLine, splitPackageUpdateText } from '../lib/package-update.js';

const args = parseArgs(process.argv);
const path = args['composer-json'] ?? 'composer.json';
let updatesText = '';
if (args['updates-file'] && existsSync(args['updates-file'])) {
  updatesText = readFileSync(args['updates-file'], 'utf8');
} else if (args.updates && args.updates !== 'true') {
  updatesText = args.updates;
} else if (!process.stdin.isTTY) {
  updatesText = readFileSync(0, 'utf8');
}

const packages = new ComposerPackages();
const composer = packages.read(path);
const requireMap = packages.allRequire(composer);
/** @type {Array<{package: string, old: string, new: string}>} */
const changes = [];
/** @type {string[]} */
const normalizedLines = [];

for (const trimmed of splitPackageUpdateText(updatesText)) {
  let parsed;
  try {
    parsed = parsePackageUpdateLine(trimmed);
  } catch (e) {
    githubError(/** @type {Error} */ (e).message);
    process.exit(1);
  }
  if (!(parsed.package in requireMap)) {
    githubError(`Package does not exist in composer.json: ${parsed.package}`);
    process.exit(1);
  }
  changes.push({ package: parsed.package, old: requireMap[parsed.package], new: parsed.version });
  normalizedLines.push(`${parsed.package}=${parsed.version}`);
}

if (!changes.length) {
  githubError('No package updates provided');
  process.exit(1);
}

const output = args.output ?? 'changes.json';
writeFileSync(output, `${JSON.stringify(changes, null, 4)}\n`);

if (args['normalized-output'] && args['normalized-output'] !== 'true') {
  writeFileSync(args['normalized-output'], `${normalizedLines.join('\n')}\n`);
}

appendStepSummary(`## Requested backport updates\n\n${new ReleaseNotes().summaryTable(changes)}`);
writeGithubOutput({
  changed_count: String(changes.length),
  packages: changes.map((c) => c.package).join(','),
});
out(`Parsed ${changes.length} package update(s) into ${output}`);
