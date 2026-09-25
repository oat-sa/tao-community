import { PR_NOTES_START, PR_NOTES_END } from './config.js';

export class PrBody {
  /** @param {string} body @param {string} notesMarkdown */
  upsertReleaseNotes(body, notesMarkdown) {
    const block = `${PR_NOTES_START}\n${notesMarkdown.trim()}\n${PR_NOTES_END}`;
    const pattern = new RegExp(
      `${escapeRegExp(PR_NOTES_START)}[\\s\\S]*?${escapeRegExp(PR_NOTES_END)}`,
    );
    if (pattern.test(body)) {
      return body.replace(pattern, block);
    }
    const trimmed = body.replace(/\s+$/, '');
    if (!trimmed) return `${block}\n`;
    return `${trimmed}\n\n${block}\n`;
  }

  /** @param {string} body */
  extractReleaseNotes(body) {
    const pattern = new RegExp(
      `${escapeRegExp(PR_NOTES_START)}\\s*([\\s\\S]*?)\\s*${escapeRegExp(PR_NOTES_END)}`,
    );
    const m = body.match(pattern);
    return m ? m[1].trim() : null;
  }
}

/** @param {string} s */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
