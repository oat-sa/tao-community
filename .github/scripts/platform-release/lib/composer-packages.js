import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as SemVer from './semver.js';
import {
  formatMonthlyKeyword,
  isMonthly,
  parsePlatformVersionKeyword,
} from './platform-version.js';
import { managedPrefixes } from './config.js';

/**
 * Managed packages: composer.json "require" entries matching vendor prefixes
 * (default oat-sa/). require-dev is never managed.
 */
export class ComposerPackages {
  /** @param {string[]|null} [prefixes] */
  constructor(prefixes = null) {
    this.prefixes = prefixes ?? managedPrefixes();
  }

  /** @param {string} composerJsonPath */
  read(composerJsonPath) {
    if (!existsSync(composerJsonPath)) {
      throw new Error(`composer.json not found: ${composerJsonPath}`);
    }
    const raw = readFileSync(composerJsonPath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid JSON in ${composerJsonPath}`);
    }
    return data;
  }

  /** @param {string} packageName */
  isManaged(packageName) {
    return this.prefixes.some((prefix) => packageName.startsWith(prefix));
  }

  /** @param {Record<string, unknown>} composer */
  managedRequire(composer) {
    const require = composer.require;
    if (!require || typeof require !== 'object') return {};
    /** @type {Record<string, string>} */
    const managed = {};
    for (const [name, constraint] of Object.entries(require)) {
      if (typeof constraint === 'string' && this.isManaged(name)) {
        managed[name] = constraint;
      }
    }
    return Object.fromEntries(Object.entries(managed).sort(([a], [b]) => a.localeCompare(b)));
  }

  /** @param {Record<string, unknown>} composer */
  allRequire(composer) {
    return this.sectionRequire(composer, 'require');
  }

  /** @param {Record<string, unknown>} composer */
  allRequireDev(composer) {
    return this.sectionRequire(composer, 'require-dev');
  }

  /**
   * Root-level composer constraints (require + require-dev).
   * Used for selective RC/backport updates on repos like ami-luoss.
   *
   * @param {Record<string, unknown>} composer
   */
  allRootRequires(composer) {
    return { ...this.allRequire(composer), ...this.allRequireDev(composer) };
  }

  /**
   * @param {Record<string, unknown>} composer
   * @param {'require'|'require-dev'} section
   */
  sectionRequire(composer, section) {
    const block = composer[section];
    if (!block || typeof block !== 'object') return {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const [name, constraint] of Object.entries(block)) {
      if (typeof constraint === 'string') out[name] = constraint;
    }
    return out;
  }

  /**
   * @param {Record<string, unknown>} composer
   * @param {string} packageName
   * @returns {{ section: 'require'|'require-dev', map: Record<string, string> }|null}
   */
  locateRootRequire(composer, packageName) {
    for (const section of /** @type {const} */ (['require', 'require-dev'])) {
      const map = composer[section];
      if (map && typeof map === 'object' && packageName in map) {
        return { section, map: /** @type {Record<string, string>} */ (map) };
      }
    }
    return null;
  }

  /**
   * @param {Record<string, unknown>} composer
   * @param {Record<string, string>} updates
   * @param {boolean} [preserveConstraintStyle]
   */
  applyUpdates(composer, updates, preserveConstraintStyle = true) {
    if (
      (!composer.require || typeof composer.require !== 'object') &&
      (!composer['require-dev'] || typeof composer['require-dev'] !== 'object')
    ) {
      throw new Error('composer.json has no require or require-dev section');
    }
    /** @type {Record<string, {old: string, new: string}>} */
    const changed = {};
    for (const [pkg, newVersion] of Object.entries(updates)) {
      const located = this.locateRootRequire(composer, pkg);
      if (!located) {
        throw new Error(`Package does not exist in composer.json require or require-dev: ${pkg}`);
      }
      const old = String(located.map[pkg]);
      const next = preserveConstraintStyle
        ? SemVer.applyConstraintStyle(old, newVersion)
        : SemVer.normalize(newVersion);
      if (old !== next) {
        located.map[pkg] = next;
        changed[pkg] = { old, new: next };
      }
    }
    return { changed, composer };
  }

  /**
   * @param {string} composerJsonPath
   * @param {Record<string, string>} updates
   * @param {boolean} [preserveConstraintStyle]
   */
  applyUpdatesToFile(composerJsonPath, updates, preserveConstraintStyle = true) {
    const composer = this.read(composerJsonPath);
    const result = this.applyUpdates(composer, updates, preserveConstraintStyle);
    if (!Object.keys(result.changed).length) return {};

    let raw = readFileSync(composerJsonPath, 'utf8');
    for (const [pkg, pair] of Object.entries(result.changed)) {
      raw = this.replacePackageConstraintInRawJson(raw, pkg, pair.old, pair.new);
    }
    writeFileSync(composerJsonPath, raw);

    const verify = this.read(composerJsonPath);
    for (const [pkg, pair] of Object.entries(result.changed)) {
      const ok =
        verify.require?.[pkg] === pair.new || verify['require-dev']?.[pkg] === pair.new;
      if (!ok) {
        throw new Error(`Failed to surgically update ${pkg} in composer.json (expected ${pair.new})`);
      }
    }
    return result.changed;
  }

  /**
   * Apply updates, adding new require entries when absent. Lock-only helper: callers
   * must restore composer.json after composer update (not for commit).
   *
   * @param {string} composerJsonPath
   * @param {Record<string, string>} updates
   */
  applyTransientUpdatesToFile(composerJsonPath, updates) {
    const composer = this.read(composerJsonPath);
    /** @type {Record<string, {old: string, new: string}>} */
    const changed = {};
    for (const [pkg, newVersion] of Object.entries(updates)) {
      const next = SemVer.normalize(newVersion);
      const located = this.locateRootRequire(composer, pkg);
      if (located) {
        const old = String(located.map[pkg]);
        if (old !== next) {
          located.map[pkg] = next;
          changed[pkg] = { old, new: next };
        }
        continue;
      }
      if (!composer.require || typeof composer.require !== 'object') {
        composer.require = {};
      }
      /** @type {Record<string, string>} */ (composer.require)[pkg] = next;
      changed[pkg] = { old: '(new)', new: next };
    }
    if (!Object.keys(changed).length) return {};

    let raw = readFileSync(composerJsonPath, 'utf8');
    for (const [pkg, pair] of Object.entries(changed)) {
      raw =
        pair.old === '(new)'
          ? this.insertPackageInRequireRaw(raw, pkg, pair.new)
          : this.replacePackageConstraintInRawJson(raw, pkg, pair.old, pair.new);
    }
    writeFileSync(composerJsonPath, raw);
    return changed;
  }

  /**
   * Ensure composer.json keywords contain exactly one platform month entry.
   * Replaces any existing YYYY.MM / "YYYY.MM LTS" / YYYY.MM-lts keywords.
   * LTS releases write "YYYY.MM LTS"; others write "YYYY.MM".
   * Preserves multi-line keywords formatting when the original array was pretty-printed.
   *
   * @param {string} composerJsonPath
   * @param {string} monthly bare YYYY.MM
   * @param {{ lts?: boolean }} [opts]
   * @returns {{ changed: boolean, old: string[], new: string[], keyword: string }}
   */
  setMonthlyKeyword(composerJsonPath, monthly, opts = {}) {
    const bare = String(monthly ?? '').trim();
    if (!isMonthly(bare)) {
      throw new Error(`Invalid monthly platform version for keywords: ${monthly}`);
    }
    const lts = Boolean(opts.lts);
    const keyword = formatMonthlyKeyword(bare, lts);
    const composer = this.read(composerJsonPath);
    const old = Array.isArray(composer.keywords)
      ? composer.keywords.map((k) => String(k))
      : [];

    /** @type {string[]} */
    const rest = [];
    let insertAt = null;
    for (const entry of old) {
      if (parsePlatformVersionKeyword(entry)) {
        if (insertAt === null) insertAt = rest.length;
        continue;
      }
      rest.push(entry);
    }
    /** @type {string[]} */
    let next;
    if (insertAt === null) next = [...rest, keyword];
    else {
      next = [...rest];
      next.splice(insertAt, 0, keyword);
    }

    if (old.length === next.length && old.every((v, i) => v === next[i])) {
      return { changed: false, old, new: next, keyword };
    }

    let raw = readFileSync(composerJsonPath, 'utf8');
    raw = this.replaceKeywordsInRawJson(raw, next);
    writeFileSync(composerJsonPath, raw);

    const verify = this.read(composerJsonPath);
    const verified = Array.isArray(verify.keywords)
      ? verify.keywords.map((k) => String(k))
      : [];
    if (verified.length !== next.length || verified.some((v, i) => v !== next[i])) {
      throw new Error(
        `Failed to surgically update keywords in composer.json (expected ${JSON.stringify(next)})`,
      );
    }
    return { changed: true, old, new: next, keyword };
  }

  /**
   * @param {string} raw
   * @param {string[]} keywords
   */
  replaceKeywordsInRawJson(raw, keywords) {
    const re = /"keywords"\s*:\s*\[[\s\S]*?\]/;
    const match = raw.match(re);
    if (match) {
      let replacement;
      if (match[0].includes('\n')) {
        const indentMatch = match[0].match(/\n([ \t]*)\]/);
        const indent = indentMatch ? indentMatch[1] : '  ';
        const itemIndent = `${indent}  `;
        const body = keywords.map((k) => `${itemIndent}${JSON.stringify(k)}`).join(',\n');
        replacement = `"keywords": [\n${body}\n${indent}]`;
      } else {
        replacement = `"keywords": ${JSON.stringify(keywords)}`;
      }
      return raw.replace(re, replacement);
    }
    // Insert after opening brace when keywords key is missing.
    if (!/^\s*\{/.test(raw)) {
      throw new Error('composer.json does not start with an object');
    }
    const keywordsJson = JSON.stringify(keywords, null, 4).replace(/\n/g, '\n    ');
    return raw.replace(/^(\s*\{)/, `$1\n    "keywords": ${keywordsJson},`);
  }

  /**
   * @param {Record<string, unknown>} oldComposer
   * @param {Record<string, unknown>} newComposer
   */
  diffManaged(oldComposer, newComposer) {
    const old = this.managedRequire(oldComposer);
    const neu = this.managedRequire(newComposer);
    const packages = [...new Set([...Object.keys(old), ...Object.keys(neu)])].sort();
    /** @type {Array<{package: string, old: string|null, new: string|null}>} */
    const diff = [];
    for (const pkg of packages) {
      const oldVer = old[pkg] ?? null;
      const newVer = neu[pkg] ?? null;
      if (oldVer === newVer) continue;
      diff.push({ package: pkg, old: oldVer, new: newVer });
    }
    return diff;
  }

  /** @param {string} lockPath */
  lockedVersions(lockPath) {
    if (!existsSync(lockPath)) throw new Error(`composer.lock not found: ${lockPath}`);
    const data = JSON.parse(readFileSync(lockPath, 'utf8'));
    /** @type {Record<string, string>} */
    const out = {};
    for (const section of ['packages', 'packages-dev']) {
      for (const pkg of data[section] || []) {
        if (pkg?.name && pkg?.version) {
          out[pkg.name] = SemVer.normalize(String(pkg.version));
        }
      }
    }
    return out;
  }

  /**
   * @param {string} packageName
   * @param {string|null} [lockPath]
   */
  resolveGithubRepo(packageName, lockPath = null) {
    if (lockPath && existsSync(lockPath)) {
      const data = JSON.parse(readFileSync(lockPath, 'utf8'));
      for (const section of ['packages', 'packages-dev']) {
        for (const pkg of data[section] || []) {
          if (pkg?.name !== packageName) continue;
          const url = pkg.source?.url || pkg.dist?.url || null;
          const repo = this.githubRepoFromUrl(url);
          if (repo) return repo;
        }
      }
    }
    const m = packageName.match(/^([^/]+)\/([^/]+)$/);
    return m ? `${m[1]}/${m[2]}` : null;
  }

  /** @param {string|null} url */
  githubRepoFromUrl(url) {
    if (!url) return null;
    let m = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?(?:\/|$)/);
    if (m) return `${m[1]}/${m[2]}`;
    m = url.match(/api\.github\.com\/repos\/([^/]+)\/([^/]+)\//);
    if (m) return `${m[1]}/${m[2]}`;
    return null;
  }

  /**
   * @param {string} raw
   * @param {string} packageName
   * @param {string} version
   */
  insertPackageInRequireRaw(raw, packageName, version) {
    const pkgKey = JSON.stringify(packageName);
    if (new RegExp(`${escapeRegExp(pkgKey)}\\s*:`).test(raw)) {
      throw new Error(`Package ${packageName} already present in composer.json require`);
    }
    const match = raw.match(/"require"\s*:\s*\{\n(\s*)/);
    if (!match) {
      throw new Error('Could not locate require block in composer.json for insert');
    }
    const indent = match[1];
    const line = `${indent}${pkgKey}: ${JSON.stringify(version)},\n`;
    return raw.replace(/"require"\s*:\s*\{\n/, `"require": {\n${line}`);
  }

  /**
   * @param {string} raw
   * @param {string} packageName
   * @param {string} old
   * @param {string} neu
   */
  replacePackageConstraintInRawJson(raw, packageName, old, neu) {
    const oldJson = JSON.stringify(old);
    const newJson = JSON.stringify(neu);
    const packageAlts = [...new Set([
      escapeRegExp(JSON.stringify(packageName)),
      escapeRegExp(JSON.stringify(packageName).replaceAll('/', '\\/')),
    ])];
    const oldAlts = [...new Set([
      escapeRegExp(oldJson),
      escapeRegExp(JSON.stringify(old).replaceAll('/', '\\/')),
    ])];
    const pattern = new RegExp(`(${packageAlts.join('|')})(\\s*:\\s*)(?:${oldAlts.join('|')})`);
    const match = raw.match(pattern);
    if (!match) {
      throw new Error(`Could not locate ${packageName}: ${old} in composer.json for in-place update`);
    }
    return raw.replace(pattern, `$1$2${newJson}`);
  }
}

/** @param {string} s */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
