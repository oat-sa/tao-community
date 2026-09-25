import * as SemVer from './semver.js';

const GITHUB_RELEASE_URL =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/releases\/tag\/([^/?#]+)\/?$/i;

/**
 * Split workflow_dispatch / file update text into entries.
 * Accepts newlines, commas, or pipes (GitHub UI is single-line).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitPackageUpdateText(text) {
  return String(text ?? '')
    .split(/[\r\n|,]+/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

/**
 * Parse one backport update line.
 * Supports:
 *   oat-sa/extension-tao-item=13.6.2
 *   https://github.com/oat-sa/extension-tao-item/releases/tag/v13.6.2
 *
 * @param {string} line
 * @returns {{package: string, version: string}}
 */
export function parsePackageUpdateLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error('Empty package update line');
  }

  const urlMatch = trimmed.match(GITHUB_RELEASE_URL);
  if (urlMatch) {
    const owner = urlMatch[1];
    const repo = urlMatch[2];
    let version = decodeURIComponent(urlMatch[3]);
    version = SemVer.normalize(version);
    if (!version) {
      throw new Error(`Could not parse version from release URL: ${trimmed}`);
    }
    return { package: `${owner}/${repo}`, version };
  }

  if (!trimmed.includes('=')) {
    throw new Error(
      `Invalid update line "${trimmed}". Use package=version or a GitHub release URL.`,
    );
  }

  const [pkg, ver] = trimmed.split('=', 2).map((s) => s.trim());
  if (!pkg || !ver) {
    throw new Error(`Invalid package=version line: ${trimmed}`);
  }
  return { package: pkg, version: SemVer.normalize(ver) };
}
