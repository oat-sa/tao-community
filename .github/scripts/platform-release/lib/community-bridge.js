import * as SemVer from './semver.js';
import * as PlatformVersion from './platform-version.js';
import { ComposerPackages } from './composer-packages.js';

export const COMMUNITY_PACKAGE = 'oat-sa/tao-community';
export const COMMUNITY_REPO = 'oat-sa/tao-community';

/**
 * @typedef {{package: string, version: string}} PackageUpdate
 * @typedef {{
 *   ref: string,
 *   constraint: string,
 *   mode: 'release-tag'|'dev-branch',
 *   monthly: string,
 * }} CommunityBridgeTarget
 * @typedef {{
 *   composerUpdates: Record<string, string>,
 *   transientComposerUpdates: Record<string, string>,
 *   composerUpdatePackages: string[],
 *   changes: Array<{package: string, old: string, new: string, via?: string}>,
 *   communityVersion: string|null,
 *   communityTarget: CommunityBridgeTarget|null,
 *   composerUpdateWithAllDependencies: boolean,
 * }} BridgeResult
 */

/**
 * Narrow `composer update` package list: community + requested nested/direct packages only.
 *
 * @param {Set<string>} updatePkgs
 * @param {Record<string, string>} composerUpdates
 * @param {CommunityBridgeTarget|null} communityTarget
 * @param {Record<string, string>} rootRequire
 * @param {PackageUpdate[]} nested
 * @param {Record<string, string>} [_communityRequire]
 */
export function finalizeComposerUpdatePlan(
  updatePkgs,
  composerUpdates,
  communityTarget,
  rootRequire,
  nested,
  _communityRequire = {},
) {
  /** @type {Set<string>} */
  const pkgs = new Set(updatePkgs);

  for (const pkg of Object.keys(composerUpdates)) {
    pkgs.add(pkg);
  }

  const nestedOnly = nested.filter((item) => !(item.package in rootRequire));
  for (const item of nestedOnly) {
    pkgs.add(item.package);
  }

  let withAllDependencies = false;
  if (communityTarget?.mode === 'dev-branch' && nestedOnly.length) {
    pkgs.add(COMMUNITY_PACKAGE);
    withAllDependencies = true;
  }

  return {
    packages: [...pkgs].sort((a, b) => {
      if (a === COMMUNITY_PACKAGE) return -1;
      if (b === COMMUNITY_PACKAGE) return 1;
      return a.localeCompare(b);
    }),
    withAllDependencies,
  };
}

/**
 * Parse a tao-community pin from composer.json or selective-update input.
 * Accepts platform release tags (YYYY.MM / YYYY.MM.N) and RC dev aliases
 * (dev-release-YYYY-MM → release-YYYY-MM branch on tao-community).
 *
 * @param {string} input
 * @returns {CommunityBridgeTarget|null}
 */
export function parseCommunityTarget(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;

  const monthlyFromDev = PlatformVersion.monthlyFromDevReleaseConstraint(s);
  if (monthlyFromDev) {
    return {
      ref: PlatformVersion.rcBranchFromMonthly(monthlyFromDev),
      constraint: s,
      mode: 'dev-branch',
      monthly: monthlyFromDev,
    };
  }

  if (PlatformVersion.isAnyRelease(s)) {
    return {
      ref: s,
      constraint: s,
      mode: 'release-tag',
      monthly: PlatformVersion.monthlyBase(s),
    };
  }

  return null;
}

/**
 * Pick which tao-community ref to bridge through.
 * Explicit `oat-sa/tao-community=…` in the request wins; otherwise latest release
 * tag on the monthly line, or the RC branch when root composer.json uses dev-release.
 *
 * @param {PackageUpdate[]} requested
 * @param {string} sourceMonthly
 * @param {Record<string, string>} rootRequire
 * @param {string[]} communityTags bare community tags
 * @returns {CommunityBridgeTarget}
 */
export function pickCommunityBridgeTarget(
  requested,
  sourceMonthly,
  rootRequire,
  communityTags,
) {
  const line = PlatformVersion.monthlyBase(sourceMonthly);
  const explicit = requested.find((r) => r.package === COMMUNITY_PACKAGE);

  /** @type {CommunityBridgeTarget} */
  let target;
  if (explicit) {
    const parsed = parseCommunityTarget(explicit.version);
    if (!parsed) {
      throw new Error(`Invalid ${COMMUNITY_PACKAGE} version: ${explicit.version}`);
    }
    target = parsed;
  } else {
    const fromRoot = parseCommunityTarget(rootRequire[COMMUNITY_PACKAGE]);
    if (fromRoot?.mode === 'dev-branch') {
      target = fromRoot;
    } else {
      const tag = PlatformVersion.latestReleaseForMonth(sourceMonthly, communityTags);
      const parsed = parseCommunityTarget(tag);
      if (!parsed) {
        throw new Error(`Invalid ${COMMUNITY_PACKAGE} tag: ${tag}`);
      }
      target = parsed;
    }
  }

  if (PlatformVersion.monthlyBase(target.monthly) !== line) {
    const label = explicit ? explicit.version : target.ref;
    throw new Error(
      `${COMMUNITY_PACKAGE} ${label} is not on monthly line ${line} (backport source)`,
    );
  }

  if (
    target.mode === 'release-tag' &&
    communityTags.length > 0 &&
    !communityTags.map((t) => t.trim()).includes(target.ref)
  ) {
    throw new Error(`${COMMUNITY_PACKAGE} tag ${target.ref} not found on ${COMMUNITY_REPO}`);
  }

  return target;
}

