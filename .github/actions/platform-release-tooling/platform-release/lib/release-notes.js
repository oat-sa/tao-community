export class ReleaseNotes {
  /**
   * @param {string} platformVersion
   * @param {Array<{package: string, old?: string|null, new?: string|null, notes?: string, compare_url?: string|null, missing?: boolean}>} changes
   * @param {string|null} [sourceRelease]
   * @param {{ lts?: boolean }} [opts]
   */
  generate(platformVersion, changes, sourceRelease = null, opts = {}) {
    const title = opts.lts ? `${platformVersion} LTS` : platformVersion;
    const lines = [`# ${title}`, ''];
    if (sourceRelease) {
      lines.push(`Backport based on \`${sourceRelease}\`.`, '');
    }
    lines.push('## Extension updates', '');
    if (!changes.length) {
      lines.push('_No managed extension version changes detected._', '');
      return lines.join('\n');
    }
    for (const change of changes) {
      const old = change.old ?? '—';
      const neu = change.new ?? '—';
      lines.push(`### ${change.package}`, `\`${old}\` → \`${neu}\``, '');
      const notes = (change.notes ?? '').trim();
      if (notes) {
        lines.push(notes, '');
      } else if (change.missing) {
        if (change.compare_url) {
          lines.push(`_No GitHub release notes found for this range. Compare: <${change.compare_url}>_`, '');
        } else {
          lines.push('_No GitHub release notes found for this version range._', '');
        }
      }
    }
    lines.push('## All Changes', '');
    for (const change of changes) {
      lines.push(
        `* Updated \`${change.package}\` from \`${change.old ?? '—'}\` to \`${change.new ?? '—'}\``,
      );
    }
    lines.push('');
    return lines.join('\n');
  }

  /** @param {Array<{package: string, old?: string|null, new?: string|null}>} changes */
  summaryTable(changes) {
    if (!changes.length) return '_No package version changes._';
    const lines = ['| Package | Old | New |', '|---|---|---|'];
    for (const change of changes) {
      lines.push(`| \`${change.package}\` | \`${change.old ?? '—'}\` | \`${change.new ?? '—'}\` |`);
    }
    return lines.join('\n');
  }
}
