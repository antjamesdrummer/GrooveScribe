import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils, installMidiGlobal } from '../helpers/legacyLoader.js';
import {
  constant_ABC_CY_China,
  constant_ABC_CY_Splash,
  constant_ABC_HH_Crash,
  constant_ABC_HH_Normal,
  constant_OUR_MIDI_CYMBAL_CHINA,
  constant_OUR_MIDI_CYMBAL_SPLASH,
  constant_OUR_MIDI_CYMBAL_SPLASH_SOUND,
  constant_OUR_MIDI_HIHAT_NORMAL,
} from '../../js/constants.js';

/**
 * The auxiliary cymbal lane (C): a china or a splash, alongside the hi-hat.
 *
 * The reason it is a lane and not two more articulations in the hi-hat menu is
 * the very first test below: a splash is written because it lands while the
 * hands are already keeping time on something else, and one lane holds one
 * note per step. If that test ever passes trivially the feature has been
 * folded back into the hi-hat row and lost its point.
 */
describe('auxiliary cymbal lane (C)', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  const url = (extra) => `TimeSig=4/4&Div=16&Measures=1&Tempo=80&H=|${'-'.repeat(16)}|${extra}`;

  it('carries a cymbal on the same step the hi-hat is already playing', () => {
    // The whole reason the lane exists. Both lanes are read independently, so
    // both notes survive rather than one overwriting the other.
    const gd = gu.getGrooveDataFromUrlString(
      'TimeSig=4/4&Div=16&Measures=1&Tempo=80&H=|x---------------|&C=|s---------------|'
    );

    expect(gd.hh_array[0]).toBe(constant_ABC_HH_Normal);
    expect(gd.cymbal_array[0]).toBe(constant_ABC_CY_Splash);
  });

  it('is off, and its lane empty, when the parameter is absent', () => {
    const gd = gu.getGrooveDataFromUrlString(url('&K=|o---------------|'));

    expect(gd.showCymbals).toBe(false);
    // Full length rather than undefined: the lane is read positionally
    // against every other one, and a short array misaligns every note after
    // the point it runs out.
    expect(gd.cymbal_array.length).toBe(16);
    expect(gd.cymbal_array.every((slot) => slot === false)).toBe(true);
  });

  it('turns the lane on merely by being present', () => {
    const gd = gu.getGrooveDataFromUrlString(url('&C=|c---------------|'));

    expect(gd.showCymbals).toBe(true);
    expect(gd.cymbal_array[0]).toBe(constant_ABC_CY_China);
  });

  it('reads china and splash onto different pitches, and neither onto the crash', () => {
    // Three cymbals, three heights. Were any two the same the stave would stop
    // distinguishing them and the notation would be saying something false.
    const gd = gu.getGrooveDataFromUrlString(url('&C=|c---s-----------|'));

    expect(gd.cymbal_array[0]).toBe(constant_ABC_CY_China);
    expect(gd.cymbal_array[4]).toBe(constant_ABC_CY_Splash);
    expect(constant_ABC_CY_China).not.toBe(constant_ABC_CY_Splash);
    expect(constant_ABC_CY_China).not.toBe(constant_ABC_HH_Crash);
    expect(constant_ABC_CY_Splash).not.toBe(constant_ABC_HH_Crash);
  });

  it('round-trips back into a URL that still carries the lane', () => {
    const gd = gu.getGrooveDataFromUrlString(url('&C=|----s-------c---|'));
    const out = gu.getUrlStringFromGrooveData(gd);

    expect(out).toContain('C=');
    expect(out).toMatch(/C=\|----s-{7}c-{3}\|/);
  });

  it('emits the lane even when empty, once it has been turned on', () => {
    const gd = gu.getGrooveDataFromUrlString(url(`&C=|${'-'.repeat(16)}|`));
    expect(gd.showCymbals).toBe(true);

    expect(gu.getUrlStringFromGrooveData(gd)).toContain('C=');
  });

  it('leaves the lane out of the URL entirely when it was never on', () => {
    // A groove that never used it should produce exactly the link it always
    // did, or every share URL written before today changes shape for nothing.
    const gd = gu.getGrooveDataFromUrlString(url('&K=|o---------------|'));

    expect(gu.getUrlStringFromGrooveData(gd)).not.toContain('C=');
  });

  it('writes the cymbal into the Hands voice, not a voice of its own', () => {
    // A china under a hi-hat pattern is one chord on one stem, because it is
    // one hand-and-a-hand playing one rhythm. A second voice would draw two
    // independent parts.
    const gd = gu.getGrooveDataFromUrlString(
      'TimeSig=4/4&Div=16&Measures=1&Tempo=80&H=|x---------------|&C=|c---------------|'
    );
    const abc = gu.createABCFromGrooveData(gd, 800);

    const hands = abc.split('V:Feet')[0];
    expect(hands).toContain(constant_ABC_CY_China);
    expect(abc.match(/V:Hands/g).length).toBe(1);
  });

  it('declares a notehead for each new pitch', () => {
    // Without the %%map line abc2svg draws an ordinary oval on a ledger line,
    // which reads as a pitched note on an instrument that has none.
    const gd = gu.getGrooveDataFromUrlString(url('&C=|c---s-----------|'));
    const abc = gu.createABCFromGrooveData(gd, 800);

    expect(abc).toContain("%%map drum ^a' heads=Splashhead");
    expect(abc).toContain("%%map drum ^g' heads=Chinahead print=b");
    expect(abc).toContain('id="Chinahead"');
    expect(abc).toContain('id="Splashhead"');
  });

  it('gives every mapped drum a pitch of its own', () => {
    // abc2svg matches a %%map line on the pitch, and B' and b are the same
    // pitch spelled two ways. Two lines on one pitch means the later one wins
    // and the earlier instrument is drawn with the wrong head — which is how
    // every ride bell came to be drawn as a splash.
    const gd = gu.getGrooveDataFromUrlString(url('&C=|c---s-----------|'));
    const abc = gu.createABCFromGrooveData(gd, 800);

    const pitchOf = (token) => {
      const m = token.match(/^([_^=]*)([A-Ga-g])([',]*)$/);
      const octave = (m[2] === m[2].toLowerCase() ? 1 : 0) + (m[3].match(/'/g) || []).length - (m[3].match(/,/g) || []).length;
      return `${m[1]}${m[2].toUpperCase()}${octave}`;
    };
    const pitches = [...abc.matchAll(/^%%map drum (\S+)/gm)].map((m) => pitchOf(m[1]));

    expect(pitches.length).toBeGreaterThan(10);
    expect(new Set(pitches).size).toBe(pitches.length);
  });

  describe('playback', () => {
    beforeEach(async () => {
      await installMidiGlobal();
    });

    /** The MIDI note numbers actually written into the file, in order. */
    const notesIn = (gd, type) => {
      const midiUrl = gu.create_MIDIURLFromGrooveData(gd, type);
      const bytes = Buffer.from(midiUrl.split('base64,')[1], 'base64');
      const found = [];
      // Note-on events on the percussion channel are 0x99, then note, velocity.
      for (let i = 0; i < bytes.length - 2; i += 1) {
        if (bytes[i] === 0x99) found.push(bytes[i + 1]);
      }
      return found;
    };

    it("plays a china on General MIDI's own Chinese Cymbal", () => {
      const gd = gu.getGrooveDataFromUrlString(url('&C=|c---------------|'));

      expect(notesIn(gd, 0)).toContain(constant_OUR_MIDI_CYMBAL_CHINA);
      expect(notesIn(gd, 'general_MIDI')).toContain(constant_OUR_MIDI_CYMBAL_CHINA);
    });

    it('makes a sound at all for a splash', () => {
      // General MIDI's splash is note 55, and soundfont/gunshot-ogg.js has
      // `"G3": ""` for it -- an entry with no sample. A splash that writes
      // cleanly and plays nothing is the trap the left foot fell into, so the
      // browser gets the crash sample instead.
      const gd = gu.getGrooveDataFromUrlString(url('&C=|s---------------|'));

      expect(notesIn(gd, 0)).toContain(constant_OUR_MIDI_CYMBAL_SPLASH_SOUND);
      expect(notesIn(gd, 0)).not.toContain(constant_OUR_MIDI_CYMBAL_SPLASH);
    });

    it('writes the correct splash note into a DOWNLOADED file', () => {
      // The download is read by other software, which has its own sounds and
      // wants the real note. Only playback is constrained by this soundfont.
      const gd = gu.getGrooveDataFromUrlString(url('&C=|s---------------|'));

      expect(notesIn(gd, 'general_MIDI')).toContain(constant_OUR_MIDI_CYMBAL_SPLASH);
    });

    it('sounds the cymbal AND the hi-hat when both land on the same step', () => {
      const gd = gu.getGrooveDataFromUrlString(
        'TimeSig=4/4&Div=16&Measures=1&Tempo=80&H=|x---------------|&C=|c---------------|'
      );
      const notes = notesIn(gd, 0);

      expect(notes).toContain(constant_OUR_MIDI_HIHAT_NORMAL);
      expect(notes).toContain(constant_OUR_MIDI_CYMBAL_CHINA);
    });

    it('plays nothing extra when the lane is empty', () => {
      const withLane = gu.getGrooveDataFromUrlString(
        url('&K=|o---------------|&C=|--c-------------|')
      );
      const without = gu.getGrooveDataFromUrlString(url('&K=|o---------------|'));

      expect(notesIn(withLane, 0).length).toBe(notesIn(without, 0).length + 1);
    });
  });
});
