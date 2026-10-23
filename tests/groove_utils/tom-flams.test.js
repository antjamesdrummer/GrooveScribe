import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils, installMidiGlobal } from '../helpers/legacyLoader.js';
import {
  constant_ABC_T1_Accent,
  constant_ABC_T1_Flam,
  constant_ABC_T1_Normal,
  constant_ABC_T2_Flam,
  constant_ABC_T3_Flam,
  constant_ABC_T4_Flam,
  constant_ABC_T4_Normal,
  constant_OUR_MIDI_FLAM_GRACE_TICKS,
  constant_OUR_MIDI_TOM1_NORMAL,
  constant_OUR_MIDI_TOM4_NORMAL,
  constant_OUR_MIDI_VELOCITY_GHOST,
  constant_OUR_MIDI_VELOCITY_NORMAL,
} from '../../js/constants.js';
import { noteArraysFromURLData, tabLineFromAbcNoteArray } from '../../js/noteArrays.js';

/**
 * Tom flams: f in a tom lane, as in the snare's.
 *
 * The snare flam plays a custom soundfont note; there is no tom equivalent, so
 * a tom flam is played as two strokes — a quiet grace booked inside the step
 * BEFORE, and the main stroke on its beat. The timing tests below are what hold
 * it to that: a grace booked on the beat would push every main stroke late.
 */
