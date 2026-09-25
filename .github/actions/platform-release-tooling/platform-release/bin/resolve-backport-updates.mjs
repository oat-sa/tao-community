#!/usr/bin/env node
/**
 * Resolve backport package updates (direct root requires + optional tao-community bridge).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  parseArgs,
  requireArg,
  writeGithubOutput,
  out,
  githubError,
  appendStepSummary,
} from '../lib/cli.js';
import { ComposerPackages } from '../lib/composer-packages.js';
import { ReleaseNotes } from '../lib/release-notes.js';
import { parsePackageUpdateLine, splitPackageUpdateText } from '../lib/package-update.js';
import {
  COMMUNITY_PACKAGE,
  COMMUNITY_REPO,
  needsCommunityBridge,
  parseCommunityTarget,
  pickCommunityBridgeTarget,
  resolveBackportUpdates,
} from '../lib/community-bridge.js';
import { GithubClient } from '../lib/github-client.js';
import * as PlatformVersion from '../lib/platform-version.js';

const args = parseArgs(process.argv);
const path = args['composer-json'] ?? 'composer.json';
const sourceMonthly = requireArg(args, 'source-monthly');
let updatesText = '';
if (args['updates-file'] && existsSync(args['updates-file'])) {
  updatesText = readFileSync(args['updates-file'], 'utf8');
} else if (args.updates && args.updates !== 'true') {
  updatesText = args.updates;
} else if (!process.stdin.isTTY) {
  updatesText = readFileSync(0, 'utf8');
}

/** @type {Array<{package: string, version: string}>} */
const requested = [];
for (const line of splitPackageUpdateText(updatesText)) {
  try {
    requested.push(parsePackageUpdateLine(line));
  } catch (e) {
    githubError(/** @type {Error} */ (e).message);
    process.exit(1);
  }
}

const packages = new ComposerPackages();
const composer = packages.read(path);
const rootRequire = packages.allRootRequires(composer);

/** @type {string[]} */
let communityTags = [];
/** @type {Record<string, string>} */
let communityRequire = {};
/** @type {Record<string, string>|null} */
let previousCommunityRequire = null;

if (needsCommunityBridge(rootRequire, requested)) {
  const gh = new GithubClient();
  const explicitCommunity = requested.find((r) => r.package === COMMUNITY_PACKAGE);

  // Explicit community pin: skip listing every tag (that burns REST quota).
  // Existence is proven when we successfully fetch composer.json below.
  if (!explicitCommunity) {
    try {
      communityTags = await gh.listTags(COMMUNITY_REPO);
    } catch (e) {
      githubError(`Failed to list ${COMMUNITY_REPO} tags: ${/** @type {Error} */ (e).message}`);
      process.exit(1);
    }
  }

  let target;
  try {
    target = pickCommunityBridgeTarget(requested, sourceMonthly, rootRequire, communityTags);
  } catch (e) {
    githubError(/** @type {Error} */ (e).message);
    process.exit(1);
  }

  const previousTarget = parseCommunityTarget(rootRequire[COMMUNITY_PACKAGE]);
  if (!previousTarget) {
    githubError(
      `Root ${COMMUNITY_PACKAGE} pin "${rootRequire[COMMUNITY_PACKAGE]}" is not a release tag or dev-release constraint; cannot diff community requires`,
    );
    process.exit(1);
  }

  /** @param {string} ref */
  async function loadCommunityRequire(ref) {
    let raw;
    try {
      raw = await gh.getFileAtRef(COMMUNITY_REPO, 'composer.json', ref);
    } catch (e) {
      githubError(
        `Failed to fetch ${COMMUNITY_REPO}@${ref} composer.json: ${/** @type {Error} */ (e).message}`,
      );
      process.exit(1);
    }
    try {
      return packages.allRequire(JSON.parse(raw));
    } catch {
      githubError(`Invalid composer.json JSON from ${COMMUNITY_REPO}@${ref}`);
      process.exit(1);
    }
  }

  communityRequire = await loadCommunityRequire(target.ref);
  if (previousTarget.ref !== target.ref) {
    previousCommunityRequire = await loadCommunityRequire(previousTarget.ref);
  } else {
    previousCommunityRequire = communityRequire;
  }

  const explicit = requested.some((r) => r.package === COMMUNITY_PACKAGE);
  out(
    explicit
      ? `Expanding via requested ${COMMUNITY_PACKAGE} ${previousTarget.ref} → ${target.ref}`
      : target.mode === 'dev-branch'
        ? `Expanding via ${COMMUNITY_PACKAGE} RC branch ${target.ref} on line ${PlatformVersion.monthlyBase(sourceMonthly)}`
        : `Expanding via latest ${COMMUNITY_PACKAGE} ${previousTarget.ref} → ${target.ref} on line ${PlatformVersion.monthlyBase(sourceMonthly)}`,
  );
}

