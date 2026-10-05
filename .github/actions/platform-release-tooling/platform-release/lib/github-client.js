import { spawnSync } from 'node:child_process';
import * as SemVer from './semver.js';

/**
 * Extract changelog bullets from a GitHub release body and tag each with the release version.
 * Skips noise like "Release notes :" / "Full change list here" / markdown headings.
 *
 * @param {string} body
 * @param {string} tag e.g. v13.2.0
 * @param {string|null} [releaseUrl] GitHub release page URL
 * @returns {string[]} markdown list lines (`* … ([v13.2.0](url))`)
 */
export function changelogItemsFromRelease(body, tag, releaseUrl = null) {
  const displayTag = /^v/i.test(tag) ? tag : `v${tag}`;
  const tagLabel = releaseUrl ? `[${displayTag}](${releaseUrl})` : displayTag;
  const tagSuffix = ` (${tagLabel})`;
  /** @type {string[]} */
  const items = [];

  for (const raw of String(body ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^release notes\s*:?\s*$/i.test(line)) continue;
    if (/^full change list here\.?$/i.test(line)) continue;
    if (/^_?empty release notes\.?_?$/i.test(line)) continue;

    const listMatch = line.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
    if (!listMatch) continue;

    let text = listMatch[1].trim();
    if (!text) continue;
    if (!text.endsWith(tagSuffix) && !text.endsWith(` (${displayTag})`)) {
      text += tagSuffix;
    }
    items.push(`* ${text}`);
  }

  return items;
}

/**
 * Thin GitHub API client using fetch.
 */
export class GithubClient {
  /**
   * @param {string|null} [token]
   * @param {string} [apiBase]
   */
  constructor(token = null, apiBase = 'https://api.github.com') {
    this.token = token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  /**
   * @param {string} repo
   * @param {number} [perPage]
   * @param {number} [maxPages]
   */
  async listReleases(repo, perPage = 100, maxPages = 5) {
    /** @type {Array<{tag_name: string, name: string|null, body: string|null, draft: boolean, prerelease: boolean, html_url: string|null}>} */
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
      const batch = await this.getJson(`/repos/${repo}/releases?per_page=${perPage}&page=${page}`);
      if (!Array.isArray(batch) || !batch.length) break;
      for (const item of batch) {
        all.push({
          tag_name: String(item.tag_name ?? ''),
          name: item.name != null ? String(item.name) : null,
          body: item.body != null ? String(item.body) : null,
          draft: Boolean(item.draft),
          prerelease: Boolean(item.prerelease),
          html_url: item.html_url != null ? String(item.html_url) : null,
        });
      }
      if (batch.length < perPage) break;
    }
    return all;
  }

  /**
   * Collect extension changelog for old→new as one flat bullet list.
   * Each item is tagged with the release version it came from.
   *
   * @param {string} repo
   * @param {string} oldVersion
   * @param {string} newVersion
   */
  async collectNotesBetween(repo, oldVersion, newVersion) {
    const oldV = SemVer.normalize(oldVersion);
    const newV = SemVer.normalize(newVersion);
    const compareUrl = `https://github.com/${repo}/compare/v${oldV}...v${newV}`;

    if (!SemVer.isVersion(oldV) || !SemVer.isVersion(newV)) {
      return { notes: '', missing: true, compare_url: compareUrl };
    }
    if (SemVer.compare(oldV, newV) === 0) {
      return { notes: '', missing: true, compare_url: compareUrl };
    }

    const releases = await this.listReleases(repo);
    const relevant = [];
    for (const release of releases) {
      if (release.draft || !release.tag_name) continue;
      const tagVersion = SemVer.normalize(release.tag_name);
      // Include custom -patchN tags; still skip branches / junk tags.
      if (!SemVer.isVersion(tagVersion)) continue;
      if (SemVer.compare(tagVersion, oldV) > 0 && SemVer.compare(tagVersion, newV) <= 0) {
        relevant.push(release);
      }
    }
    relevant.sort((a, b) =>
      SemVer.compare(SemVer.normalize(a.tag_name), SemVer.normalize(b.tag_name)),
    );

    if (!relevant.length) {
      return { notes: '', missing: true, compare_url: compareUrl };
    }

    /** @type {string[]} */
    const items = [];
    for (const release of relevant) {
      const tag = release.tag_name;
      const url =
        release.html_url ?? `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`;
      const extracted = changelogItemsFromRelease(release.body ?? '', tag, url);
      if (extracted.length) {
        items.push(...extracted);
        continue;
      }
      // No structured bullets — keep a single pointer to the release.
      const displayTag = /^v/i.test(tag) ? tag : `v${tag}`;
      items.push(`* [Release notes](${url}) ([${displayTag}](${url}))`);
    }

    return { notes: items.join('\n'), missing: false, compare_url: compareUrl };
  }

  /** @param {string} path */
  async getJson(path) {
    const result = await this.requestJson(path);
    if (result.status === 404) return [];
    if (!result.ok) {
      throw new Error(
        `GitHub API HTTP ${result.status} for ${path}: ${result.body.slice(0, 500)}`,
      );
    }
    return result.data;
  }

