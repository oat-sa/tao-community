#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs, requireArg, writeGithubOutput, out, githubError } from '../lib/cli.js';
import { PrBody } from '../lib/pr-body.js';

const args = parseArgs(process.argv);
const bodyFile = requireArg(args, 'body-file');
const notesFile = requireArg(args, 'notes-file');
const output = args.output ?? bodyFile;

const body = existsSync(bodyFile) ? readFileSync(bodyFile, 'utf8') : '';
if (!existsSync(notesFile)) {
  githubError(`Notes file not found: ${notesFile}`);
  process.exit(1);
}
const notes = readFileSync(notesFile, 'utf8');
const updated = new PrBody().upsertReleaseNotes(body, notes);
writeFileSync(output, updated);
writeGithubOutput({ updated: 'true', output });
out(`Updated PR body markers in ${output}`);
