import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as SemVer from './semver.js';
import { GithubClient } from './github-client.js';

/**
 * Map a Composer package to a GitHub owner/repo using VCS repository URLs,
 * falling back to the package name when it is already owner/name.
 *
 * @param {string} packageName
 * @param {Record<string, unknown>|null} [composer]
 * @returns {string|null}
 */
export function githubRepoForPackage(packageName, composer = null) {
  const repos = Array.isArray(composer?.repositories) ? composer.repositories : [];
  for (const repo of repos) {
    if (!repo || typeof repo !== 'object') continue;
    const type = /** @type {{type?: string, url?: string}} */ (repo).type;
    const url = /** @type {{type?: string, url?: string}} */ (repo).url;
    if (type !== 'vcs' || !url) continue;
    const m = String(url).match(/github\.com[:/]([^/]+\/[^/\s#?]+)/i);
    if (!m) continue;
    const ghRepo = m[1].replace(/\.git$/i, '');
    if (ghRepo.toLowerCase() === packageName.toLowerCase()) return ghRepo;
  }
  if (/^[^/]+\/[^/]+$/.test(packageName)) return packageName;
  return null;
}

/**
 * Resolve latest stable package versions via Packagist, GitHub tags, or Composer.
 */
export class VersionResolver {
  /**
   * @param {string} [composerBin]
   * @param {GithubClient|null} [github]
   */
  constructor(composerBin = 'composer', github = null) {
    this.composerBin = composerBin;
    this.github = github ?? new GithubClient();
  }

  /**
   * @param {string} packageName
   * @param {string|null} [workingDirectory]
   * @param {Record<string, unknown>|null} [composer]
   */
  async latestStable(packageName, workingDirectory = null, composer = null) {
    let versions = this.packagistVersions(packageName);
    /** @type {Error|null} */
    let githubErr = null;
    if (!versions.length) {
      try {
        versions = await this.githubVersions(packageName, composer);
      } catch (e) {
        githubErr = /** @type {Error} */ (e);
      }
    }
    if (!versions.length) {
      versions = this.composerShowVersions(packageName, workingDirectory);
    }
    const latest = SemVer.latestStable(versions);
    if (!latest) {
      throw new Error(
        githubErr?.message ??
          `Could not resolve a latest stable version for ${packageName} (not on Packagist / GitHub tags / composer show)`,
      );
    }
    return latest;
  }

  /**
   * @param {string[]} packages
   * @param {string|null} [workingDirectory]
   * @param {Record<string, unknown>|null} [composer]
   */
  async latestStableMany(packages, workingDirectory = null, composer = null) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const pkg of packages) {
      out[pkg] = await this.latestStable(pkg, workingDirectory, composer);
    }
    return out;
  }

  /**
   * Exact version lookup for explicit bumps (backport, selective update).
   * Includes custom tags like 1.2.3.4-patch2 that isStable excludes from "latest".
   *
   * @param {string} packageName
   * @param {string} version
   * @param {string|null} [workingDirectory]
   * @param {Record<string, unknown>|null} [composer]
   */
  async versionExists(packageName, version, workingDirectory = null, composer = null) {
    const normalized = SemVer.normalize(version);
    const listOpts = { stableOnly: false };
    if (this.packagistVersions(packageName, listOpts).some((v) => SemVer.normalize(v) === normalized)) {
      return true;
    }
    try {
      const gh = await this.githubVersions(packageName, composer, listOpts);
      if (gh.some((v) => SemVer.normalize(v) === normalized)) return true;
    } catch {
      // Token may 403 on public repos; fall through to composer show.
    }

    const cwd = workingDirectory ?? process.cwd();
    const result = spawnSync(
      this.composerBin,
      ['show', packageName, normalized, '--available', '--no-ansi'],
      { cwd, encoding: 'utf8', env: process.env, timeout: 30_000 },
    );
    if (result.status === 0 && (result.stdout || '').trim()) return true;

    return this.composerShowVersions(packageName, workingDirectory, listOpts).includes(normalized);
  }

  /**
   * @param {string} packageName
   * @param {string|null} [workingDirectory]
   * @param {{stableOnly?: boolean}} [opts]
   */
  composerShowVersions(packageName, workingDirectory = null, opts = {}) {
    const cwd = workingDirectory ?? process.cwd();
    const result = spawnSync(
      this.composerBin,
      ['show', packageName, '--all', '--available', '--no-ansi'],
      { cwd, encoding: 'utf8', env: process.env, timeout: 30_000 },
    );
    return this.parseVersionsFromShow(result.stdout || '', opts);
  }

  /**
   * @param {string} packageName
   * @param {Record<string, unknown>|null} [composer]
   * @param {{stableOnly?: boolean}} [opts]
   */
  async githubVersions(packageName, composer = null, opts = {}) {
    const stableOnly = opts.stableOnly !== false;
    const repo = githubRepoForPackage(packageName, composer);
    if (!repo) return [];
    // Do not swallow auth errors — private packages 404 without SEMVER_GH_TOKEN access.
    const tags = await this.github.listTags(repo);
    /** @type {string[]} */
    const versions = [];
    for (const tag of tags) {
      const version = SemVer.normalize(tag);
      if (!version) continue;
      if (stableOnly && !SemVer.isStable(version)) continue;
      versions.push(version);
    }
    return [...new Set(versions)];
  }

  /**
   * @param {string} output
   * @param {{stableOnly?: boolean}} [opts]
   */
  parseVersionsFromShow(output, opts = {}) {
    const stableOnly = opts.stableOnly !== false;
    /** @type {string[]} */
    const versions = [];
    const lineMatch = output.match(/^versions\s*:\s*(.+)$/im);
    if (lineMatch) {
      const chunk = lineMatch[1].replaceAll('*', ' ');
      for (const part of chunk.split(/[,\s]+/)) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const version = SemVer.normalize(trimmed);
        if (stableOnly && !SemVer.isStable(version)) continue;
        versions.push(version);
      }
    }
    return [...new Set(versions)];
  }

  /**
   * @param {string} packageName
   * @param {{stableOnly?: boolean}} [opts]
   */
  packagistVersions(packageName, opts = {}) {
    const stableOnly = opts.stableOnly !== false;
    // Curl stdout for large packages (e.g. oat-sa/tao-community ~1.6MB) exceeds
    // spawnSync's default 1MB maxBuffer and silently truncates JSON — write to a file.
    const outFile = join(tmpdir(), `packagist-${process.pid}-${Date.now()}.json`);
    try {
      const url = `https://repo.packagist.org/p2/${encodeURIComponent(packageName)}.json`;
      const result = spawnSync(
        'curl',
        ['-sS', '-A', 'oat-platform-release', '-o', outFile, url],
        { encoding: 'utf8', env: process.env },
      );
      if (result.status !== 0) return [];
      const data = JSON.parse(readFileSync(outFile, 'utf8'));
      const list = data?.packages?.[packageName];
      if (!Array.isArray(list)) return [];
      /** @type {string[]} */
      const versions = [];
      for (const pkg of list) {
        if (!pkg?.version) continue;
        const version = SemVer.normalize(String(pkg.version));
        if (stableOnly && !SemVer.isStable(version)) continue;
        versions.push(version);
      }
      return [...new Set(versions)];
    } catch {
      return [];
    } finally {
      try {
        unlinkSync(outFile);
      } catch {
        /* ignore */
      }
    }
  }
}