const lockPath = args['composer-lock'] ?? 'composer.lock';
/** @type {Record<string, string>} */
let lockedVersions = {};
if (existsSync(lockPath)) {
  lockedVersions = packages.lockedVersions(lockPath);
}

let result;
try {
  result = resolveBackportUpdates({
    rootRequire,
    requested,
    sourceMonthly,
    communityTags,
    communityRequire,
    previousCommunityRequire,
    lockedVersions,
  });
} catch (e) {
  githubError(/** @type {Error} */ (e).message);
  process.exit(1);
}

const changesOut = args.output ?? 'changes.json';
writeFileSync(changesOut, `${JSON.stringify(result.changes, null, 4)}\n`);

const updatesLines = Object.entries(result.composerUpdates)
  .map(([pkg, ver]) => `${pkg}=${ver}`)
  .join('\n');
if (args['composer-updates-file'] && args['composer-updates-file'] !== 'true') {
  writeFileSync(args['composer-updates-file'], `${updatesLines}\n`);
}

const transientLines = Object.entries(result.transientComposerUpdates ?? {})
  .map(([pkg, ver]) => `${pkg}=${ver}`)
  .join('\n');
if (
  args['transient-composer-updates-file'] &&
  args['transient-composer-updates-file'] !== 'true'
) {
  writeFileSync(args['transient-composer-updates-file'], `${transientLines}\n`);
}

if (args['update-packages-file'] && args['update-packages-file'] !== 'true') {
  writeFileSync(args['update-packages-file'], `${result.composerUpdatePackages.join('\n')}\n`);
}

if (
  args['composer-update-flags-file'] &&
  args['composer-update-flags-file'] !== 'true' &&
  result.composerUpdateWithAllDependencies
) {
  writeFileSync(args['composer-update-flags-file'], '--with-all-dependencies\n');
}

/** @type {Record<string, string>} */
const expected = { ...result.composerUpdates, ...(result.transientComposerUpdates ?? {}) };
for (const change of result.changes) {
  if (change.new && change.new !== '(none)') {
    expected[change.package] = change.new;
  }
}
for (const item of requested) {
  if (item.package === COMMUNITY_PACKAGE) {
    const parsed = parseCommunityTarget(item.version);
    // dev-release is a composer constraint, not a locked package version.
    if (parsed?.mode === 'dev-branch') continue;
  }
  expected[item.package] = item.version;
}
if (args['expected-lock-file'] && args['expected-lock-file'] !== 'true') {
  writeFileSync(args['expected-lock-file'], `${JSON.stringify(expected, null, 4)}\n`);
}

appendStepSummary(
  `## Requested backport updates\n\n${new ReleaseNotes().summaryTable(
    result.changes.map((c) => ({
      package: c.via ? `${c.package} (via community)` : c.package,
      old: c.old,
      new: c.new,
    })),
  )}`,
);

writeGithubOutput({
  changed_count: String(result.changes.length),
  packages: result.composerUpdatePackages.join(','),
  community_version: result.communityVersion ?? '',
  composer_update_with_all_dependencies: result.composerUpdateWithAllDependencies
    ? 'true'
    : 'false',
  composer_json_changed: Object.keys(result.composerUpdates).length > 0 ? 'true' : 'false',
});
out(
  `Resolved ${result.changes.length} change(s); composer update: ${result.composerUpdatePackages.join(' ')}`,
);
