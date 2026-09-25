/**
 * Semantic version helpers for extension package versions.
 * Supports 3- and 4-segment versions used by TAO (e.g. 19.1.2.2) and custom
 * post-release hotfixes like 50.8.1.1-patch3.
 */

export function normalize(version) {
  let v = version.trim();
  if (v.startsWith('v') || v.startsWith('V')) v = v.slice(1);
  return v;
}

/**
 * @param {string} version
 * @returns {{ core: string, parts: number[], suffix: string|null }|null}
 */
export function parse(version) {
  const v = normalize(version);
  const m = v.match(/^(\d+(?:\.\d+){1,3})(?:-([A-Za-z0-9.]+))?$/);
  if (!m) return null;
  return {
    core: m[1],
    parts: m[1].split('.').map((n) => Number(n)),
    suffix: m[2] ?? null,
  };
}

export function isVersion(version) {
  return parse(version) != null;
}

export function isStable(version) {
  const parsed = parse(version);
  return Boolean(parsed && parsed.suffix == null);
}

/**
 * Order: other-prereleases < bare release < -patchN (numeric) < other suffixes.
 * So 1.2.3 < 1.2.3-patch1 < 1.2.3-patch2 < 1.2.4.
 *
 * @param {string} a
 * @param {string} b
 */
export function compare(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) {
    throw new Error(`Invalid semantic version: ${pa ? b : a}`);
  }
  const len = Math.max(pa.parts.length, pb.parts.length);
  for (let i = 0; i < len; i++) {
    const va = pa.parts[i] ?? 0;
    const vb = pb.parts[i] ?? 0;
    if (va !== vb) return va < vb ? -1 : 1;
  }
  return compareSuffix(pa.suffix, pb.suffix);
}

/**
 * @param {string|null} a
 * @param {string|null} b
 */
function compareSuffix(a, b) {
  if (a === b) return 0;
  const ra = suffixRank(a);
  const rb = suffixRank(b);
  if (ra.kind !== rb.kind) return ra.kind < rb.kind ? -1 : 1;
  if (ra.kind === 1) return ra.n < rb.n ? -1 : ra.n > rb.n ? 1 : 0;
  if (ra.label === rb.label) return 0;
  return ra.label < rb.label ? -1 : 1;
}

/**
 * kind: -1 = unknown/prerelease suffix, 0 = bare release, 1 = -patchN
 * @param {string|null} suffix
 */
function suffixRank(suffix) {
  if (suffix == null) return { kind: 0, n: 0, label: '' };
  const patch = suffix.match(/^patch(\d+)$/i);
  if (patch) return { kind: 1, n: Number(patch[1]), label: suffix.toLowerCase() };
  return { kind: -1, n: 0, label: suffix.toLowerCase() };
}

/** @param {string[]} versions */
export function latestStable(versions) {
  const stable = [];
  for (const version of versions) {
    const normalized = normalize(version);
    if (isStable(normalized)) stable.push(normalized);
  }
  if (!stable.length) return null;
  stable.sort(compare);
  return stable[stable.length - 1];
}

/**
 * Preserve constraint style when writing a new version into composer.json.
 * @param {string} existingConstraint
 * @param {string} newVersion
 */
export function applyConstraintStyle(existingConstraint, newVersion) {
  const existing = existingConstraint.trim();
  const next = normalize(newVersion);
  // Bare / caret / tilde pinned versions, including custom -patchN tags.
  const pinned = /^[vV]?\d+(\.\d+){1,3}(-[A-Za-z0-9.]+)?$/;

  if (pinned.test(existing)) {
    const prefix = existing.startsWith('v') || existing.startsWith('V') ? existing[0] : '';
    return prefix + next;
  }

  const m = existing.match(/^([\^~]=?)[vV]?\d+(\.\d+){1,3}(-[A-Za-z0-9.]+)?$/);
  if (m) return m[1] + next;

  return next;
}
