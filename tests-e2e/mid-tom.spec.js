import { test, expect } from './fixtures.js';
import { loadGroove, getMidi } from './helpers.js';

// MID TOM (T2) — the voice added on top of upstream's dormant Tom2.
//
// Upstream defined four tom voices (T1-T4) in the data model but only ever
// surfaced T1 and T4 in the grid, so T2 parsed from a URL and then evaporated
// when the app re-read the groove from the clickable UI. These tests cover the
// three things that had to become true: the grid row exists and round-trips
// through the URL, the note lands on the 4th line (D), and playback emits the
// General MIDI Low-Mid Tom (47).
//
// The backwards-compatibility case matters most: a URL saved before the mid tom
// existed must re-serialize byte-identically, with no T2 parameter appearing.

const BASE = 'http://localhost:8000/index.html';

const MID_ONLY = `${BASE}?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|----------------|&S=|----------------|&K=|----------------|&T2=|--o-------------|`;
const THREE_TOMS = `${BASE}?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|----------------|&S=|------O---------|&K=|----------------|&T1=|o---------------|&T2=|--o-------------|&T4=|------------o---|`;
const LEGACY_NO_MID = `${BASE}?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|&T1=|--o-------------|&T4=|----------o-----|`;

// Note-on pitches present in the MIDI the app would play.
async function midiPitches(page) {
  const url = await getMidi(page);
  const b64 = url.split('base64,')[1];
  return page.evaluate((b) => {
    const bin = atob(b);
    const d = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) d[i] = bin.charCodeAt(i);
    const out = new Set();
    for (let i = 0; i < d.length - 2; i++) if (d[i] === 0x99) out.add(d[i + 1]);
    return [...out].sort((a, b) => a - b);
  }, b64);
}

// x-sorted notehead y positions from the rendered abc2svg output.
function noteheadYs(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#svgTarget svg');
    return [...svg.querySelectorAll('use')]
      .map((u) => ({
        href: u.getAttribute('href') || u.getAttribute('xlink:href') || '',
        x: +u.getAttribute('x'),
        y: +u.getAttribute('y'),
      }))
      .filter((h) => /hd/.test(h.href))
      .sort((a, b) => a.x - b.x)
      .map((h) => h.y);
  });
}

const gridToms = (page) =>
  page.evaluate(() => {
    const gd = window.myGrooveWriter.grooveDataFromClickableUI();
    return gd.toms_array.map((row) => row.map((v) => (v === false ? '-' : v)).join(''));
  });

const shareUrl = (page) =>
  page.evaluate(() =>
    window.myGrooveWriter.myGrooveUtils.getUrlStringFromGrooveData(
      window.myGrooveWriter.grooveDataFromClickableUI()
    )
  );

