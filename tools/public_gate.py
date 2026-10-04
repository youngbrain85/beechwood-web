# -*- coding: utf-8 -*-
"""
Public-release gate: fail when a tracked text file, a commit message or any
blob in the history holds something that must not be published.

Checked:
  - Hangul characters (the repository is English only)
  - local absolute paths (drive-letter paths, the same paths as a POSIX shell on
    Windows spells them, and home directories)
  - key values: Supabase publishable / secret keys, JWTs, Vercel project and
    team ids
  - a project-specific deny list: literal strings, matched case-insensitively
    as substrings.  The list is NOT part of the repository.  It is read from
    --deny-list PATH, else from the file named by the PUBLIC_GATE_DENY_LIST
    environment variable, else from tools/public_gate.denylist (git-ignored).
    One entry per line; blank lines and lines starting with "#" are ignored.
    Without a list the gate refuses to run (exit 3) unless --generic-only is
    given.  A tracked deny-list file is itself a finding.

The Postgres role name service_role is allowed: only key *values* are blocked.
Binary files (by extension, or any file holding a NUL byte) are skipped, except
that the JSON chunk of a binary glTF file (node, mesh and material names) is
scanned as text.
Matched text is never printed; deny-list hits are reported by entry number.

What is scanned:
  1. the tracked files as they are on disk (names and contents)
  2. every commit message and author / committer line reachable from any ref
  3. every blob of every commit reachable from any ref - so text that was
     removed from the current tree but is still in the history is found

Publishing procedure.  A working history that fails step 3 must never be
pushed.  Publish from a new repository (or an orphan branch) holding a single
initial commit of the final tree, made with the author identity the owner
chooses, and run the full gate there before adding a remote.  The gate prints
the author identities it saw so that they can be reviewed.

The generic patterns are assembled from fragments so that this script does not
match itself.  The script only reads; it needs git on the PATH and no
third-party package.

Usage:
  python tools/public_gate.py                 # files + commit messages + history blobs
  python tools/public_gate.py --no-commits    # tracked files only (while developing)
  python tools/public_gate.py --generic-only  # run without a deny list
  python tools/public_gate.py --repo PATH     # check another working tree

Exit code 0 when nothing is found, 1 when at least one finding is printed as
  path:line: pattern-name                       (files)
  commit <sha>:line: pattern-name               (commit messages)
  history <sha>:path: pattern-name (N commits)  (blobs; <sha> = newest commit holding it)
2 when git cannot be run, and 3 when the deny list is missing or empty.
"""
import argparse
import os
import re
import subprocess
import sys

BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".glb", ".gltf-bin",
    ".pdf", ".ttf", ".otf", ".woff", ".woff2", ".zip", ".gz", ".wasm",
}

I = re.IGNORECASE
NOT_WORD_BEFORE = r"(?<![A-Za-z0-9_])"
KEY_TAIL = r"[A-Za-z0-9_\-]{8,}"
ID_TAIL = r"[A-Za-z0-9]{8,}"


# Hangul Jamo, Compatibility Jamo, Jamo Extended-A, Syllables + Jamo Extended-B.
HANGUL_RANGES = ((0x1100, 0x11FF), (0x3130, 0x318F), (0xA960, 0xA97F), (0xAC00, 0xD7FF))


def _j(*parts):
    """Join fragments - keeps the literal out of this file's own text."""
    return "".join(parts)


DENY_LIST_FILE = "public_gate.denylist"

# Top-level folders that mark a path as a local one, and what may not precede a
# POSIX-style path (so that the path part of a URL is not taken for one).
LOCAL_ROOTS = _j("(?:Us", "ers|Pro", "jects)")
NOT_PATH_BEFORE = r"(?<![A-Za-z0-9_.~\-])"
GLB_MAGIC = b"glTF"
DENY_LIST_ENV = "PUBLIC_GATE_DENY_LIST"