/**
 * @deprecated Use pickCommunityBridgeTarget — kept for callers that only need a tag ref.
 * @param {PackageUpdate[]} requested
 * @param {string} sourceMonthly
 * @param {string[]} communityTags
 * @returns {string}
 */
export function pickCommunityBridgeVersion(requested, sourceMonthly, communityTags) {
  return pickCommunityBridgeTarget(requested, sourceMonthly, {}, communityTags).ref;
}

/**
 * Whether this request should resolve via tao-community (bump and/or nested verify).
 *
 * @param {Record<string, string>} rootRequire
 * @param {PackageUpdate[]} requested
 */
export function needsCommunityBridge(rootRequire, requested) {
  if (!(COMMUNITY_PACKAGE in rootRequire)) return false;
  return requested.some(
    (r) => r.package === COMMUNITY_PACKAGE || !(r.package in rootRequire),
  );
}

/**
 * Managed require diffs between two community composer require maps.
 *
 * @param {Record<string, string>} previousRequire
 * @param {Record<string, string>} nextRequire
 * @returns {Array<{package: string, old: string|null, new: string|null}>}
 */
export function diffCommunityRequires(previousRequire, nextRequire) {
  const packages = new ComposerPackages();
  return packages.diffManaged({ require: previousRequire }, { require: nextRequire });
}

/**
 * Resolve backport package updates against root composer.json.
 *
 * - Direct root requires (except tao-community) are applied as-is.
 * - Nested packages and/or an explicit tao-community bump: pick community ref,
 *   verify nested pins, bump root tao-community when the constraint changes, and
 *   when previous+next community requires are provided, expand every managed package
 *   that changed inside community into the narrow `composer update` set and changelog.
 *
 * @param {object} opts
 * @param {Record<string, string>} opts.rootRequire root composer.json require map
 * @param {PackageUpdate[]} opts.requested
 * @param {string} opts.sourceMonthly bare YYYY.MM (or YYYY.MM.N; base is used)
 * @param {string[]} opts.communityTags bare community platform tags
 * @param {Record<string, string>} opts.communityRequire require map from the chosen community composer.json
 * @param {Record<string, string>|null} [opts.previousCommunityRequire] require map from currently pinned community
 * @param {Record<string, string>} [opts.lockedVersions] normalized versions from composer.lock for report old values
 * @returns {BridgeResult}
 */