test.describe('mid tom (T2)', () => {
  test('has its own grid row, between the hi tom and the snare', async ({ page }) => {
    await loadGroove(page, MID_ONLY);

    await expect(page.locator('#tom2-container')).toHaveCount(1);
    await expect(page.locator('#tom2-label')).toHaveText('Mid Tom');
    // the two pre-existing rows are relabelled rather than both saying "Tom"
    await expect(page.locator('#tom1-label')).toHaveText('Hi Tom');
    await expect(page.locator('#tom4-label')).toHaveText('Floor Tom');

    // DOM order: hi tom, mid tom, snare
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('.line-labels > div')].map((d) => d.textContent.trim())
    );
    expect(order.indexOf('Mid Tom')).toBe(order.indexOf('Hi Tom') + 1);
    expect(order.indexOf('Snare')).toBe(order.indexOf('Mid Tom') + 1);
  });

  test('renders on the 4th line D — one step below hi tom, one above snare', async ({ page }) => {
    await loadGroove(page, THREE_TOMS);
    const [hiTom, midTom, snare, floorTom] = await noteheadYs(page);

    // abc2svg lays out one diatonic step per 3 user units, y increasing downward.
    // Hi tom is 'e' (top space E) and the snare is 'c' (third space C); a note
    // exactly one step below E and one above C can only be the 4th line, D.
    expect(midTom - hiTom).toBe(3);
    expect(snare - midTom).toBe(3);
    // floor tom is 'A', three steps below the mid tom's D (d-c-B-A)
    expect(floorTom - midTom).toBe(9);
  });

  test('plays General MIDI 47, between the hi tom (48) and floor tom (43)', async ({ page }) => {
    await loadGroove(page, THREE_TOMS);
    const pitches = await midiPitches(page);
    expect(pitches).toContain(47);
    expect(pitches).toContain(48);
    expect(pitches).toContain(43);
  });

  test('has an audible sample loaded for MIDI 47', async ({ page }) => {
    await loadGroove(page, MID_ONLY);
    // MIDI.js silently drops noteOn for a pitch with no decoded buffer, so an
    // empty slot here would mean a mid tom that notates but cannot be heard.
    const populated = await page.evaluate(async () => {
      window.myGrooveWriter.myGrooveUtils.oneTimeInitializeMidi();
      const loaded = () => window.MIDI && window.MIDI.Soundfont && window.MIDI.Soundfont.gunshot;
      for (let i = 0; i < 60 && !loaded(); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const sf = window.MIDI.Soundfont.gunshot;
      return !!(sf && sf.B2 && sf.B2.length > 100); // B2 === MIDI 47
    });
    expect(populated).toBe(true);
  });

  test('round-trips through the share URL: encode, reload, identical grid', async ({ page }) => {
    await loadGroove(page, THREE_TOMS);
    const before = await gridToms(page);
    expect(before[1]).toContain('d'); // mid tom actually present

    const shared = await shareUrl(page);
    expect(shared).toContain('T2=');

    await loadGroove(page, shared);
    expect(await gridToms(page)).toEqual(before);
  });

  test('a legacy URL with no mid tom re-serializes unchanged, adding no T2', async ({ page }) => {
    await loadGroove(page, LEGACY_NO_MID);

    const shared = await shareUrl(page);
    // The whole point: pre-existing exercise URLs must not sprout a T2 param.
    expect(shared).not.toContain('T2=');
    expect(shared).toContain('T1=|--o-------------|');
    expect(shared).toContain('T4=|----------o-----|');

    // ...and the grid it produces is the same one the legacy URL produced.
    const legacyToms = await gridToms(page);
    await loadGroove(page, shared);
    expect(await gridToms(page)).toEqual(legacyToms);
    expect(legacyToms[1]).not.toContain('d'); // mid tom row stays empty
  });

  test('Clear All clears the mid tom too', async ({ page }) => {
    await loadGroove(page, THREE_TOMS);
    expect((await gridToms(page))[1]).toContain('d');

    await page.evaluate(() => window.myGrooveWriter.clearAllNotes());
    expect((await gridToms(page))[1]).not.toContain('d');
  });
});

// ---------------------------------------------------------------------------
// Grid layout.
//
// The note grid is a fixed-height stack: each voice row has a hardcoded height
// and the grey guide lines are absolutely positioned at offsets that must equal
// the cumulative row heights. Adding the mid tom row broke that (it had no CSS
// rule at all, so it collapsed to content height and its circles landed on top
// of the snare's). The offsets are now derived from the row heights in CSS.
//
// These assert the geometry rather than pixels: uniform row heights, rows that
// tile with no gap or overlap, and evenly spaced guide lines. That holds across
// platforms, unlike a screenshot, and pins the invariant that actually matters.
// ---------------------------------------------------------------------------

// Measures every rendered measure and returns any violations found. Only rows
// and guide lines that are actually laid out are considered, so this works
// unchanged whether the toms are collapsed or shown.
const layoutReport = (page) =>
  page.evaluate(() => {
    const problems = [];
    const perMeasure = [];
    document.querySelectorAll('.notes-row-container').forEach((rc, mi) => {
      const hh = rc.querySelector('.hi-hat-container');
      if (!hh) return;
      const nc = hh.parentElement;
      const base = nc.getBoundingClientRect().top;
      const laidOut = (e) => e && getComputedStyle(e).display !== 'none';
      const R = (s) => {
        const e = nc.querySelector(s);
        if (!laidOut(e)) return null;
        const r = e.getBoundingClientRect();
        return {
          top: +(r.top - base).toFixed(1),
          h: +r.height.toFixed(1),
          bot: +(r.bottom - base).toFixed(1),
        };
      };
      const rows = [
        ['hihat', '.hi-hat-container'],
        ['hiTom', '#tom1-container'],
        ['midTom', '#tom2-container'],
        ['snare', '.snare-container'],
        ['floorTom', '#tom4-container'],
        ['kick', '.kick-container'],
      ]
        .map(([k, s]) => ({ k, r: R(s) }))
        .filter((x) => x.r);
      if (!rows.length) {
        problems.push(`measure ${mi}: no voice rows laid out`);
        return;
      }
      // every row that is not the hi-hat or the kick must share one height
      const noteRowHeights = rows
        .filter((x) => x.k !== 'hihat' && x.k !== 'kick')
        .map((x) => x.r.h);
      if (new Set(noteRowHeights).size !== 1)
        problems.push(`measure ${mi}: tom/snare rows differ in height: ${noteRowHeights}`);
      for (let i = 1; i < rows.length; i++) {
        const delta = rows[i].r.top - rows[i - 1].r.bot;
        if (Math.abs(delta) > 0.6)
          problems.push(
            `measure ${mi}: ${rows[i - 1].k} -> ${rows[i].k} gap/overlap of ${delta.toFixed(1)}px`
          );
      }
      const lines = [];
      for (let i = 1; i <= 6; i++) {
        const l = R('.staff-line-' + i);
        if (l) lines.push(l.top);
      }
      const gaps = lines.slice(1).map((v, i) => +(v - lines[i]).toFixed(1));
      // one guide line per row, evenly pitched
      if (lines.length !== rows.length)
        problems.push(`measure ${mi}: ${lines.length} guide lines for ${rows.length} rows`);
      if (new Set(gaps).size !== 1)
        problems.push(`measure ${mi}: guide lines unevenly spaced: ${gaps}`);
      perMeasure.push({ rows: rows.map((x) => x.k), rowHeights: rows.map((x) => x.r.h), gaps });
    });
    if (!perMeasure.length) problems.push('no measures rendered');
    return { problems, perMeasure };
  });

