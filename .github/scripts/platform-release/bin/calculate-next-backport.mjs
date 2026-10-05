#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { parseArgs, requireArg, writeGithubOutput, out, githubError } from '../lib/cli.js';
import * as PlatformVersion from '../lib/platform-version.js';

const args = parseArgs(process.argv);
const tagPrefix =
  args['tag-prefix'] ?? process.env.PLATFORM_TAG_PREFIX ?? '';
let sourceInput = requireArg(args, 'source-release').trim();
const stripped = PlatformVersion.stripTagPrefix(sourceInput, tagPrefix);
if (stripped && PlatformVersion.isAnyRelease(stripped)) {
  sourceInput = stripped;
}

/** @type {string[]} */
let tags = [];
if (args['tags-file'] && existsSync(args['tags-file'])) {
  tags = readFileSync(args['tags-file'], 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
} else if (!process.stdin.isTTY) {
  const stdin = readFileSync(0, 'utf8');
  tags = stdin.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

try {
  const bareTags = PlatformVersion.bareTagsFromList(tags, tagPrefix);
  // Prefer YYYY.MM; always branch from the latest tag on that monthly line.
  const sourceRelease = PlatformVersion.resolveBackportSource(sourceInput, bareTags);
  const next = PlatformVersion.nextBackportVersion(sourceRelease, bareTags);
  const branch = PlatformVersion.backportBranch(next);
  const sourceTag = PlatformVersion.formatTag(sourceRelease, tagPrefix);
  const backportTag = PlatformVersion.formatTag(next, tagPrefix);
  const markLatest = PlatformVersion.shouldMarkAsLatestRelease(next, bareTags);
  writeGithubOutput({
    source_input: sourceInput,
    source_release: sourceTag,
    backport_version: backportTag,
    backport_branch: branch,
    monthly_base: PlatformVersion.monthlyBase(sourceRelease),
    mark_as_latest: markLatest ? 'true' : 'false',
  });
  out(
    `Backport source ${sourceInput} → latest ${sourceTag}; next ${backportTag} (branch ${branch}; latest=${markLatest})`,
  );
} catch (e) {
  githubError(/** @type {Error} */ (e).message);
  process.exit(1);
}
