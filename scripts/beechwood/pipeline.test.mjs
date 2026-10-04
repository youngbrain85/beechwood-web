// pipeline.mjs: unit tests of the pipeline repository (beechwood-pipeline) location and commit record helpers.
// No commit is created (whatever the signing settings); the case of a repository with commits uses this web repository itself.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dirtyPaths, pipelineBanner, pipelineHead } from './pipeline.mjs';

const WEB_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/* A temp repository with git init only (no commit) */
function bareRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'bw-pipeline-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

describe('pipelineHead: HEAD commit of a repository', () => {
  it('gives the 40-character hash and subject for a repository with commits, equal to git rev-parse HEAD', () => {
    const head = pipelineHead(WEB_REPO);
    const expected = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: WEB_REPO, encoding: 'utf8' }).trim();
    expect(head?.commit).toBe(expected);
    expect(head?.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(head?.subject.length).toBeGreaterThan(0);
  });

  it('gives null without throwing when it is not a git repository or has no commit yet', () => {
    expect(pipelineHead(mkdtempSync(join(tmpdir(), 'bw-nogit-')))).toBeNull();
    expect(pipelineHead(bareRepo())).toBeNull();
  });
});

describe('dirtyPaths: uncommitted changes in the import source paths', () => {
  it('returns only changes under the given paths (untracked new files included)', () => {
    const dir = bareRepo();
    mkdirSync(join(dir, 'a'), { recursive: true });
    writeFileSync(join(dir, 'a/x.svg'), '<svg/>');
    writeFileSync(join(dir, 'b.txt'), 'b');
    expect(dirtyPaths(dir, ['a'])).toEqual(['a/x.svg']);
    expect(dirtyPaths(dir, ['c'])).toEqual([]);
  });

  it('gives null when it is not a git repository (cannot be checked)', () => {
    expect(dirtyPaths(mkdtempSync(join(tmpdir(), 'bw-nogit-')), ['a'])).toBeNull();
  });
});

describe('pipelineBanner: top of an import script output (source repository and commit hash)', () => {
  it('the short commit hash and subject, and "clean" when the source paths are clean', () => {
    const lines = pipelineBanner('sync-x', WEB_REPO, ['path/that/does/not/exist']);
    const short = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: WEB_REPO, encoding: 'utf8' }).trim();
    expect(lines[0]).toContain(`[sync-x] pipeline ${WEB_REPO}`);
    expect(lines[0]).toContain(`@ ${short}`);
    expect(lines.join('\n')).toContain('clean');
  });

  it('lists the files on the warning line when the source paths have uncommitted changes', () => {
    const dir = bareRepo();
    mkdirSync(join(dir, 'a'), { recursive: true });
    writeFileSync(join(dir, 'a/x.svg'), '<svg/>');
    const text = pipelineBanner('sync-x', dir, ['a']).join('\n');
    expect(text).toContain('no commit');
    expect(text).toMatch(/uncommitted changes.*a\/x\.svg/s);
  });
});