describe('tom flams', () => {
  const parse = (lane, line) => noteArraysFromURLData(lane, `|${line}|`, 16, 1);
  const tab = (lane, notes) => tabLineFromAbcNoteArray(lane, notes, true, true, 16, 0);

  it('reads f in every tom lane as that tom flammed', () => {
    expect(parse('T1', 'f---------------')[0]).toBe(constant_ABC_T1_Flam);
    expect(parse('T2', 'f---------------')[0]).toBe(constant_ABC_T2_Flam);
    expect(parse('T3', 'f---------------')[0]).toBe(constant_ABC_T3_Flam);
    expect(parse('T4', 'f---------------')[0]).toBe(constant_ABC_T4_Flam);
  });

  it('writes each flam as a slashed grace on the tom’s own line, with no accent', () => {
    expect(constant_ABC_T1_Flam).toBe(`{/${constant_ABC_T1_Normal}}${constant_ABC_T1_Normal}`);
    expect(constant_ABC_T4_Flam).toBe(`{/${constant_ABC_T4_Normal}}${constant_ABC_T4_Normal}`);
    expect(constant_ABC_T1_Flam).not.toContain('!accent!');
  });

  it('round-trips flams, accents and plain toms through a link', () => {
    const line = 'f-O-o-f-O-o-ff--';
    expect(tab('T1', parse('T1', line))).toBe(line);
    expect(tab('T4', parse('T4', line))).toBe(line);
  });

  describe('in a groove', () => {
    let gu;
    beforeEach(async () => {
      gu = await newGrooveUtils();
    });
    const groove = (t1, t4, snare = '-'.repeat(16)) =>
      `TimeSig=4/4&Div=16&Measures=1&Tempo=80&H=|${'-'.repeat(16)}|&S=|${snare}|&K=|${'-'.repeat(16)}|&T1=|${t1}|&T4=|${t4}|`;

    it('survives loading from a URL and writing it back out', () => {
      const gd = gu.getGrooveDataFromUrlString(groove('f---O---o-------', '----f-----------'));
      expect(gd.toms_array[0][0]).toBe(constant_ABC_T1_Flam);
      expect(gd.toms_array[0][4]).toBe(constant_ABC_T1_Accent);
      expect(gd.toms_array[3][4]).toBe(constant_ABC_T4_Flam);
      const out = gu.getUrlStringFromGrooveData(gd);
      expect(out).toContain('T1=|f---O---o-------|');
      expect(out).toContain('T4=|----f-----------|');
    });

    it('puts the grace outside a chord, where abc2svg can draw it', () => {
      // A grace inside [...] is invalid ABC; the snare flam's grace is lifted
      // out for the same reason.
      const gd = gu.getGrooveDataFromUrlString(
        groove('f---------------', '-'.repeat(16), 'o---------------')
      );
      const abc = gu.createABCFromGrooveData(gd, 800);
      // the grace comes straight before the chord's opening bracket ...
      expect(abc).toContain('{/e}[');
      // ... and never inside one
      const chords = abc.match(/\[[^\]\n]{0,40}\]/g) || [];
      expect(chords.some((chord) => chord.includes('{/'))).toBe(false);
    });

    describe('playback', () => {
      beforeEach(async () => {
        await installMidiGlobal();
      });

      /** Note-ons in the file as {tick, note, velocity}, in order. */
      const noteOns = (gd) => {
        const url = gu.create_MIDIURLFromGrooveData(gd, 0);
        const b = Buffer.from(url.split('base64,')[1], 'base64');
        let p = b.indexOf('MTrk') + 8;
        const end = b.length;
        let tick = 0;
        const out = [];
        const varint = () => {
          let v = 0;
          let c;
          do {
            c = b[p++];
            v = (v << 7) | (c & 0x7f);
          } while (c & 0x80);
          return v;
        };
        while (p < end) {
          tick += varint();
          const status = b[p++];
          if (status === 0xff) {
            p++; // meta type
            p += varint();
          } else if ((status & 0xf0) === 0xc0) {
            p += 1;
          } else if ((status & 0xf0) === 0x90) {
            out.push({ tick, note: b[p], velocity: b[p + 1] });
            p += 2;
          } else {
            p += 2;
          }
        }
        return out;
      };
      const tomHits = (gd, note) => noteOns(gd).filter((e) => e.note === note);

      it('sounds a quiet grace just before the main stroke, which stays on its beat', () => {
        const plain = tomHits(
          gu.getGrooveDataFromUrlString(groove('----o-----------', '-'.repeat(16))),
          constant_OUR_MIDI_TOM1_NORMAL
        );
        const flam = tomHits(
          gu.getGrooveDataFromUrlString(groove('----f-----------', '-'.repeat(16))),
          constant_OUR_MIDI_TOM1_NORMAL
        );

        expect(plain).toHaveLength(1);
        expect(flam).toHaveLength(2);
        const [grace, main] = flam;
        expect(main.tick).toBe(plain[0].tick);
        expect(main.velocity).toBe(constant_OUR_MIDI_VELOCITY_NORMAL);
        expect(grace.velocity).toBe(constant_OUR_MIDI_VELOCITY_GHOST);
        expect(main.tick - grace.tick).toBe(constant_OUR_MIDI_FLAM_GRACE_TICKS);
      });

      it('flams two toms on the same step together', () => {
        const gd = gu.getGrooveDataFromUrlString(groove('----f-----------', '----f-----------'));
        expect(tomHits(gd, constant_OUR_MIDI_TOM1_NORMAL)).toHaveLength(2);
        expect(tomHits(gd, constant_OUR_MIDI_TOM4_NORMAL)).toHaveLength(2);
      });

      it('on the first step, puts the grace on the beat and keeps the bar its length', () => {
        const plain = gu.getGrooveDataFromUrlString(groove('o-------o-------', '-'.repeat(16)));
        const flam = gu.getGrooveDataFromUrlString(groove('f-------o-------', '-'.repeat(16)));
        const p = tomHits(plain, constant_OUR_MIDI_TOM1_NORMAL);
        const f = tomHits(flam, constant_OUR_MIDI_TOM1_NORMAL);

        expect(f).toHaveLength(3);
        expect(f[0].velocity).toBe(constant_OUR_MIDI_VELOCITY_GHOST);
        // the later, plain stroke has not been dragged late by the flam
        expect(f[2].tick).toBe(p[1].tick);
      });

      it('leaves a groove with no tom flams byte-identical', () => {
        // The old path must not move: same notes, same timing.
        const gd = gu.getGrooveDataFromUrlString(groove('o---O---o---o---', 'o---------------'));
        const hits = noteOns(gd).filter((e) => e.note === constant_OUR_MIDI_TOM1_NORMAL);
        expect(hits.map((e) => e.tick - hits[0].tick)).toEqual([0, 128, 256, 384]);
        expect(hits.map((e) => e.velocity)).toEqual([85, 120, 85, 85]);
      });
    });
  });
});