  /**
   * @param {string} path
   * @param {boolean} [useToken] when false, omit Authorization (public fallback)
   * @returns {Promise<{ok: boolean, status: number, body: string, data: unknown}>}
   */
  async requestJson(path, useToken = true) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'oat-platform-release',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (useToken && this.token) headers.Authorization = `Bearer ${this.token}`;

    const response = await fetch(`${this.apiBase}${path}`, { headers });
    const body = await response.text();
    let data = null;
    if (body) {
      try {
        data = JSON.parse(body);
      } catch {
        data = null;
      }
    }
    return { ok: response.ok, status: response.status, body, data };
  }

  /**
   * List git tag names for a repo.
   * Prefers `git ls-remote` (no REST rate limit); falls back to the Tags API.
   *
   * @param {string} repo owner/name
   * @param {number} [perPage]
   * @param {number} [maxPages]
   * @returns {Promise<string[]>}
   */
  async listTags(repo, perPage = 100, maxPages = 20) {
    const viaGit = this.listTagsViaGit(repo);
    if (viaGit.length) return viaGit;

    try {
      return await this.#listTagsWithClient(repo, perPage, maxPages, true);
    } catch (e) {
      const msg = /** @type {Error} */ (e).message || '';
      const authDenied = /\(HTTP (401|403|404)\)/.test(msg);
      if (!this.token || !authDenied) throw e;
      return await this.#listTagsWithClient(repo, perPage, maxPages, false);
    }
  }

  /**
   * @param {string} repo owner/name
   * @returns {string[]}
   */
  listTagsViaGit(repo) {
    if (!/^[^/]+\/[^/]+$/.test(repo)) return [];
    const url = this.token
      ? `https://x-access-token:${this.token}@github.com/${repo}.git`
      : `https://github.com/${repo}.git`;
    const result = spawnSync(
      'git',
      ['ls-remote', '--tags', '--refs', url],
      { encoding: 'utf8', env: process.env, timeout: 120_000 },
    );
    if (result.status !== 0) return [];
    /** @type {string[]} */
    const tags = [];
    for (const line of (result.stdout || '').split(/\r?\n/)) {
      const m = line.match(/\trefs\/tags\/(.+)$/);
      if (m) tags.push(m[1]);
    }
    return tags;
  }

  /**
   * @param {string} repo
   * @param {number} perPage
   * @param {number} maxPages
   * @param {boolean} useToken
   */
  async #listTagsWithClient(repo, perPage, maxPages, useToken) {
    /** @type {string[]} */
    const tags = [];
    for (let page = 1; page <= maxPages; page++) {
      const result = await this.requestJson(
        `/repos/${repo}/tags?per_page=${perPage}&page=${page}`,
        useToken,
      );
      if (page === 1 && (result.status === 401 || result.status === 403 || result.status === 404)) {
        const hint = useToken && this.token
          ? `Token lacks access to ${repo} (private repos need SEMVER_GH_TOKEN with org/SSO access).`
          : `Cannot read ${repo} anonymously.`;
        throw new Error(`Cannot list tags for ${repo} (HTTP ${result.status}). ${hint}`);
      }
      if (!result.ok) {
        throw new Error(
          `GitHub API HTTP ${result.status} listing tags for ${repo}: ${result.body.slice(0, 500)}`,
        );
      }
      const batch = Array.isArray(result.data) ? result.data : [];
      if (!batch.length) break;
      for (const item of batch) {
        if (item?.name) tags.push(String(item.name));
      }
      if (batch.length < perPage) break;
    }
    return tags;
  }

  /**
   * Fetch a text file at a git ref (tag/branch/sha).
   * Prefers raw.githubusercontent.com (no REST rate limit) for public refs;
   * falls back to the Contents API (needed for private repos).
   *
   * @param {string} repo
   * @param {string} path
   * @param {string} ref
   * @returns {Promise<string>}
   */
  async getFileAtRef(repo, path, ref) {
    const raw = await this.#getFileRaw(repo, path, ref);
    if (raw != null) return raw;

    const headers = {
      Accept: 'application/vnd.github.raw',
      'User-Agent': 'oat-platform-release',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const url = `${this.apiBase}/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(ref)}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      const rateLimited = response.status === 403 && /rate limit/i.test(body);
      throw new Error(
        rateLimited
          ? `GitHub API rate limit exceeded fetching ${repo}@${ref}:${path}. Prefer SEMVER_GH_TOKEN with higher limits, or retry later.`
          : `GitHub API HTTP ${response.status} fetching ${repo}:${ref}:${path}: ${body.slice(0, 500)}`,
      );
    }
    return response.text();
  }

  /**
   * @param {string} repo
   * @param {string} path
   * @param {string} ref
   * @returns {Promise<string|null>}
   */
  async #getFileRaw(repo, path, ref) {
    if (!/^[^/]+\/[^/]+$/.test(repo)) return null;
    const url = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${path
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/')}`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'oat-platform-release' },
        redirect: 'follow',
      });
      if (!response.ok) return null;
      return response.text();
    } catch {
      return null;
    }
  }
}
