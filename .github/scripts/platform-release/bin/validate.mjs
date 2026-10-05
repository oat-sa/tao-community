#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { parseArgs, requireArg, writeGithubOutput, out, githubError } from '../lib/cli.js';
import { ComposerPackages } from '../lib/composer-packages.js';
import * as PlatformVersion from '../lib/platform-version.js';
import * as SemVer from '../lib/semver.js';

const args = parseArgs(process.argv);
const check = requireArg(args, 'check');

switch (check) {
  case 'rc-branch': {
    const branch = requireArg(args, 'branch');
    const tagPrefix =
      args['tag-prefix'] ?? process.env.PLATFORM_TAG_PREFIX ?? '';
    if (!PlatformVersion.isRcBranch(branch)) {
      githubError(`Invalid RC branch name: ${branch} (expected release-YYYY-MM)`);
      process.exit(1);
    }
    const monthly = PlatformVersion.monthlyFromRcBranch(branch);
    writeGithubOutput({
      valid: 'true',
      platform_version: PlatformVersion.formatTag(monthly, tagPrefix),
      rc_branch: branch,
    });
    out(`Valid RC branch ${branch} -> ${PlatformVersion.formatTag(monthly, tagPrefix)}`);
    break;
  }
  case 'platform-version': {
    const tagPrefix =
      args['tag-prefix'] ?? process.env.PLATFORM_TAG_PREFIX ?? '';
    let version = requireArg(args, 'version').trim();
    const stripped = PlatformVersion.stripTagPrefix(version, tagPrefix);
    if (stripped && PlatformVersion.isAnyRelease(stripped)) {
      version = stripped;
    }
    if (!PlatformVersion.isAnyRelease(version)) {
      githubError(`Invalid platform release version: ${version}`);
      process.exit(1);
    }
    if (/^\d{4}\.\d{2}\.0$/.test(version)) {
      githubError('Do not use YYYY.MM.0 — the first monthly release is YYYY.MM');
      process.exit(1);
    }
    writeGithubOutput({
      valid: 'true',
      version,
      monthly_base: PlatformVersion.monthlyBase(version),
      is_monthly: PlatformVersion.isMonthly(version) ? 'true' : 'false',
    });
    break;
  }
  case 'tag-matches-rc': {
    const branch = requireArg(args, 'branch');
    const tag = requireArg(args, 'tag');
    const tagPrefix =
      args['tag-prefix'] ?? process.env.PLATFORM_TAG_PREFIX ?? '';
    if (!PlatformVersion.isRcBranch(branch)) {
      githubError(`Invalid RC branch name: ${branch}`);
      process.exit(1);
    }
    const monthly = PlatformVersion.monthlyFromRcBranch(branch);
    const bare = PlatformVersion.stripTagPrefix(tag, tagPrefix) ?? tag;
    if (!PlatformVersion.isAnyRelease(bare) || PlatformVersion.backportNumber(bare) != null) {
      githubError(
        `Tag ${tag} is not a monthly platform release for branch ${branch} (got bare ${bare})`,
      );
      process.exit(1);
    }
    if (PlatformVersion.monthlyBase(bare) !== monthly) {
      const expected = PlatformVersion.formatTag(monthly, tagPrefix);
      githubError(
        `Tag ${tag} does not match release branch ${branch} (expected ${expected})`,
      );
      process.exit(1);
    }
    writeGithubOutput({
      valid: 'true',
      tag,
    });
    out(`Tag ${tag} matches branch ${branch}`);
    break;
  }
  case 'locked-versions': {
    const lock = args['composer-lock'] ?? 'composer.lock';
    const composerJson = args['composer-json'] ?? 'composer.json';
    const expectedFile = args['expected-json'] ?? '';
    const packages = new ComposerPackages();
    const locked = packages.lockedVersions(lock);
    const composer = packages.read(composerJson);
    const managed = packages.managedRequire(composer);
    /** @type {string[]} */
    const failures = [];

    for (const [name, constraint] of Object.entries(managed)) {
      if (!(name in locked)) {
        failures.push(`${name} missing from composer.lock`);
        continue;
      }
      if (SemVer.isVersion(constraint) && !String(constraint).includes('*') && !/^[~^]/.test(constraint.trim())) {
        if (SemVer.normalize(constraint) !== SemVer.normalize(locked[name])) {
          failures.push(`${name} locked as ${locked[name]} but composer.json requires ${constraint}`);
        }
      }
    }

    if (expectedFile && expectedFile !== 'true' && existsSync(expectedFile)) {
      const expected = JSON.parse(readFileSync(expectedFile, 'utf8'));
      for (const [name, version] of Object.entries(expected)) {
        if (typeof name !== 'string' || typeof version !== 'string') continue;
        if (!(name in locked) || SemVer.normalize(locked[name]) !== SemVer.normalize(version)) {
          failures.push(`Expected locked ${name}=${version}, got ${locked[name] ?? '(missing)'}`);
        }
      }
    }

    if (failures.length) {
      for (const failure of failures) githubError(failure);
      process.exit(1);
    }
    out('composer.lock versions validated.');
    writeGithubOutput({ valid: 'true' });
    break;
  }
  case 'previous-release': {
    let target = requireArg(args, 'target');
    const tagPrefix =
      args['tag-prefix'] ?? process.env.PLATFORM_TAG_PREFIX ?? '';
    /** @type {string[]} */
    let tags = [];
    if (args['tags-file'] && existsSync(args['tags-file'])) {
      tags = readFileSync(args['tags-file'], 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    } else if (!process.stdin.isTTY) {
      tags = readFileSync(0, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    }
    const bareTags = PlatformVersion.bareTagsFromList(tags, tagPrefix);
    // Allow bare YYYY.MM, prefixed tag, or RC branch as target.
    const strippedTarget = PlatformVersion.stripTagPrefix(target, tagPrefix);
    if (strippedTarget && PlatformVersion.isMonthly(strippedTarget)) {
      target = strippedTarget;
    } else if (!PlatformVersion.isMonthly(target) && PlatformVersion.isRcBranch(target)) {
      target = PlatformVersion.monthlyFromRcBranch(target);
    }
    if (!PlatformVersion.isMonthly(target)) {
      githubError(`Target must be monthly YYYY.MM: ${target}`);
      process.exit(1);
    }
    const previous = PlatformVersion.previousReleaseBefore(target, bareTags);
    if (!previous) {
      githubError(`No matching previous release found before ${target}`);
      process.exit(1);
    }
    const previousTag = PlatformVersion.formatTag(previous, tagPrefix);
    const targetTag = PlatformVersion.formatTag(target, tagPrefix);
    writeGithubOutput({ previous_release: previousTag, target: targetTag });
    out(`Previous release before ${targetTag}: ${previousTag}`);
    break;
  }
  case 'latest-rc-branch': {
    /** @type {string[]} */
    let branches = [];
    if (args['branches-file'] && existsSync(args['branches-file'])) {
      branches = readFileSync(args['branches-file'], 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    } else if (!process.stdin.isTTY) {
      branches = readFileSync(0, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    }
    const override = args.branch ?? '';
    let latest;
    if (override && override !== 'true') {
      // Standard monthly RC, or an existing branch (e.g. ami long-lived `rc`).
      if (PlatformVersion.isRcBranch(override)) {
        latest = override;
      } else if (branches.includes(override)) {
        latest = override;
      } else {
        githubError(
          `Invalid RC branch override: ${override} (expected release-YYYY-MM or an existing branch)`,
        );
        process.exit(1);
      }
    } else {
      latest = PlatformVersion.latestRcBranch(branches);
      if (!latest) {
        githubError('No RC branch (release-YYYY-MM) found');
        process.exit(1);
      }
    }
    {
      const tagPrefix =
        args['tag-prefix'] ?? process.env.PLATFORM_TAG_PREFIX ?? '';
      /** @type {Record<string, string>} */
      const outputs = { rc_branch: latest };
      if (PlatformVersion.isRcBranch(latest)) {
        const monthly = PlatformVersion.monthlyFromRcBranch(latest);
        outputs.monthly_base = monthly;
        outputs.platform_version = PlatformVersion.formatTag(monthly, tagPrefix);
      } else {
        outputs.monthly_base = '';
        outputs.platform_version = '';
      }
      writeGithubOutput(outputs);
    }
    out(`Using RC branch: ${latest}`);
    break;
  }
  default:
    githubError(`Unknown --check value: ${check}`);
    process.exit(1);
}
