# Fluent Drummer Scribe

Fluent Drummer Scribe is the exercise-authoring tool for
[fluentdrummer.com](https://fluentdrummer.com). It is a lightly rebranded fork
of [GrooveScribe](https://github.com/montulli/GrooveScribe) by Lou Montulli and
Mike Johnston, and remains licensed under the **GPL v2.0** (see
[LICENSE.txt](LICENSE.txt)).

Only the branding and accent colours differ from upstream — the groove logic,
URL format, and playback engine are unchanged.

### What is this repository for?

- A point-and-click authoring system for creating drum sheet music, plus a
  practice tool for learning and drilling grooves and exercises. It is an HTML
  application that runs entirely in the browser.

### Changes from upstream

Beyond branding and accent colours, this fork adds one functional change:

**Mid tom.** The note grid has a third tom row, **Mid Tom**, between Hi Tom and
Snare. (The two original rows were both labelled just "Tom"; they are now
**Hi Tom** and **Floor Tom**.) The mid tom notates on **D, the fourth line of
the staff** — one step below the hi tom's top-space E and one above the snare's
third-space C — and plays General MIDI 47 (Low-Mid Tom), between the hi tom's 48
and the floor tom's 43.

Upstream already defined four tom voices (`T1`–`T4`) internally, but only ever
surfaced `T1` and `T4` in the grid, so `T2` parsed from a URL and was then
discarded. This change surfaces that dormant voice rather than inventing a new
one, so the URL format, notation pitch and MIDI note are all upstream's own.
Its soundfont slot (documented upstream as "Mid Tom 1") shipped empty, so the
sample is derived from the kit's existing rack tom, pitch-shifted to sit between
the hi and floor toms.

**Backwards compatibility:** the mid tom is written to the URL only when it
carries notes, so any groove URL saved before this change re-serializes
byte-identically and renders exactly as it did before.

### How do I use it

- Upstream project and original hosting:
  - http://www.mikeslessons.com/gscribe/
  - http://montulli.github.io/GrooveScribe/
  - Examples and html tests: http://montulli.github.io/GrooveScribe/html_examples_and_tests/index.html

### How do I get set up?

- Summary of set up: Just host all the files on a web server. The application runs entirely in the browser with Javascript, HTML & CSS.

- Configuration: None

- Dependencies
  - Google's Leto font
  - Google's url shortening api

- Deployment instructions
  Deploy the files to an HTTP server.

### Running and testing locally

Serve the app over HTTP — do **not** open `index.html` directly with a
`file://` URL. The MIDI sound library fetches its soundfont with
`XMLHttpRequest`, and browsers block that for `file://` pages (a CORS / null-origin
restriction), so the sound will not load.

Start a local server (requires Python 3, which ships with most systems):

```bash
npm run serve
```

Then open [http://localhost:8000/index.html](http://localhost:8000/index.html) in
your browser (append any `?TimeSig=...` groove query string as usual). Stop the
server with `Ctrl+C`.

Any static file server works — `npx serve`, VS Code's "Live Server", etc. — the
only requirement is HTTP rather than `file://`.

### Development

The app itself needs no build step, but the repo ships tooling for tests and
code quality. It requires [Node.js](https://nodejs.org/) (v18+); install the dev
dependencies once with:

```bash
npm install
```

Available commands:

| Command                   | Tool             | What it does                                                                    |
| ------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `npm test`                | Vitest           | Run the automated test suite once                                               |
| `npm run test:watch`      | Vitest           | Re-run tests on change (TDD loop)                                               |
| `npm run coverage`        | Vitest + v8      | Run tests and print a coverage report (written to `coverage/`)                  |
| `npm run test:e2e`        | Playwright       | Browser end-to-end tests: real rendered SVG + MIDI golden master, UI flows      |
| `npm run test:e2e:update` | Playwright       | Re-baseline the E2E snapshots (SVG / MIDI / screenshots) on purpose             |
| `npm run lint`            | ESLint           | Lint `js/` and `tests/` (flat config + SonarJS rules)                           |
| `npm run lint:fix`        | ESLint           | Lint and auto-fix what it safely can                                            |
| `npm run format`          | Prettier         | Rewrite files to the project code style                                         |
| `npm run format:check`    | Prettier         | Check formatting without writing (CI-friendly)                                  |
| `npm run typecheck`       | TypeScript       | Type-check the plain JS via JSDoc in `checkJs` mode (no TS conversion, no emit) |
| `npm run knip`            | Knip             | Report unused files, exports, and dependencies                                  |
| `npm run check`           | all of the above | `lint` + `typecheck` + `format:check` + `test` — the full gate                  |

Configuration lives in `eslint.config.js`, `.prettierrc.json` / `.prettierignore`,
`tsconfig.json`, and `knip.json`. Vendored third-party libraries (abc2svg, pablo,
jsmidgen, share-button, MIDI.js) and the hand-authored HTML are excluded from
these tools. See [tests/README.md](tests/README.md) for how the test harness
loads the classic global-scoped source.

**End-to-end tests** (`tests-e2e/`, Playwright) run the real app in Chromium and
serve as a pre-refactor **golden master**: they snapshot the rendered sheet-music
SVG and generated MIDI for a corpus of grooves, exercise UI flows (editing,
menus, playback, export), and guard against console errors. They start the local
server automatically. First-time setup needs the browser binary:

```bash
npx playwright install chromium
npm run test:e2e
```

Committed `*-snapshots/` files are the baselines; regenerate them deliberately
with `npm run test:e2e:update` when a change is _meant_ to alter output.

### Contribution guidelines

- Run `npm run check` before opening a PR
- Add or update tests for behavior changes (see [tests/README.md](tests/README.md))
- Code review

### Licence and attribution

Fluent Drummer Scribe is based on GrooveScribe by Lou Montulli and Mike
Johnston, GPL v2.0 — source: https://github.com/antjamesdrummer/GrooveScribe

The original work is Copyright 2015-2020 Lou Montulli, Mike Johnston, and this
fork is distributed under the same **GPL v2.0** terms; the full text is in
[LICENSE.txt](LICENSE.txt). Upstream repository:
https://github.com/montulli/GrooveScribe

### Who do I talk to?

- Issues with this fork: https://github.com/antjamesdrummer/GrooveScribe/issues
- Upstream issues: https://github.com/montulli/GrooveScribe/issues
- lou at montulli dot org is the admin and author of the upstream project. He cannot answer every email, so please use good judgement before emailing.

To edit this Readme:

- [Learn Markdown](https://bitbucket.org/tutorials/markdowndemo)

### See also

- [SOURCE_CODE_README.md](SOURCE_CODE_README.md)
- [tests/README.md](tests/README.md) — automated test suite (Vitest)
