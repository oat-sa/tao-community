#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs, writeGithubOutput, out, githubError } from '../lib/cli.js';
import { ComposerPackages } from '../lib/composer-packages.js';
import * as SemVer from '../lib/semver.js';
import { VersionResolver } from '../lib/version-resolver.js';
import { parsePackageUpdateLine, splitPackageUpdateText } from '../lib/package-update.js';

const args = parseArgs(process.argv);
const path = args['composer-json'] ?? 'composer.json';
const packages = new ComposerPackages();
const composer = packages.read(path);

/** @type {Record<string, string>} */
const updates = {};

if (args['from-resolved'] && existsSync(args['from-resolved'])) {
  const data = JSON.parse(readFileSync(args['from-resolved'], 'utf8'));
  if (!data?.resolved || typeof data.resolved !== 'object') {
    githubError('Invalid --from-resolved JSON');
    process.exit(1);
  }
  if (args.all && args.all !== 'false') {
    Object.assign(updates, data.resolved);
  } else if (data.changed && typeof data.changed === 'object') {
    for (const [name, pair] of Object.entries(data.changed)) {
      if (pair && typeof pair === 'object' && 'new' in pair) {
        updates[name] = String(/** @type {{new: string}} */ (pair).new);
      } else if (data.resolved[name]) {
        updates[name] = String(data.resolved[name]);
      }
    }
  }
}

let updatesText = '';
if (args['updates-file'] && existsSync(args['updates-file'])) {
  updatesText = readFileSync(args['updates-file'], 'utf8');
} else if (args.updates && args.updates !== 'true') {
  updatesText = args.updates;
}

if (updatesText.trim()) {
  for (const trimmed of splitPackageUpdateText(updatesText)) {
    let parsed;
    try {
      parsed = parsePackageUpdateLine(trimmed);
    } catch (e) {
      githubError(/** @type {Error} */ (e).message);
      process.exit(1);
    }
    updates[parsed.package] = SemVer.normalize(parsed.version);
  }
}

if (!Object.keys(updates).length) {
  out('No updates to apply.');
  writeGithubOutput({ changed_count: '0', has_changes: 'false', packages: '' });
  process.exit(0);
}

const validate = !args['skip-validate'] || args['skip-validate'] === 'false';
if (validate) {
  const resolver = new VersionResolver();
  const cwd = args['working-directory'] ?? (dirname(path) || '.');
  for (const [pkg, ver] of Object.entries(updates)) {
    if (!(await resolver.versionExists(pkg, ver, cwd, composer))) {
      githubError(`Requested package version does not exist: ${pkg}=${ver}`);
      process.exit(1);
    }
  }
}

let result;
try {
  if (args.transient === 'true') {
    result = { changed: packages.applyTransientUpdatesToFile(path, updates) };
  } else {
    result = packages.applyUpdates(composer, updates, true);
  }
} catch (e) {
  githubError(/** @type {Error} */ (e).message);
  process.exit(1);
}

if (args.transient === 'true') {
  if (!Object.keys(result.changed).length) {
    out('composer.json already has transient pins for requested packages.');
    writeGithubOutput({ changed_count: '0', has_changes: 'false', packages: '' });
    process.exit(0);
  }
  writeGithubOutput({
    changed_count: String(Object.keys(result.changed).length),
    has_changes: 'true',
    packages: Object.keys(result.changed).join(','),
  });
  out('Applied transient composer.json pins (lock resolution only):');
  for (const [name, pair] of Object.entries(result.changed)) {
    out(`  ${name}: ${pair.old} -> ${pair.new}`);
  }
  process.exit(0);
}

if (!Object.keys(result.changed).length) {
  out('composer.json already up to date for requested packages.');
  writeGithubOutput({ changed_count: '0', has_changes: 'false', packages: '' });
  process.exit(0);
}

/** @type {Record<string, {old: string, new: string}>} */
let changed;
try {
  changed = packages.applyUpdatesToFile(path, updates, true);
} catch (e) {
  githubError(/** @type {Error} */ (e).message);
  process.exit(1);
}

const changedJson = `${JSON.stringify(changed, null, 4)}\n`;
if (args['changed-output'] && args['changed-output'] !== 'true') {
  writeFileSync(args['changed-output'], changedJson);
}

writeGithubOutput({
  changed_count: String(Object.keys(changed).length),
  has_changes: Object.keys(changed).length > 0 ? 'true' : 'false',
  packages: Object.keys(changed).join(','),
});

out('Updated packages:');
for (const [name, pair] of Object.entries(changed)) {
  out(`  ${name}: ${pair.old} -> ${pair.new}`);
}
