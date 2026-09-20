# GrooveScribe — project guide for Claude

Browser-based drum-notation editor. Runs entirely client-side (no server, no
build step). A groove is encoded in the URL, rendered to sheet music as SVG
(via the vendored `abc2svg`) and played back as MIDI (via `jsmidgen` +
`MIDI.js` soundfonts).

## Running & developing

- **Serve locally:** `npm run serve` (→ http://localhost:8000). You MUST serve
  over HTTP — opening `index.html` via `file://` breaks soundfont loading
  (CORS on the `*-ogg.js` files).
- No compile/bundle: source in `js/` is loaded directly as native ES modules
  (`<script type="module">`). Editing a file = refresh the page.

### Verify loop (run after every change; all must stay green)

| Command                | Expectation                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`             | Vitest unit suite — **724 pass**                                                                                                                                                    |
| `npm run test:e2e`     | Playwright golden-master — **90 pass**. Byte-identical SVG+MIDI snapshots; this is the real proof that a refactor changed nothing functional. **Linux-only baselines — see below.** |
| `npm run lint`         | ESLint — **0 errors** (~82 SonarJS _warnings_ are an accepted refactor backlog, not failures)                                                                                       |
| `npm run typecheck`    | `tsc --noEmit` checkJs via JSDoc — ~296 known errors baseline; changes should be typecheck-**neutral**                                                                              |
| `npm run knip`         | no unused exports/files                                                                                                                                                             |
| `npm run format:check` | Prettier clean (`npm run format` to fix)                                                                                                                                            |
| `npm run check`        | lint + typecheck + format:check + test in one shot                                                                                                                                  |

**The golden-master baselines are committed for Linux only** (`*-chromium-linux.*`).
Playwright keys snapshot filenames on the platform, so on macOS there is no baseline
to compare against: the first `npm run test:e2e` _writes_ `-darwin` files from its own
output and reports those tests as failed, and a second run then "passes" against
snapshots it just minted. That pass proves nothing. On macOS, `git clean -f tests-e2e/`
to discard the generated `-darwin` files; the real comparison has to happen on Linux.
No CI workflow runs the E2E suite today, so nothing checks the Linux baselines
automatically.

Standing rule for all refactoring here: **nothing functional may change** —
prove it with the golden-master E2E, not by eyeballing.

## Architecture

### Render pipeline (the mental model)

```
URL query string  ──parse──►  grooveData  ──►  ABC notation ──► SVG  (abc2svg)
   (urlSerialization)         (the contract)   (abcNotation)
                                   │
                                   └──────────►  MIDI file   (midiFile + jsmidgen)
```

`grooveData` is the central data contract (js/grooveData.js: `GrooveData`
@typedef + pure `createGrooveData()` factory). Everything flows through it.

### The three top-level objects

- **GrooveUtils** (`js/groove_utils.js`) — shared core engine. Owns URL↔grooveData,
  ABC + MIDI generation (delegates to the pure modules below), MIDI playback,
  tempo/swing, note-array math. Used by both the editor and the embed viewer.
- **GrooveWriter** (`js/groove_writer.js`) — the interactive **editor** controller:
  the clickable note grid, menus/popups, undo/redo, permutation practice modes,
  hotkeys. Instantiated in `js/main.js` for `index.html`.
- **GrooveDisplay** (`js/groove_display.js`) — read-only **embed** renderer
  (used by the `GrooveEmbed*.html` / `grooveDBTest*.html` pages).

### Module map (`js/`, ours — everything else in `js/` is vendored, don't lint/edit)

Pure / low-coupling core (extracted from the two big files, imported back):

- `constants.js` — all `constant_*` values (ABC tokens, MIDI numbers, grid colors).
- `musicMath.js` — pure time-signature / note-scaling math.
- `noteArrays.js` — note-array ↔ tab/ABC conversions.
- `grooveData.js` — `GrooveData` typedef + factory (see above).
- `urlSerialization.js` — URL ↔ grooveData (fully pure; instance flags passed via a `config` arg).
- `midiFile.js` — grooveData → MIDI (takes a GrooveUtils `gu`).
- `abcNotation.js` — grooveData → ABC (takes `gu`).
- `browserInfo.js` — user-agent / touch probes.
- `permutations.js` — pure permutation-mode note-array generators (+ kick-array merge/filter).
- `viewHtml.js` — pure HTML string builders (staff container, permutation-options menu).
- `gridState.js` — the DOM grid **read** layer: per-cell state (`is_*_on`/`get_*_state`)
  and whole-measure array readers (`get32NoteArrayFromClickableUI`, `muteArrayFromClickableUI`).
  Reads the ambient global `document`; caller state injected via ctx/callbacks.

Entry/support: `main.js` (index.html bootstrap, wires `window.myGrooveWriter` etc.),
`grooves.js` (built-in groove library).

### Tests

- `tests/` — Vitest (jsdom). Subdirs per subject (`groove_utils/`, `groove_writer/`,
  `groove_display/`). Legacy source is loaded via `tests/helpers/` shims. See `tests/README.md`.
- `tests-e2e/` — Playwright (Chromium). `golden-master.spec.js` snapshots SVG+MIDI for a
  groove corpus; `fixtures.js` blocks non-localhost requests for hermetic runs.

## Note lanes

Each lane is one URL parameter, one grid row and one array on `grooveData`. The
lanes beyond the original four — `T1`-`T4` (toms), `K2` (the left foot's bass
drum) and `C` (auxiliary cymbals) — all follow the same rule: **the presence of
the parameter turns the row on.** There is no separate visibility flag that
could disagree with the notes, and a groove that never used a lane emits no
parameter at all, so every share URL written before it existed keeps its shape.

Adding one touches: `constants.js` (ABC token + MIDI note), `grooveData.js`
(array + show flag), `noteArrays.js` (tab ↔ ABC both ways, and the highlight
mapping), `urlSerialization.js` (read + write), `abcNotation.js` (the `%%map`
notehead and threading the array into the right voice), `midiFile.js`,
`gridState.js` (the read layer), `groove_writer.js` (setter, the click
handlers, the show/hide toggle, and BOTH byte-identical dispatch blocks in
`setNotesFromURLData` / `setNotesFromABCArray`), `viewHtml.js` (the row),
`index.html` (button + context menus) and both CSS themes.

### The auxiliary cymbal lane (`C`)

A china (`c`) or a splash (`s`), on their own row above the hi-hat.

- **Not more articulations in the hi-hat lane.** That lane already carries the
  crash, the ride, the bell, the cowbell and the stacker, and it holds ONE
  cymbal per step. The case this row exists for is a splash landing while a
  hand is already keeping time on the hi-hat, which one lane cannot express.
- **Both print in the same place** — B above the stave, the free space between
  the ride's ledger line and the crash's — and are told apart by the notehead:
  a small plain cross for the splash, a cross in a ring for the china. Same
  arrangement as the cow bell, which prints on the hi-hat's own position with a
  triangle. They are one lane, so the two can never collide.
  Stacking them at different heights was tried and is worse: only one clean
  position is free, so the second cymbal landed at `g'` under four ledger
  lines — and the mark distinguishing it then sat at the same height as a
  ledger line.
- **Playback and download disagree about the splash, deliberately.** General
  MIDI's splash is note 55 and `soundfont/gunshot-ogg.js` has `"G3": ""` for
  it — an entry with no sample, the same trap the left foot fell into. The
  download gets 55, because it is read by other software with its own sounds;
  the browser gets the crash sample at a lower velocity. The china needs no
  such split: General MIDI's 52 is also where the stacker sample lives.
- **A left click cycles** off → splash → china → off, because the row has two
  articulations and no default. Every other note row toggles; the sticking row
  already rotates.

## Conventions & gotchas

- **Adding a new `js/*.js` ES module:** add it to the module-files list in
  `eslint.config.js` (else "import/export only allowed with sourceType: module").
  App source is otherwise treated as classic scripts. `tsconfig.json` `include` lists
  only the big files; small modules are checked transitively.
- **Native modules run deferred**, so parse-time `document.write` is gone — DOM is built
  in `main.js` / inline module scripts. Use `import.meta.url` (not `document.currentScript`,
  which is null in modules) for locating the script's own path.
- Extraction pattern used throughout: move code to a new module, leave a **same-name
  delegating wrapper** in the original file so call sites stay untouched; verify byte-identical
  output via the golden master.
- Grid state is read back from **rendered CSS color** — the note setters (still in GrooveWriter)
  paint a cell, the `gridState` readers compare its color against the shared
  `constant_*_on_color_rgb` values in `constants.js` (setters paint the hex form; the browser
  normalizes it to rgb on readback).
- Vendored globals (don't redefine): `Midi`, `MIDI`, `Abc`, `Share`, `ShareButton`, `Pablo`.

## Refactor status (strangler-fig, ES-module migration)

Steps 1–3 complete: native ESM (no build); pure core extracted; `grooveData` contract
formalized. **Step 4 (decomposing GrooveWriter) is paused** with the high-value cuts done —
`permutations.js`, `viewHtml.js`, and the full `gridState.js` read layer are extracted, taking
`groove_writer.js` from ~5,800 → ~3,870 lines. The remainder is mostly irreducible
controller/event-handler/DOM-write glue. If resumed, candidate cuts: the UI→grooveData
**bridge** (`grooveDataFromClickableUI` / `createMidiUrlFromClickableUI` — top-of-graph, needs a
ctx-bag) or the note **setters** (`set_*_state`, the DOM-**write** counterpart to `gridState`).
