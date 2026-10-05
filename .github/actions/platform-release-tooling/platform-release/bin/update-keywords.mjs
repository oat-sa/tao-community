#!/usr/bin/env node
import { parseArgs, writeGithubOutput, out, githubError } from '../lib/cli.js';
import { ComposerPackages } from '../lib/composer-packages.js';
import * as PlatformVersion from '../lib/platform-version.js';

const args = parseArgs(process.argv);
const path = args['composer-json'] ?? 'composer.json';

let monthly = args.monthly && args.monthly !== 'true' ? String(args.monthly).trim() : '';
let releaseMonthHint = '';
if (!monthly && args['rc-branch'] && args['rc-branch'] !== 'true') {
  try {
    monthly = PlatformVersion.monthlyFromRcBranch(String(args['rc-branch']).trim());
  } catch (e) {
    githubError(/** @type {Error} */ (e).message);
    process.exit(1);
  }
}
if (!monthly && args['platform-version'] && args['platform-version'] !== 'true') {
  const raw = String(args['platform-version']).trim();
  const prefix = args['tag-prefix'] ?? process.env.PLATFORM_TAG_PREFIX ?? '';
  const stripped = PlatformVersion.stripTagPrefix(raw, prefix);
  const candidate = stripped ?? raw;
  monthly = PlatformVersion.isMonthly(PlatformVersion.stripLtsSuffix(candidate))
    ? PlatformVersion.monthlyBase(candidate)
    : raw;
  if (PlatformVersion.isLtsVersion(candidate)) {
    releaseMonthHint = `${monthly}-lts`;
  }
}
if (args['release-month'] && args['release-month'] !== 'true') {
  releaseMonthHint = String(args['release-month']).trim();
}

if (!PlatformVersion.isMonthly(monthly)) {
  githubError(`Invalid or missing monthly version for keywords (got: ${monthly || '(empty)'})`);
  process.exit(1);
}

const lts = PlatformVersion.resolveLts({
  lts: args.lts,
  releaseMonth: releaseMonthHint,
  monthly,
});

const packages = new ComposerPackages();
let result;
try {
  result = packages.setMonthlyKeyword(path, monthly, { lts });
} catch (e) {
  githubError(/** @type {Error} */ (e).message);
  process.exit(1);
}

writeGithubOutput({
  changed: result.changed ? 'true' : 'false',
  monthly,
  lts: lts ? 'true' : 'false',
  keyword: result.keyword,
  keywords: result.new.join(','),
});

if (result.changed) {
  out(`Updated keywords: ${JSON.stringify(result.old)} -> ${JSON.stringify(result.new)}`);
} else {
  out(`Keywords already contain ${result.keyword}`);
}
