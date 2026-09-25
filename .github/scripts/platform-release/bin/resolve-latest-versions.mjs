#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs, writeGithubOutput, out, githubError } from '../lib/cli.js';
import { ComposerPackages } from '../lib/composer-packages.js';
import * as SemVer from '../lib/semver.js';
import { VersionResolver } from '../lib/version-resolver.js';

const args = parseArgs(process.argv);
const path = args['composer-json'] ?? 'composer.json';
const cwd = args['working-directory'] ?? (dirname(path) || '.');
/** @type {string[]} */
let only = [];
if (args.packages && args.packages !== 'true' && args.packages.trim()) {
  only = args.packages.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

const packages = new ComposerPackages();
const composer = packages.read(path);
let managed = packages.managedRequire(composer);

if (only.length) {
  /** @type {Record<string, string>} */
  const filtered = {};
  for (const name of only) {
    if (!(name in managed)) {
      githubError(`Package is not a managed require dependency: ${name}`);
      process.exit(1);
    }
    filtered[name] = managed[name];
  }
  managed = filtered;
}

const resolver = new VersionResolver();
/** @type {Record<string, string>} */
const resolved = {};
/** @type {Record<string, {old: string, new: string}>} */
const changed = {};

for (const [name, constraint] of Object.entries(managed)) {
  let latest;
  try {
    latest = await resolver.latestStable(name, cwd, composer);
  } catch (e) {
    githubError(/** @type {Error} */ (e).message);
    process.exit(1);
  }
  resolved[name] = latest;
  const newConstraint = SemVer.applyConstraintStyle(constraint, latest);
  if (newConstraint !== constraint) {
    changed[name] = { old: constraint, new: latest };
  }
}

const result = { resolved, changed };
const json = `${JSON.stringify(result, null, 4)}\n`;
if (args.output && args.output !== 'true') {
  writeFileSync(args.output, json);
} else {
  out(json.trimEnd());
}

writeGithubOutput({
  changed_count: String(Object.keys(changed).length),
  has_changes: Object.keys(changed).length > 0 ? 'true' : 'false',
});
out(`Resolved latest versions for ${Object.keys(resolved).length} packages; ${Object.keys(changed).length} would change.`);