# (name, compiled regex).  The name is what the report prints; matched text is
# never printed, so a leaked key is not echoed into a log.  main() appends the
# deny-list entries.
PATTERNS = [
    ("hangul", re.compile(
        "[" + "".join("%s-%s" % (chr(a), chr(b)) for a, b in HANGUL_RANGES) + "]")),
    ("absolute-path", re.compile(
        NOT_WORD_BEFORE + r"(?:[Dd]:[\\/]|[A-Za-z]:[\\/]+" + LOCAL_ROOTS + ")"
        + "|" + NOT_PATH_BEFORE + "/[A-Za-z]/" + LOCAL_ROOTS + "/"
        + "|" + NOT_PATH_BEFORE + _j("/(?:ho", "me|Us", "ers)/") + r"[A-Za-z0-9._\-]+")),
    ("supabase-key", re.compile(
        _j("sb_", "(?:publishable|secret)", "_") + KEY_TAIL)),
    ("jwt", re.compile(_j("eyJ", "hbGci") + KEY_TAIL)),
    ("vercel-id", re.compile(
        NOT_WORD_BEFORE + _j("(?:pr", "j|te", "am)_") + ID_TAIL)),
]


def git(repo, *args, **kw):
    out = subprocess.run(["git", "-C", repo] + list(args), stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, input=kw.get("stdin"))
    if out.returncode != 0:
        sys.stderr.write(out.stderr.decode("utf-8", "replace"))
        sys.exit(2)
    return out.stdout


def find_deny_list(explicit, here):
    """Path of the deny list to use, or None."""
    if explicit:
        return explicit
    env = os.environ.get(DENY_LIST_ENV)
    if env:
        return env
    default = os.path.join(here, DENY_LIST_FILE)
    return default if os.path.isfile(default) else None


def load_deny_list(path):
    """[(name, regex)] - one case-insensitive literal per entry, named by its number."""
    with open(path, encoding="utf-8") as f:
        entries = [ln.strip() for ln in f]
    entries = [e for e in entries if e and not e.startswith("#")]
    return [("deny-list#%d" % n, re.compile(re.escape(e), I))
            for n, e in enumerate(entries, 1)]


def is_binary_name(name):
    return os.path.splitext(name)[1].lower() in BINARY_EXT


def glb_json(data):
    """The JSON chunk of a binary glTF file as text, or None when data is not one."""
    if len(data) < 20 or data[:4] != GLB_MAGIC:
        return None
    size = int.from_bytes(data[12:16], "little")
    if data[16:20] != b"JSON" or 20 + size > len(data):
        return None
    return data[20:20 + size].decode("utf-8", "replace")


def scan_text(text):
    """Yield (line number, pattern name) for every pattern hit, once per line."""
    for no, line in enumerate(text.splitlines(), 1):
        for name, rx in PATTERNS:
            if rx.search(line):
                yield no, name


def scan_files(repo):
    findings, scanned, skipped = [], 0, 0
    names = git(repo, "ls-files", "-z").decode("utf-8").split("\0")
    for name in filter(None, names):
        path = os.path.join(repo, name)
        # A tracked path may itself carry a forbidden name.
        for _, pat in scan_text(name):
            findings.append("%s:0: %s (file name)" % (name, pat))
        if os.path.basename(name) == DENY_LIST_FILE:
            findings.append("%s:0: deny list is tracked" % name)
        if not os.path.isfile(path):
            skipped += 1
            continue
        with open(path, "rb") as f:
            data = f.read()
        chunk = glb_json(data)
        if chunk is not None:
            for pat in sorted({p for _, p in scan_text(chunk)}):
                findings.append("%s:0: %s (glTF JSON chunk)" % (name, pat))
        if chunk is not None or is_binary_name(name) or b"\0" in data:
            skipped += 1
            continue
        scanned += 1
        for no, pat in scan_text(data.decode("utf-8", "replace")):
            findings.append("%s:%d: %s" % (name, no, pat))
    return findings, scanned, skipped


def scan_commits(repo):
    """Commit messages and identity lines.  Returns (findings, count, identities)."""
    findings, who = [], set()
    if not git(repo, "rev-list", "--all", "--max-count=1").strip():
        return findings, 0, who
    raw = git(repo, "log", "--all",
              "--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x00").decode("utf-8", "replace")
    fields = raw.split("\0")
    count = 0
    for sha, author, committer, body in zip(fields[0::4], fields[1::4], fields[2::4],
                                            fields[3::4]):
        sha = sha.strip()
        if not sha:
            continue
        count += 1
        who.update((author, committer))
        # Line 0 is the author / committer line; the message starts at line 1.
        for no, pat in scan_text("%s | %s\n%s" % (author, committer, body)):
            findings.append("commit %s:%d: %s" % (sha[:12], no - 1, pat))
    return findings, count, who