test.describe('note grid layout with six voice rows', () => {
  test('rows tile evenly and guide lines are uniform', async ({ page }) => {
    await loadGroove(page, THREE_TOMS);
    const { problems, perMeasure } = await layoutReport(page);
    expect(problems).toEqual([]);
    // hi-hat 44, four note rows at 30, kick 58 -- the tom row must match its peers
    expect(perMeasure[0].rowHeights).toEqual([44, 30, 30, 30, 30, 58]);
    expect(perMeasure[0].gaps).toEqual([30, 30, 30, 30, 30]);
  });

  test('layout holds in every division', async ({ page }) => {
    await loadGroove(page, THREE_TOMS);
    // The mixed-division path calls window.alert, which blocks the renderer.
    await page.evaluate(() => {
      window.alert = () => {};
    });
    for (const [division, name] of [
      [4, '4ths'],
      [8, '8ths'],
      [16, '16ths'],
      [32, '32nds'],
      [12, '8th triplets'],
      [24, '16th triplets'],
      [48, 'mixed'],
    ]) {
      await page.evaluate((d) => window.myGrooveWriter.changeDivision(d), division);
      const { problems, perMeasure } = await layoutReport(page);
      expect(problems, `division ${name}`).toEqual([]);
      expect(perMeasure[0].rowHeights, `division ${name}`).toEqual([44, 30, 30, 30, 30, 58]);
    }
  });

  test('every measure lays out identically when measures are added', async ({ page }) => {
    await loadGroove(page, THREE_TOMS);
    await page.evaluate(() => {
      window.myGrooveWriter.addMeasureButtonClick();
      window.myGrooveWriter.addMeasureButtonClick();
    });
    const { problems, perMeasure } = await layoutReport(page);
    expect(problems).toEqual([]);
    expect(perMeasure).toHaveLength(3);
    const shapes = new Set(perMeasure.map((m) => JSON.stringify(m)));
    expect(shapes.size, 'all measures should share one layout').toBe(1);
  });

  test('toggling TOMS collapses the tom rows and restores the compact grid', async ({ page }) => {
    await loadGroove(page, THREE_TOMS);
    const disp = () =>
      page.evaluate(() => ({
        hiTom: getComputedStyle(document.querySelector('#tom1-container')).display,
        midTom: getComputedStyle(document.querySelector('#tom2-container')).display,
        floorTom: getComputedStyle(document.querySelector('#tom4-container')).display,
        midLabel: getComputedStyle(document.querySelector('#tom2-label')).display,
      }));
    const gridHeight = () =>
      page.evaluate(
        () =>
          +document
            .querySelector('.hi-hat-container')
            .parentElement.getBoundingClientRect()
            .height.toFixed(0)
      );

    const shownHeight = await gridHeight();

    await page.evaluate(() => window.myGrooveWriter.showHideToms(true, false, true));
    // the mid tom must collapse along with its peers, not linger behind
    expect(await disp()).toEqual({
      hiTom: 'none',
      midTom: 'none',
      floorTom: 'none',
      midLabel: 'none',
    });
    // hiding the toms must genuinely reclaim their space, not just blank it:
    // three rows of 30px collapse away.
    const hiddenHeight = await gridHeight();
    expect(shownHeight - hiddenHeight).toBe(90);
    const collapsed = await layoutReport(page);
    expect(collapsed.problems).toEqual([]);
    expect(collapsed.perMeasure[0].rows).toEqual(['hihat', 'snare', 'kick']);
    expect(collapsed.perMeasure[0].rowHeights).toEqual([44, 30, 58]);

    await page.evaluate(() => window.myGrooveWriter.showHideToms(true, true, true));
    expect(await disp()).toEqual({
      hiTom: 'block',
      midTom: 'block',
      floorTom: 'block',
      midLabel: 'block',
    });
    expect(await gridHeight()).toBe(shownHeight);
    const restored = await layoutReport(page);
    expect(restored.problems).toEqual([]);
    expect(restored.perMeasure[0].rowHeights).toEqual([44, 30, 30, 30, 30, 58]);
  });

  test('toms still read back from the grid once shown', async ({ page }) => {
    // isTomsVisible() gates whether the tom rows are read at all, and it keys
    // off the same inline style the toggle writes. If those ever disagree the
    // rows render but their notes silently vanish from the groove.
    await loadGroove(page, THREE_TOMS);
    const state = await page.evaluate(() => {
      const gw = window.myGrooveWriter;
      const gd = gw.grooveDataFromClickableUI();
      return {
        showToms: gd.showToms,
        hiTom: gd.toms_array[0].filter(Boolean).length,
        midTom: gd.toms_array[1].filter(Boolean).length,
        floorTom: gd.toms_array[3].filter(Boolean).length,
        sharedUrlHasT2: gw.myGrooveUtils.getUrlStringFromGrooveData(gd).includes('T2='),
      };
    });
    expect(state).toEqual({
      showToms: true,
      hiTom: 1,
      midTom: 1,
      floorTom: 1,
      sharedUrlHasT2: true,
    });
  });

  test('layout holds in an odd time signature and a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await loadGroove(
      page,
      `${BASE}?TimeSig=7/8&Div=16&Tempo=90&Measures=2&H=|xxxxxxxxxxxxxx|xxxxxxxxxxxxxx|&S=|----O-----O---|----O-----O---|&K=|o------o------|o------o------|&T1=|o-------------|--------------|&T2=|--o-----------|--------------|&T4=|----o---------|--------------|`
    );
    const { problems, perMeasure } = await layoutReport(page);
    expect(problems).toEqual([]);
    expect(perMeasure).toHaveLength(2);
    // the grid keeps its own horizontal scroll rather than distorting the rows
    expect(
      await page.evaluate(() => {
        const mi = document.getElementById('musicalInput');
        return getComputedStyle(mi).overflowX;
      })
    ).toBe('auto');
  });

  test('each row is the topmost hit target at its own centre', async ({ page }) => {
    await loadGroove(page, THREE_TOMS);
    const hits = await page.evaluate(() => {
      document.querySelector('#tom2-2').scrollIntoView({ block: 'center' });
      return [
        ['hihat', '#hi-hat2', 'hi-hat'],
        ['hiTom', '#tom1-2', 'tom1-'],
        ['midTom', '#tom2-2', 'tom2-'],
        ['snare', '#snare2', 'snare'],
        ['floorTom', '#tom4-2', 'tom4-'],
        ['kick', '#kick2', 'kick'],
      ].map(([row, sel, prefix]) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const cell = hit && hit.closest('.tom, .snare, .kick, .hi-hat');
        return {
          row,
          topmost: cell ? cell.id : null,
          correct: !!cell && cell.id.startsWith(prefix),
        };
      });
    });
    expect(hits.filter((h) => !h.correct)).toEqual([]);
  });

  test('clicking the mid tom toggles only the mid tom', async ({ page }) => {
    await loadGroove(page, THREE_TOMS);
    await page.evaluate(() => window.myGrooveWriter.clearAllNotes());
    const counts = () =>
      page.evaluate(() => {
        const d = window.myGrooveWriter.grooveDataFromClickableUI();
        return {
          hiTom: d.toms_array[0].filter(Boolean).length,
          midTom: d.toms_array[1].filter(Boolean).length,
          floorTom: d.toms_array[3].filter(Boolean).length,
          snare: d.snare_array.filter(Boolean).length,
          hh: d.hh_array.filter(Boolean).length,
          kick: d.kick_array.filter(Boolean).length,
        };
      });

    const before = await counts();
    await page.click('#tom2-5');
    const after = await counts();
    expect(after).toEqual({ ...before, midTom: before.midTom + 1 });

    await page.click('#snare7');
    expect(await counts()).toEqual({ ...after, snare: after.snare + 1 });
  });
});
