/**
 * Platform release version helpers.
 *
 * Monthly: YYYY.MM | Backport: YYYY.MM.N | RC branch: release-YYYY-MM
 * Backport branch: release/backport/release-YYYY-MM-N
 * LTS is recorded in composer keywords (`YYYY.MM LTS`) and release notes — not
 * in git tags. Inputs may still use a `-lts` / `LTS` hint (YYYY.MM-lts).
 *
 * Optional tag_prefix (e.g. "release-") turns git tags into release-YYYY.MM(.N).
 * Calendar logic always uses bare YYYY.MM(.N).
 */

export const MONTHLY_PATTERN = /^(\d{4})\.(\d{2})$/;
export const ANY_RELEASE_PATTERN = /^(\d{4})\.(\d{2})(?:\.(\d+))?(-lts)?$/i;
export const RC_BRANCH_PATTERN = /^release-(\d{4})-(\d{2})$/;
export const BACKPORT_BRANCH_PATTERN = /^release\/backport\/release-(\d{4})-(\d{2})-(\d+)$/;
/** composer.json keywords: YYYY.MM | YYYY.MM LTS | YYYY.MM-lts */
export const PLATFORM_KEYWORD_PATTERN = /^(\d{4})\.(\d{2})(?:\s+LTS|-lts)?$/i;
export const LTS_TAG_SUFFIX = '-lts';

/**
 * @param {string} [prefix]
 * @returns {string}
 */
export function normalizeTagPrefix(prefix = '') {
  return String(prefix ?? '').trim();
}

/**
 * Strip optional tag prefix. When prefix is set, non-matching tags return null.
 * @param {string} tag
 * @param {string} [prefix]
 * @returns {string|null}
 */
export function stripTagPrefix(tag, prefix = '') {
  const t = String(tag ?? '').trim();
  if (!t) return null;
  const p = normalizeTagPrefix(prefix);
  if (!p) return t;
  if (!t.startsWith(p)) return null;
  return t.slice(p.length);
}

/**
 * @param {string} version bare YYYY.MM(.N)[-lts]
 * @param {string} [prefix]
 */
export function formatTag(version, prefix = '') {
  return `${normalizeTagPrefix(prefix)}${version}`;
}

/**
 * @param {string} version bare YYYY.MM(.N) or with -lts
 * @param {boolean} [lts]
 */
export function withLtsSuffix(version, lts = false) {
  const bare = String(version ?? '').trim();
  if (!lts) return bare.replace(/-lts$/i, '');
  if (/-lts$/i.test(bare)) return bare.replace(/-lts$/i, LTS_TAG_SUFFIX);
  return `${bare}${LTS_TAG_SUFFIX}`;
}

/** @param {string} version */
export function stripLtsSuffix(version) {
  return String(version ?? '').trim().replace(/-lts$/i, '');
}

/** @param {string} version */
export function isLtsVersion(version) {
  return /-lts$/i.test(String(version ?? '').trim());
}

/**
 * Parse a composer keyword that encodes the platform month (optional LTS marker).
 * @param {string} keyword
 * @returns {{ monthly: string, lts: boolean }|null}
 */
export function parsePlatformVersionKeyword(keyword) {
  const s = String(keyword ?? '').trim();
  const m = s.match(PLATFORM_KEYWORD_PATTERN);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return {
    monthly: `${m[1]}.${String(month).padStart(2, '0')}`,
    lts: /lts$/i.test(s),
  };
}

/**
 * @param {string} monthly bare YYYY.MM
 * @param {boolean} [lts]
 */
export function formatMonthlyKeyword(monthly, lts = false) {
  if (!isMonthly(monthly)) {
    throw new Error(`Invalid monthly platform version for keywords: ${monthly}`);
  }
  return lts ? `${monthly} LTS` : monthly;
}

/**
 * LTS cadence: every 3 months (Feb / May / Aug / Nov), matching existing
 * composer keywords like "2026.08 LTS".
 * @param {string} monthly
 */
export function isLtsMonth(monthly) {
  if (!isMonthly(monthly)) return false;
  const month = Number(monthly.slice(5, 7));
  return month === 2 || month === 5 || month === 8 || month === 11;
}

/**
 * Resolve whether a release is LTS from explicit flag, release_month suffix, and
 * quarterly calendar (Feb/May/Aug/Nov) when neither forces a value.
 *
 * @param {{ lts?: boolean|string|null, releaseMonth?: string|null, monthly?: string|null }} opts
 */
