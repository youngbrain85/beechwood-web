// ------------------------------------------------------------------
//  Shared by the import scripts: the location of the pipeline repository (beechwood-pipeline), and a record of **which commit** the imported sources came from.
//
//  The import scripts (add-model, sync-sheets, sync-fixtures) print pipelineBanner() at the top of their output, so that
//  commits and reports can say which pipeline commit the web assets came from. Uncommitted changes in the source
//  paths give a warning (the imported files then differ from that commit). A file the pipeline does not track
//  cannot be checked through git; add-model notes that separately.
// ------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* Pipeline repository location: the sibling folder (../beechwood-pipeline) by default, changed with BEECHWOOD_PIPELINE_DIR */
export function pipelineDir() {
  return resolve(process.env.BEECHWOOD_PIPELINE_DIR ?? join(HERE, '../../../beechwood-pipeline'));
}

/* One git command; null on failure (not a repository, no commit, no git). quotepath is off so non-ASCII paths are not quoted or octal-escaped. */
function git(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, '-c', 'core.quotepath=false', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * HEAD commit of the repository: { commit: 40-character hash, subject }. null when it is not a repository or has no commit.
 * @param {string} dir
 * @returns {{ commit: string, subject: string } | null}
 */
export function pipelineHead(dir) {
  const out = git(dir, ['log', '-1', '--format=%H%n%s']);
  if (!out) return null;
  const [commit = '', subject = ''] = out.split('\n');
  return /^[0-9a-f]{40}$/.test(commit) ? { commit, subject } : null;
}

/**
 * Uncommitted changes under the given paths (relative to the repository): a list of file paths (untracked new files included, ignored files excluded).
 * null when it is not a repository (cannot be checked).
 * @param {string} dir
 * @param {string[]} relPaths
 * @returns {string[] | null}
 */
export function dirtyPaths(dir, relPaths) {
  const out = git(dir, ['status', '--porcelain', '--untracked-files=all', '--', ...relPaths]);
  if (out === null) return null;
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3));
}

/**
 * Top of an import script's output: source repository and commit hash (+ subject), and whether the source paths are changed.
 * @param {string} name script name (output prefix)
 * @param {string} dir pipeline repository
 * @param {string[]} relPaths source paths this script reads (relative to the repository)
 * @returns {string[]}
 */
export function pipelineBanner(name, dir, relPaths) {
  const head = pipelineHead(dir);
  const at = head
    ? `@ ${head.commit.slice(0, 7)} ${head.subject}`
    : '@ (no commit: not a git repository, or before the first commit)';
  const lines = [`[${name}] pipeline ${dir} ${at}`];
  const dirty = dirtyPaths(dir, relPaths);
  if (dirty === null) lines.push('  source paths: cannot be checked with git');
  else if (dirty.length === 0) lines.push(`  source paths clean (as committed): ${relPaths.join(' · ')}`);
  else lines.push(`  WARNING: uncommitted changes in the source paths; the imported files differ from that commit: ${dirty.join(' · ')}`);
  return lines;
}
