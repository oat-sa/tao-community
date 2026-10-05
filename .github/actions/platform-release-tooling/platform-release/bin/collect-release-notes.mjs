#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs, requireArg, writeGithubOutput, out, githubError, githubWarning } from '../lib/cli.js';
import { ComposerPackages } from '../lib/composer-packages.js';
import { GithubClient } from '../lib/github-client.js';
import { ReleaseNotes } from '../lib/release-notes.js';
import * as SemVer from '../lib/semver.js';

const args = parseArgs(process.argv);
const changesPath = requireArg(args, 'changes');
const platformVersion = requireArg(args, 'platform-version');
const sourceRelease = args['source-release'];
const lockPath = args['composer-lock'] ?? 'composer.lock';
const output = args.output ?? 'release-notes.md';

if (!existsSync(changesPath)) {
  githubError(`Unable to read changes file: ${changesPath}`);
  process.exit(1);
}

const changes = JSON.parse(readFileSync(changesPath, 'utf8'));
if (!Array.isArray(changes)) {
  githubError('Invalid changes JSON');
  process.exit(1);
}

const packages = new ComposerPackages();
const github = new GithubClient();
/** @type {Array<Record<string, unknown>>} */
const enriched = [];

for (const change of changes) {
  if (!change?.package) continue;
  const packageName = String(change.package);
  const oldRaw = change.old != null ? String(change.old) : '';
  const newRaw = change.new != null ? String(change.new) : '';
  if (!oldRaw || !newRaw || oldRaw === '(none)') continue;
  const old = SemVer.normalize(oldRaw);
  const neu = SemVer.normalize(newRaw);
  // Community-bridge no-ops (same pin listed twice) produce empty ranges.
  if (old === neu) continue;

  /** @type {Record<string, unknown>} */
  const entry = {
    package: packageName,
    old: oldRaw,
    new: newRaw,
    notes: '',
    missing: false,
    compare_url: null,
  };

  const repo = packages.resolveGithubRepo(packageName, existsSync(lockPath) ? lockPath : null);
  if (!repo) {
    entry.missing = true;
    entry.notes = '_Could not resolve GitHub repository for package._';
  } else {
    try {
      const collected = await github.collectNotesBetween(repo, old, neu);
      entry.notes = collected.notes;
      entry.missing = collected.missing;
      entry.compare_url = collected.compare_url;
    } catch (e) {
      githubWarning(`${packageName}: ${/** @type {Error} */ (e).message}`);
      entry.missing = true;
      entry.compare_url = `https://github.com/${repo}/compare/v${old}...v${neu}`;
    }
  }
  enriched.push(entry);
}

const lts = args.lts === true || args.lts === 'true';
const generator = new ReleaseNotes();
const markdown = generator.generate(
  platformVersion,
  /** @type {any} */ (enriched),
  sourceRelease && sourceRelease !== 'true' ? sourceRelease : null,
  { lts },
);

writeFileSync(output, `${markdown}\n`);
if (args['summary-output'] && args['summary-output'] !== 'true') {
  writeFileSync(args['summary-output'], `${generator.summaryTable(/** @type {any} */ (enriched))}\n`);
}

writeGithubOutput({ notes_file: output, changed_count: String(enriched.length) });
out(`Wrote release notes to ${output} (${enriched.length} packages).`);
