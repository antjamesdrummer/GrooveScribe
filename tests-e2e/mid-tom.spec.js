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