export function resolveLts(opts = {}) {
  const rawFlag = opts.lts;
  if (rawFlag === true || rawFlag === 'true' || rawFlag === '1' || rawFlag === 'yes') {
    return true;
  }
  const fromInput = parseReleaseMonthLts(opts.releaseMonth ?? '');
  if (fromInput.lts) return true;
  if (rawFlag === false || rawFlag === 'false' || rawFlag === '0' || rawFlag === 'no') {
    return false;
  }
  const monthly = opts.monthly ?? fromInput.monthly;
  if (monthly && isLtsMonth(monthly)) return true;
  return false;
}

/**
 * @param {string} input
 * @returns {{ value: string, monthly: string|null, lts: boolean }}
 */
export function parseReleaseMonthLts(input) {
  let value = String(input ?? '').trim();
  let lts = false;
  const suffix = value.match(/^(.*?)(?:-lts|\s+lts)$/i);
  if (suffix && suffix[1].trim() !== '') {
    value = suffix[1].trim();
    lts = true;
  }
  let monthly = null;
  if (isRcBranch(value)) monthly = monthlyFromRcBranch(value);
  else {
    const m = value.match(/^(\d{4})[.-](\d{2})$/);
    if (m) {
      const candidate = `${m[1]}.${m[2]}`;
      if (isMonthly(candidate)) monthly = candidate;
    } else if (isMonthly(value)) monthly = value;
  }
  return { value, monthly, lts };
}

/**
 * Map raw git tag names to bare platform versions (invalid / wrong-prefix skipped).
 * @param {string[]} tags
 * @param {string} [prefix]
 * @returns {string[]}
 */
export function bareTagsFromList(tags, prefix = '') {
  /** @type {string[]} */
  const out = [];
  for (const tag of tags) {
    const bare = stripTagPrefix(tag, prefix);
    if (bare == null || !isAnyRelease(bare)) continue;
    out.push(bare);
  }
  return out;
}

export function isMonthly(version) {
  return MONTHLY_PATTERN.test(String(version ?? '').trim());
}

export function isAnyRelease(version) {
  const m = String(version ?? '').trim().match(ANY_RELEASE_PATTERN);
  if (!m) return false;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return false;
  if (m[3] !== undefined && Number(m[3]) < 1) return false;
  return true;
}

