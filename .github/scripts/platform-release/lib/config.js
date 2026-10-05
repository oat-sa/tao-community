/**
 * Shared configuration for platform release tooling.
 */
export const PR_NOTES_START = '<!-- platform-release-notes:start -->';
export const PR_NOTES_END = '<!-- platform-release-notes:end -->';

export function mainBranch() {
  return process.env.PLATFORM_MAIN_BRANCH || 'main';
}

/** @returns {string[]} */
export function managedPrefixes() {
  const env = process.env.PLATFORM_MANAGED_PREFIXES;
  if (env && env.trim() !== '') {
    const parts = env.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts;
  }
  return ['oat-sa/'];
}

export function botName() {
  return process.env.PLATFORM_BOT_NAME || 'oat-github-bot';
}

export function botEmail() {
  return process.env.PLATFORM_BOT_EMAIL || 'oat-github-bot@taotesting.com';
}