export function resolveBackportUpdates({
  rootRequire,
  requested,
  sourceMonthly,
  communityTags,
  communityRequire,
  previousCommunityRequire = null,
  lockedVersions = {},
}) {
  if (!requested.length) {
    throw new Error('No package updates provided');
  }

  /** @type {PackageUpdate[]} */
  const direct = [];
  /** @type {PackageUpdate[]} */
  const nested = [];
  for (const item of requested) {
    if (item.package in rootRequire) direct.push(item);
    else nested.push(item);
  }

  /** @type {Record<string, string>} */
  const composerUpdates = {};
  /** @type {Array<{package: string, old: string, new: string, via?: string}>} */
  const changes = [];
  /** @type {Set<string>} */
  const updatePkgs = new Set();

  for (const item of direct) {
    if (item.package === COMMUNITY_PACKAGE) continue;
    composerUpdates[item.package] = item.version;
    changes.push({
      package: item.package,
      old: rootRequire[item.package],
      new: item.version,
    });
    updatePkgs.add(item.package);
  }

  if (nested.length && !(COMMUNITY_PACKAGE in rootRequire)) {
    const missing = nested.map((n) => n.package).join(', ');
    throw new Error(
      `Package(s) not in composer.json (${missing}) and ${COMMUNITY_PACKAGE} is not a root require`,
    );
  }

  /** @type {CommunityBridgeTarget|null} */
  let communityTarget = null;
  if (needsCommunityBridge(rootRequire, requested)) {
    communityTarget = pickCommunityBridgeTarget(
      requested,
      sourceMonthly,
      rootRequire,
      communityTags,
    );
    const label = requested.some((r) => r.package === COMMUNITY_PACKAGE)
      ? COMMUNITY_PACKAGE
      : `Latest ${COMMUNITY_PACKAGE}`;
    const via = `${COMMUNITY_PACKAGE}@${communityTarget.ref}`;

    for (const item of nested) {
      if (!(item.package in communityRequire)) {
        throw new Error(`${label} ${communityTarget.ref} does not require ${item.package}`);
      }
      const pinned = SemVer.normalize(String(communityRequire[item.package]));
      const want = SemVer.normalize(item.version);
      if (pinned !== want && communityTarget.mode !== 'dev-branch') {
        throw new Error(
          `${label} ${communityTarget.ref} pins ${item.package}=${pinned}, requested ${want}`,
        );
      }
    }

    if (previousCommunityRequire && Object.keys(communityRequire).length) {
      for (const d of diffCommunityRequires(previousCommunityRequire, communityRequire)) {
        if (!d.new) continue;
        const next = SemVer.normalize(String(d.new));
        const old = d.old != null ? SemVer.normalize(String(d.old)) : '(none)';
        if (old === next) continue;
        changes.push({
          package: d.package,
          old,
          new: next,
          via,
        });
        updatePkgs.add(d.package);
        // Ami usually only pins community; when a nested package is also a root
        // require, keep composer.json in sync with the community bump.
        if (d.package in rootRequire) {
          composerUpdates[d.package] = next;
        }
      }
    } else {
      for (const item of nested) {
        const pinned = SemVer.normalize(String(communityRequire[item.package]));
        const want = SemVer.normalize(item.version);
        changes.push({
          package: item.package,
          old: pinned,
          new: want,
          via,
        });
        updatePkgs.add(item.package);
      }
    }

    // Nested requests not present in the community diff (same pin old→new) still
    // need a narrow composer update. On dev-release RC, always record selective
    // overrides even when previousCommunityRequire is set (same branch ref).
    for (const item of nested) {
      if (changes.some((c) => c.package === item.package)) continue;
      updatePkgs.add(item.package);
      if (previousCommunityRequire && communityTarget.mode !== 'dev-branch') continue;
      const pinned = SemVer.normalize(String(communityRequire[item.package]));
      changes.push({
        package: item.package,
        old: pinned,
        new: SemVer.normalize(item.version),
        via,
      });
    }

    const rootCommunity = String(rootRequire[COMMUNITY_PACKAGE]);
    const constraintChanges = communityTarget.constraint !== rootCommunity;
    const shouldUpdateCommunityConstraint =
      communityTarget.mode === 'release-tag' || constraintChanges;

    if (shouldUpdateCommunityConstraint) {
      composerUpdates[COMMUNITY_PACKAGE] = communityTarget.constraint;
      const existing = changes.find((c) => c.package === COMMUNITY_PACKAGE);
      if (existing) {
        existing.old = rootCommunity;
        existing.new = communityTarget.constraint;
        delete existing.via;
      } else {
        changes.unshift({
          package: COMMUNITY_PACKAGE,
          old: rootCommunity,
          new: communityTarget.constraint,
        });
      }
      updatePkgs.add(COMMUNITY_PACKAGE);
    } else if (communityTarget.mode === 'dev-branch' && updatePkgs.size > 0) {
      // Constraint stays dev-release-* but lock must re-resolve RC branch HEAD.
      updatePkgs.add(COMMUNITY_PACKAGE);
    }

    // Root pins already in composer.json (require or require-dev).
    for (const item of requested) {
      if (item.package === COMMUNITY_PACKAGE) continue;
      if (!(item.package in rootRequire)) continue;
      const current = SemVer.normalize(String(rootRequire[item.package]));
      const want = SemVer.normalize(item.version);
      if (current === want) continue;
      composerUpdates[item.package] = item.version;
      updatePkgs.add(item.package);
      if (!changes.some((c) => c.package === item.package && c.new === item.version)) {
        changes.push({
          package: item.package,
          old: rootRequire[item.package],
          new: item.version,
          via,
        });
      }
    }
  }

  /** @type {Record<string, string>} */
  const transientComposerUpdates = {};
  for (const item of nested) {
    if (item.package in rootRequire) continue;
    transientComposerUpdates[item.package] = item.version;
  }

  const plan = finalizeComposerUpdatePlan(
    updatePkgs,
    composerUpdates,
    communityTarget,
    rootRequire,
    nested,
    communityRequire,
  );

  return {
    composerUpdates,
    transientComposerUpdates,
    composerUpdatePackages: plan.packages,
    composerUpdateWithAllDependencies: plan.withAllDependencies,
    changes: applyLockedReportChanges(changes, lockedVersions),
    communityVersion: communityTarget?.ref ?? null,
    communityTarget,
  };
}

/**
 * Prefer composer.lock versions for changelog old values; drop no-op rows.
 *
 * @param {Array<{package: string, old: string, new: string, via?: string}>} changes
 * @param {Record<string, string>} [lockedVersions]
 */
export function applyLockedReportChanges(changes, lockedVersions = {}) {
  if (!Object.keys(lockedVersions).length) return changes;
  return changes
    .map((c) => ({
      ...c,
      old: lockedVersions[c.package] ?? (c.old === c.new ? '(none)' : c.old),
    }))
    .filter((c) => c.old !== c.new);
}