def scan_history(repo):
    """Every blob of every commit reachable from any ref, each blob read once."""
    commits = git(repo, "rev-list", "--all").decode("ascii").split()
    blobs = {}    # blob sha -> [path, newest commit holding it, number of commits]
    for commit in commits:    # newest first
        listing = git(repo, "ls-tree", "-r", "-z", commit).decode("utf-8", "replace")
        for entry in filter(None, listing.split("\0")):
            meta, path = entry.split("\t", 1)
            kind, sha = meta.split()[1:3]
            if kind != "blob":
                continue
            if sha in blobs:
                blobs[sha][2] += 1
            else:
                blobs[sha] = [path, commit, 1]
    findings, scanned = [], 0
    order = sorted(blobs, key=lambda k: (blobs[k][0], k))
    if not order:
        return findings, 0, len(commits)
    out = git(repo, "cat-file", "--batch", stdin=("\n".join(order) + "\n").encode("ascii"))
    pos = 0
    for sha in order:
        end = out.index(b"\n", pos)
        size = int(out[pos:end].split()[2])
        data = out[end + 1:end + 1 + size]
        pos = end + 1 + size + 1
        path, commit, n = blobs[sha]
        where = "history %s:%s" % (commit[:12], path)
        for pat in sorted({p for _, p in scan_text(path)}):
            findings.append("%s: %s (file name, %d commits)" % (where, pat, n))
        if os.path.basename(path) == DENY_LIST_FILE:
            findings.append("%s: deny list is tracked (%d commits)" % (where, n))
        chunk = glb_json(data)
        if chunk is not None:
            for pat in sorted({p for _, p in scan_text(chunk)}):
                findings.append("%s: %s (glTF JSON chunk, %d commits)" % (where, pat, n))
        if chunk is not None or is_binary_name(path) or b"\0" in data:
            continue
        scanned += 1
        for pat in sorted({p for _, p in scan_text(data.decode("utf-8", "replace"))}):
            findings.append("%s: %s (%d commits)" % (where, pat, n))
    return findings, scanned, len(commits)


def main(argv=None):
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--repo", default=os.path.normpath(os.path.join(here, "..")),
                    help="working tree to check (default: the repository holding this script)")
    ap.add_argument("--no-commits", action="store_true",
                    help="tracked files only: skip the commit messages and the history blobs")
    ap.add_argument("--deny-list", metavar="PATH",
                    help="project-specific deny list (default: $%s, else tools/%s)"
                         % (DENY_LIST_ENV, DENY_LIST_FILE))
    ap.add_argument("--generic-only", action="store_true",
                    help="run the generic checks without a deny list")
    args = ap.parse_args(argv)

    deny = 0
    if not args.generic_only:
        path = find_deny_list(args.deny_list, here)
        entries = load_deny_list(path) if path and os.path.isfile(path) else []
        if not entries:
            sys.stderr.write(
                "public gate: no deny list (looked at --deny-list, $%s, tools/%s).\n"
                "Supply one, or pass --generic-only to run the generic checks alone.\n"
                % (DENY_LIST_ENV, DENY_LIST_FILE))
            return 3
        PATTERNS.extend(entries)
        deny = len(entries)

    repo = git(args.repo, "rev-parse", "--show-toplevel").decode("utf-8").strip()
    findings, scanned, skipped = scan_files(repo)
    summary = "%d text files scanned, %d binary skipped" % (scanned, skipped)
    who = set()
    if not args.no_commits:
        more, messages, who = scan_commits(repo)
        findings += more
        more, blobs, commits = scan_history(repo)
        findings += more
        summary += ", %d commit messages, %d history blobs in %d commits" % (
            messages, blobs, commits)

    for line in findings:
        print(line)
    for ident in sorted(who):
        print("identity in history: %s" % ident)
    print("public gate: %s, %d deny-list entries, %d findings"
          % (summary, deny, len(findings)))
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
