#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { parseArgs, writeGithubOutput, out, githubError } from '../lib/cli.js';
import * as PlatformVersion from '../lib/platform-version.js';

const args = parseArgs(process.argv);
const tagPrefix =
  args['tag-prefix'] ?? process.env.PLATFORM_TAG_PREFIX ?? '';
/** @type {string[]} */
let tags = [];

if (args['tags-file'] && existsSync(args['tags-file'])) {
  tags = readFileSync(args['tags-file'], 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
} else if (args.tags && args.tags !== 'true') {
  tags = args.tags.split(/[\s,]+/).map((l) => l.trim()).filter(Boolean);
} else if (!process.stdin.isTTY) {
  const stdin = readFileSync(0, 'utf8');
  tags = stdin.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

const bareTags = PlatformVersion.bareTagsFromList(tags, tagPrefix);
const latestMonthly = PlatformVersion.latestMonthlyRelease(bareTags);
const input = args['release-month'] ?? args.branch ?? '';
const releaseMonth = input === 'true' ? '' : input;

try {
  const branch = PlatformVersion.resolveRcBranchInput(releaseMonth, latestMonthly);
  const monthly = PlatformVersion.monthlyFromRcBranch(branch);
  const lts = PlatformVersion.resolveLts({
    lts: args.lts,
    releaseMonth,
    monthly,
  });
  // Git tags never carry -lts; LTS is keywords + release description only.
  const platformTag = PlatformVersion.formatTag(monthly, tagPrefix);
  writeGithubOutput({
    rc_branch: branch,
    platform_version: platformTag,
    monthly,
    lts: lts ? 'true' : 'false',
    latest_monthly: latestMonthly ? PlatformVersion.formatTag(latestMonthly, tagPrefix) : '',
  });
  out(`Next RC branch: ${branch} (platform ${platformTag}${lts ? ' [LTS]' : ''})`);
  if (latestMonthly) {
    out(`Based on latest monthly release: ${PlatformVersion.formatTag(latestMonthly, tagPrefix)}`);
  } else {
    out('No platform tags found; defaulted RC to current UTC month (override with --release-month).');
  }
} catch (e) {
  githubError(/** @type {Error} */ (e).message);
  process.exit(1);
}