export function isRcBranch(branch) {
  const m = branch.match(RC_BRANCH_PATTERN);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

export function isBackportBranch(branch) {
  const m = branch.match(BACKPORT_BRANCH_PATTERN);
  if (!m) return false;
  const month = Number(m[2]);
  const n = Number(m[3]);
  return month >= 1 && month <= 12 && n >= 1;
}

export function monthlyFromRcBranch(branch) {
  const m = branch.match(RC_BRANCH_PATTERN);
  if (!m) throw new Error(`Invalid RC branch name: ${branch}`);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid RC branch month: ${branch}`);
  return `${m[1]}.${String(month).padStart(2, '0')}`;
}

/**
 * Infer YYYY.MM from composer.json when the branch is not release-YYYY-MM
 * (e.g. ami long-lived `rc`). Prefers oat-sa/tao-community `dev-release-YYYY-MM`,
 * then any require constraint matching that form, then a keywords YYYY.MM entry.
 *
 * @param {Record<string, unknown>} composer
 * @returns {string|null}
 */
export function monthlyFromComposer(composer) {
  const require =
    composer?.require && typeof composer.require === 'object'
      ? /** @type {Record<string, string>} */ (composer.require)
      : {};
  const community = require['oat-sa/tao-community'];
  if (community) {
    const fromCommunity = monthlyFromDevReleaseConstraint(community);
    if (fromCommunity) return fromCommunity;
  }
  for (const constraint of Object.values(require)) {
    const fromReq = monthlyFromDevReleaseConstraint(String(constraint));
    if (fromReq) return fromReq;
  }
  if (Array.isArray(composer?.keywords)) {
    for (const kw of composer.keywords) {
      const parsed = parsePlatformVersionKeyword(String(kw));
      if (parsed) return parsed.monthly;
    }
  }
  return null;
}

/** @param {string} constraint */
export function monthlyFromDevReleaseConstraint(constraint) {
  const m = String(constraint)
    .trim()
    .match(/^dev-release-(\d{4})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}.${String(month).padStart(2, '0')}`;
}

/** @param {string} constraint */
export function isDevReleaseConstraint(constraint) {
  return monthlyFromDevReleaseConstraint(constraint) != null;
}

/** @param {string} monthly bare YYYY.MM */
export function devReleaseConstraintFromMonthly(monthly) {
  const m = String(monthly ?? '').trim().match(MONTHLY_PATTERN);
  if (!m) throw new Error(`Invalid monthly platform version: ${monthly}`);
  return `dev-release-${m[1]}-${m[2]}`;
}

/**
 * Git ref on oat-sa/tao-community for a composer dev-release constraint.
 * @param {string} constraint
 * @returns {string|null} e.g. release-2026-10
 */
export function communityRefFromDevRelease(constraint) {
  const monthly = monthlyFromDevReleaseConstraint(constraint);
  if (!monthly) return null;
  return rcBranchFromMonthly(monthly);
}

export function rcBranchFromMonthly(version) {
  const m = version.match(MONTHLY_PATTERN);
  if (!m) throw new Error(`Invalid monthly platform version: ${version}`);
  return `release-${m[1]}-${m[2]}`;
}

export function monthlyBase(version) {
  const m = String(version ?? '').trim().match(ANY_RELEASE_PATTERN);
  if (!m) throw new Error(`Invalid platform release version: ${version}`);
  return `${m[1]}.${m[2]}`;
}

export function backportNumber(version) {
  const m = String(version ?? '').trim().match(ANY_RELEASE_PATTERN);
  if (!m) throw new Error(`Invalid platform release version: ${version}`);
  if (m[3] === undefined) return null;
  return Number(m[3]);
}

export function backportBranch(version) {
  const m = String(version ?? '').trim().match(ANY_RELEASE_PATTERN);
  if (!m || m[3] === undefined) {
    throw new Error(`Expected backport version YYYY.MM.N, got: ${version}`);
  }
  if (Number(m[3]) < 1) throw new Error(`Backport suffix must be >= 1: ${version}`);
  return `release/backport/release-${m[1]}-${m[2]}-${Number(m[3])}`;
}

export function nextMonthly(monthlyVersion) {
  const m = monthlyVersion.match(MONTHLY_PATTERN);
  if (!m) throw new Error(`Invalid monthly platform version: ${monthlyVersion}`);
  let year = Number(m[1]);
  let month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month in version: ${monthlyVersion}`);
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${String(year).padStart(4, '0')}.${String(month).padStart(2, '0')}`;
}

export function nextRcBranch(latestMonthlyRelease) {
  return rcBranchFromMonthly(nextMonthly(latestMonthlyRelease));
}

/** @param {string[]} tags */
export function latestMonthlyRelease(tags) {
  const monthlies = [];
  for (const tag of tags) {
    const t = tag.trim();
    if (!t || !isAnyRelease(t)) continue;
    monthlies.push(monthlyBase(t));
  }
  if (!monthlies.length) return null;
  const unique = [...new Set(monthlies)];
  unique.sort(compare);
  return unique[unique.length - 1];
}

/** @param {string[]} tags */
export function latestAnyRelease(tags) {
  const releases = tags.map((t) => t.trim()).filter((t) => t && isAnyRelease(t));
  if (!releases.length) return null;
  releases.sort(compare);
  return releases[releases.length - 1];
}

/**
 * True when newRelease would become the newest platform tag (GitHub Release "latest").
 * Compare against existing tags only (newRelease is not in the list yet).
 *
 * @param {string} newRelease bare YYYY.MM(.N)
 * @param {string[]} existingTags bare tags
 */
export function shouldMarkAsLatestRelease(newRelease, existingTags) {
  if (!isAnyRelease(newRelease)) {
    throw new Error(`Invalid platform release: ${newRelease}`);
  }
  const current = latestAnyRelease(existingTags);
  if (!current) return true;
  return compare(newRelease, current) > 0;
}

/** @param {string} targetMonthly @param {string[]} tags */
export function previousReleaseBefore(targetMonthly, tags) {
  if (!isMonthly(targetMonthly)) {
    throw new Error(`Target must be monthly YYYY.MM, got: ${targetMonthly}`);
  }
  const candidates = [];
  for (const tag of tags) {
    const t = tag.trim();
    if (!t || !isAnyRelease(t)) continue;
    if (compare(t, targetMonthly) < 0) candidates.push(t);
  }
  if (!candidates.length) return null;
  candidates.sort(compare);
  return candidates[candidates.length - 1];
}

/** @param {string} sourceRelease @param {string[]} existingTags */
export function nextBackportVersion(sourceRelease, existingTags) {
  if (!isAnyRelease(sourceRelease)) {
    throw new Error(`Invalid source release: ${sourceRelease}`);
  }
  const base = monthlyBase(sourceRelease);
  let max = 0;
  for (const tag of existingTags) {
    const t = tag.trim();
    if (!t || !isAnyRelease(t)) continue;
    if (monthlyBase(t) !== base) continue;
    const n = backportNumber(t);
    if (n === null) continue;
    max = Math.max(max, n);
  }
  return `${base}.${max + 1}`;
}

/**
 * Latest platform tag for a given month line (YYYY.MM or any YYYY.MM.N).
 * Example: tags 2026.08, 2026.08.1, 2026.08.9 → 2026.08.9
 *
 * @param {string} monthOrRelease
 * @param {string[]} tags
 */
export function latestReleaseForMonth(monthOrRelease, tags) {
  if (!isAnyRelease(monthOrRelease)) {
    throw new Error(`Invalid platform month/release: ${monthOrRelease}`);
  }
  const base = monthlyBase(monthOrRelease);
  const matches = [];
  for (const tag of tags) {
    const t = tag.trim();
    if (!t || !isAnyRelease(t)) continue;
    if (monthlyBase(t) === base) matches.push(t);
  }
  if (!matches.length) {
    throw new Error(`No platform release tags found for ${base}`);
  }
  matches.sort(compare);
  return matches[matches.length - 1];
}

/**
 * Resolve backport source input to the latest tag on that monthly line.
 * Accepts YYYY.MM (preferred) or YYYY.MM.N (base is used).
 *
 * @param {string} input
 * @param {string[]} tags
 */
export function resolveBackportSource(input, tags) {
  const value = input.trim();
  if (!isAnyRelease(value)) {
    throw new Error(`Invalid source release "${value}". Use YYYY.MM (e.g. 2026.08).`);
  }
  return latestReleaseForMonth(value, tags);
}

/** @param {string} a @param {string} b */
export function compare(a, b) {
  const ma = String(a).trim().match(ANY_RELEASE_PATTERN);
  const mb = String(b).trim().match(ANY_RELEASE_PATTERN);
  if (!ma || !mb) throw new Error(`Cannot compare invalid versions: ${a} vs ${b}`);
  const ya = Number(ma[1]);
  const yb = Number(mb[1]);
  if (ya !== yb) return ya < yb ? -1 : 1;
  const mona = Number(ma[2]);
  const monb = Number(mb[2]);
  if (mona !== monb) return mona < monb ? -1 : 1;
  const na = ma[3] !== undefined ? Number(ma[3]) : 0;
  const nb = mb[3] !== undefined ? Number(mb[3]) : 0;
  if (na !== nb) return na < nb ? -1 : 1;
  // Same calendar version: prefer -lts as the LTS channel marker (equal for ordering).
  const la = ma[4] ? 1 : 0;
  const lb = mb[4] ? 1 : 0;
  return la === lb ? 0 : la < lb ? -1 : 1;
}

/** @param {string[]} branches */
export function latestRcBranch(branches) {
  const rcs = [];
  for (let branch of branches) {
    branch = branch.trim().replace(/^refs\/heads\//, '').replace(/^origin\//, '');
    if (isRcBranch(branch)) rcs.push(branch);
  }
  if (!rcs.length) return null;
  rcs.sort((a, b) => compare(monthlyFromRcBranch(a), monthlyFromRcBranch(b)));
  return rcs[rcs.length - 1];
}

/**
 * @param {string|null|undefined} input
 * @param {string|null|undefined} latestMonthly
 * @param {Date} [now]
 */
export function resolveRcBranchInput(input, latestMonthly, now = new Date()) {
  const parsed = parseReleaseMonthLts(input ?? '');
  const value = parsed.value;
  if (value === '') {
    if (!latestMonthly) {
      // First release on a tag-less repo: use current UTC month as the RC target.
      const monthly = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      return rcBranchFromMonthly(monthly);
    }
    return nextRcBranch(stripLtsSuffix(monthlyBase(latestMonthly)));
  }
  if (isRcBranch(value)) return value;
  const m = value.match(/^(\d{4})[.-](\d{2})$/);
  if (m) {
    const monthly = `${m[1]}.${m[2]}`;
    if (!isMonthly(monthly)) throw new Error(`Invalid release month: ${value}`);
    return rcBranchFromMonthly(monthly);
  }
  throw new Error(
    `Invalid RC input "${input}". Use release-YYYY-MM, YYYY.MM, YYYY-MM, or add -lts / LTS.`,
  );
}

/** Current UTC platform month as YYYY.MM */
export function currentMonthly(now = new Date()) {
  return `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
