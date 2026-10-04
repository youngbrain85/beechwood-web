# beechwood-web

Web app for the visual inspection of the Beechwood Avenue bridge (a three-span prestressed-concrete
beam bridge). It shows the inspection database and lets signed-in users register damages on the 3D
model and save sheet proposals:

| Route | Screen |
|---|---|
| `/` | Overview — NBI component ratings and AASHTO element condition-state quantities |
| `/model` | 3D model — member tree, damage registration, damage details with photos |
| `/analysis` | Analysis — condition-state charts per element and defect |
| `/drawings` | Damage Map — the 23 damage-map sheets and the damage table of each sheet |
| `/quantities` | Quantities — element / defect quantity table |
| `/proposals` | Sheet proposals — pick a part of the model and get candidate sheet layouts |

The app is English only and evaluates damage by the AASHTO element / condition-state scheme. It is
built with React, Mantine, three.js and Vite, and reads its data from a Supabase project.

The 3D model, the damage-map sheets, the proposal frame and the AASHTO reference table are produced
by the sibling repository **beechwood-pipeline** and imported into this one (see
[Pipeline connection](#pipeline-connection)). The imported copies are committed here, so the app
builds and its tests run without the pipeline checkout.

## Layout

| Path | Contents |
|---|---|
| `src/routes/` | the screens listed above |
| `src/bridge/` | the bridge profile (members, sheets, views) — one implementation, `beechwood/` |
| `src/lib/` | Supabase client, evaluation (`eval/aashto/`), GLB handling, sheet-proposal engine |
| `src/dev/` | fixture mode: a fake Supabase client fed from a local snapshot (never in a release build) |
| `public/` | imported assets: `models3d/beechwood/`, `sheets-beechwood/`, `proposal/` |
| `scripts/beechwood/` | import scripts for the pipeline outputs |
| `scripts/` | fixture server, screen captures, build checks, guarded deploy |
| `tools/public_gate.py` | public-release gate |
| `tools/gen_parity.py` | regenerates the projection reference of the sheet-proposal tests |

## Requirements

- Node.js 22 and npm 10 (the versions this repository is developed with)
- git
- Optional: Python 3.9+ (public-release gate, pipeline tests), Chrome (screen captures), a checkout
  of beechwood-pipeline next to this folder (asset import and verification)

## Install

```bash
npm ci
```

## Connection values (`.env`)

```bash
cp .env.example .env
```

Fill in the URL and the publishable (anon) key of your Supabase project. `.env` is git-ignored;
only `.env.example`, which holds placeholders, is tracked. Never put a secret or service-role key
in `.env`: every `VITE_*` value is inlined into the public bundle, and the build checks refuse a
bundle that holds one.

The database schema and the seed script are in the pipeline repository (`db/schema.sql`,
`db/seed_beechwood.py`). The app signs users in through Supabase Auth. Damage photos are display
only here; they are taken and uploaded by the tablet app.

While either value is still a placeholder the app connects to no database. Use
[fixture mode](#fixture-screens-and-captures) to see the screens without one.

```bash
npm run dev          # dev server with the values of .env
```

## Pipeline connection

The import scripts read the pipeline repository from `BEECHWOOD_PIPELINE_DIR`; the default is the
sibling folder `../beechwood-pipeline`. They only read it.

| Command | Reads (pipeline) | Writes (this repository) |
|---|---|---|
| `npm run pipeline:model` | `model/out/BEECHWOOD.glb`, `model/out/objects.json` | `public/models3d/beechwood/` (compressed GLB + manifest) |
| `npm run pipeline:sheets` | `mangdo/sheets/*.svg`, `mangdo/sheets_index.json`, `mangdo/frame_bw.svg`, `mangdo/frame_bw_meta.json` | `public/sheets-beechwood/`, `public/proposal/` |
| `npm run pipeline:fixtures` | `db/fixtures/db.json`, `db/aashto_reference.json` | `.fixtures/beechwood.json` (git-ignored), `src/lib/eval/aashto/reference.json` |
| `npm run pipeline:verify` | the sources above | nothing — fails when a committed asset differs from its pipeline original |

Each command prints the pipeline commit it read from; put that hash in the commit message when you
commit re-imported assets. Run `npm run pipeline:verify` after an import and before a release.

```bash
BEECHWOOD_PIPELINE_DIR=/path/to/beechwood-pipeline npm run pipeline:sheets
```

The pipeline has a test of its own that compares its database rows with this repository's row
types (`src/types/db.ts`). From the pipeline checkout:

```bash
python -m pytest db -q        # reads ../beechwood-web, or the folder named by BEECHWOOD_WEB_DIR
```

The sheet-proposal engine is a port of the projection of the pipeline's sheet generator. Its
reference file (`src/lib/proposal/__fixtures__/parity.json`: a few selections of the Beechwood
model with the ranges and segment counts the pipeline engine returns) is committed; regenerate it
after the model or the pipeline engine changes, then update the test snapshot:

```bash
python tools/gen_parity.py    # needs numpy and trimesh (the pipeline's requirements.txt)
npx vitest run src/lib/proposal -u
```

## Tests

```bash
npm test             # vitest, one run
npm run typecheck    # tsc -b --noEmit
```

The default suite needs neither a database nor the pipeline checkout.

## Build

```bash
npm run build        # tsc -b && vite build  ->  dist/
npm run check        # separate build into dist-check/ + bundle text check + build check
```

`npm run check` builds into `dist-check/`, fails on any non-English text in the bundle
(`scripts/check-bundle-text.mjs`) and runs the build check (`scripts/verify-dist.mjs`): `index.html`,
referenced assets, secret keys, fixture mode, and the public assets byte-identical to `public/`.
A build made with placeholder connection values is reported as `GREEN · PENDING`: the build is
correct, but it will not be deployed.

## Fixture screens and captures

Fixture mode shows every screen locally without a database and without signing in. It replaces the
Supabase client with a fake one fed from a snapshot of the pipeline seed. Nothing is written to a
database; a registered damage lives only in the page session.

```bash
npm run pipeline:fixtures    # once: creates .fixtures/beechwood.json from the pipeline seed
npm run dev:fixtures         # http://localhost:5203
```

With that server running, a second terminal can capture the screens with headless Chrome:

```bash
mkdir -p ../shots && cd ../shots
node ../beechwood-web/scripts/dev-shots.mjs              # all scenes
node ../beechwood-web/scripts/dev-shots.mjs model,photos # some scenes
```

The script writes `<scene>.png` and `report.txt` into the current folder, so run it from a folder
outside the repository. The report lists, per scene, the facts that must be on screen as `OK` or
`MISSING`; the `photos` scene asserts and ends with exit code 1 on a failure. It drives an
installed Chrome through `puppeteer-core`; set `CHROME_PATH` when Chrome is not at the default
Windows location. Stop the fixture server when you are done.

## Deploy

The app is a static site (`dist/`) with a single-page rewrite (`public/vercel.json`). The guarded
deploy publishes it to a Vercel project:

```bash
cp scripts/deploy-targets.example.json scripts/deploy-targets.json   # git-ignored; fill it in
npm run build
node scripts/verify-dist.mjs          # build check of dist/
node scripts/deploy.mjs --dry-run     # verdict only, deploys nothing
node scripts/deploy.mjs               # deploy
```

`scripts/deploy-targets.json` names your own Vercel project (`projectId` and `orgId` come from the
`.vercel/project.json` that `npx vercel link` writes). It is local and never tracked, like `.env`
and `.vercel/`.

Always deploy through `scripts/deploy.mjs`. It refuses

- a bundle holding a secret key or a service-role token,
- a fixture-mode build,
- wrong artifacts (`index.html`, missing or changed public assets, files nobody listed),
- a build made with placeholder connection values, and
- a missing or incomplete deploy target.

It then deploys from inside the linked output folder. Handing a folder to the Vercel CLI directly
makes the CLI create a new project named after the folder.

## Public-release gate

```bash
python tools/public_gate.py --no-commits    # tracked files only
python tools/public_gate.py                 # + commit messages + every blob in the history
python tools/public_gate.py --generic-only  # without the project-specific deny list
```

The gate scans for non-English text, local absolute paths, key values and the entries of a
project-specific deny list; of a binary glTF file it scans the JSON chunk (node and mesh names). It prints `path:line: pattern` (never the matched text) and exits 1 on
any finding. The deny list is not part of the repository: it is read from `--deny-list PATH`, the
file named by `PUBLIC_GATE_DENY_LIST`, or the git-ignored `tools/public_gate.denylist` (one literal
per line). Without one the gate exits 3 unless `--generic-only` is given.

**Publishing.** The working history of this repository holds earlier states that do not pass the
gate, so the full run fails on it by design and that history is never pushed. Publish a single
initial commit of the final tree from a new repository (or an orphan branch), made with the author
identity the owner chooses, and run the full gate there — it must report 0 findings — before
adding a remote.

## Third-party notices

No third-party source is vendored in this repository. The dependencies are installed from npm
(`package.json`, `package-lock.json`) and keep their own licences; the main runtime ones are React,
React Router, Mantine, Recharts, three.js, three-mesh-bvh and supabase-js.

No font is bundled. Sheet text names the Pretendard family (SIL Open Font License 1.1) first in a
font stack and falls back to system fonts when it is not installed.

The 3D model and the damage-map sheets under `public/` are outputs of beechwood-pipeline; see that
repository for their sources.
