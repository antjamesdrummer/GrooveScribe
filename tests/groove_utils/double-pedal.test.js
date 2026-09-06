import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils, installMidiGlobal } from '../helpers/legacyLoader.js';
import {
  constant_ABC_KI2_Normal,
  constant_ABC_KI_Normal,
  constant_OUR_MIDI_KICK2_NORMAL,
  constant_OUR_MIDI_KICK_NORMAL,
  constant_OUR_MIDI_VELOCITY_KICK2,
  constant_OUR_MIDI_VELOCITY_NORMAL,
} from '../../js/constants.js';

/**
 * The left foot's bass drum lane, for a double pedal.
 *
 * K2 is a lane like any other, with one wrinkle worth testing directly: the
 * PRESENCE of the parameter is what turns the row on, exactly as T1-T4 do for
 * the toms. There is no separate DoublePedal= flag, so there is nothing that
 * can disagree with the notes.
 */
describe('double pedal (K2)', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  const url = (extra) => `TimeSig=4/4&Div=16&Measures=1&Tempo=80&H=|${'-'.repeat(16)}|${extra}`;

  it('is off, and its lane empty, when the parameter is absent', () => {
    const gd = gu.getGrooveDataFromUrlString(url('&K=|o---------------|'));

    expect(gd.showDoublePedal).toBe(false);
    // Present and full-length rather than undefined: every other lane is read
    // positionally against it, and a short array misaligns every note after
    // the point it runs out.
    expect(gd.kick2_array.length).toBe(16);
    expect(gd.kick2_array.every((slot) => slot === false)).toBe(true);
  });

  it('turns the lane on merely by being present', () => {
    const gd = gu.getGrooveDataFromUrlString(url('&K2=|o---------------|'));

    expect(gd.showDoublePedal).toBe(true);
    expect(gd.kick2_array[0]).toBe(constant_ABC_KI2_Normal);
  });

  it('reads the left foot onto the bottom line, and the kick above it', () => {
    // The whole point of the feature: two feet, two heights. If these ever
    // became the same pitch the stave would stop distinguishing them and the
    // notation would be a lie.
    const gd = gu.getGrooveDataFromUrlString(url('&K=|o---------------|&K2=|----o-----------|'));

    expect(gd.kick_array[0]).toBe(constant_ABC_KI_Normal);
    expect(gd.kick2_array[4]).toBe(constant_ABC_KI2_Normal);
    expect(constant_ABC_KI2_Normal).not.toBe(constant_ABC_KI_Normal);
  });

  it('lets both feet land on the same step', () => {
    // Both beaters together is a real thing to write, and the lanes are
    // independent, so this has to survive the round trip rather than one
    // foot overwriting the other.
    const gd = gu.getGrooveDataFromUrlString(url('&K=|o---------------|&K2=|o---------------|'));

    expect(gd.kick_array[0]).toBe(constant_ABC_KI_Normal);
    expect(gd.kick2_array[0]).toBe(constant_ABC_KI2_Normal);
  });

  it('round-trips back into a URL that still carries the lane', () => {
    const gd = gu.getGrooveDataFromUrlString(url('&K=|o---------------|&K2=|----o-----------|'));
    const out = gu.getUrlStringFromGrooveData(gd);

    expect(out).toContain('K2=');
    // Same shape as it went in: fifth slot on, everything else off.
    expect(out).toMatch(/K2=\|----o-{11}\|/);
  });

  it('emits the lane even when empty, once it has been turned on', () => {
    // Somebody who switched the pedal on and shared before writing anything
    // should get a link that still opens with the row showing.
    const gd = gu.getGrooveDataFromUrlString(url(`&K2=|${'-'.repeat(16)}|`));
    expect(gd.showDoublePedal).toBe(true);

    const out = gu.getUrlStringFromGrooveData(gd);
    expect(out).toContain('K2=');
  });

  it('leaves the lane out of the URL entirely when it was never on', () => {
    // A one-pedal groove's link should look exactly as it always did, or every
    // existing share URL changes shape for no reason.
    const gd = gu.getGrooveDataFromUrlString(url('&K=|o---------------|'));
    const out = gu.getUrlStringFromGrooveData(gd);

    expect(out).not.toContain('K2=');
  });

  it('does not disturb the kick lane, splash included', () => {
    // The splash is the same foot, and the toggle hides it in the UI — but the
    // data must survive, or toggling the pedal on and off would destroy a bar
    // somebody had written.
    const gd = gu.getGrooveDataFromUrlString(url('&K=|X---x-----------|&K2=|--o-------------|'));
    const out = gu.getUrlStringFromGrooveData(gd);

    expect(out).toMatch(/K=\|X---x-{11}\|/);
    expect(out).toMatch(/K2=\|--o-{13}\|/);
  });

  describe('playback', () => {
    beforeEach(async () => {
      await installMidiGlobal();
    });

    /** The MIDI note numbers actually written into the file, in order. */
    const notesIn = (gd) => {
      const url = gu.create_MIDIURLFromGrooveData(gd, 0);
      const bytes = Buffer.from(url.split('base64,')[1], 'base64');
      const found = [];
      // Note-on events on the percussion channel are 0x99, then note, velocity.
      for (let i = 0; i < bytes.length - 2; i += 1) {
        if (bytes[i] === 0x99) found.push(bytes[i + 1]);
      }
      return found;
    };

    it('makes a sound at all for the left foot', () => {
      // It used to be note 36, which is silent: the vendored soundfont has
      // `"C2": ""` -- an entry with no sample. A left foot that writes cleanly
      // and plays nothing is the worst of both worlds.
      const gd = gu.getGrooveDataFromUrlString(url('&K2=|----o-----------|'));
      expect(notesIn(gd)).toContain(constant_OUR_MIDI_KICK2_NORMAL);
    });

    it('plays the same drum as the right foot, more quietly', () => {
      // A double pedal is two beaters on one head, so the same note IS the
      // truth. Velocity is what tells the feet apart, which is also how the
      // app does it -- so a groove sounds the same in both places.
      expect(constant_OUR_MIDI_KICK2_NORMAL).toBe(constant_OUR_MIDI_KICK_NORMAL);
      expect(constant_OUR_MIDI_VELOCITY_KICK2).toBeLessThan(constant_OUR_MIDI_VELOCITY_NORMAL);

      // The relationship IS the contract: same drum, lower velocity. Asserted
      // on the constants because the encoded file cannot be scanned for
      // velocities reliably — 0x99 occurs inside delta times too, so a raw
      // scan reports bytes that are not velocities at all.
      const gd = gu.getGrooveDataFromUrlString(url('&K2=|o---------------|'));
      expect(notesIn(gd)).toContain(constant_OUR_MIDI_KICK2_NORMAL);
    });

    it('plays nothing extra when the lane is empty', () => {
      const withLane = gu.getGrooveDataFromUrlString(
        url('&K=|o---------------|&K2=|--o-------------|')
      );
      const without = gu.getGrooveDataFromUrlString(url('&K=|o---------------|'));

      // One extra stroke for the one extra left-foot note, and no more.
      expect(notesIn(withLane).length).toBe(notesIn(without).length + 1);
    });

    it('sounds one stroke, not two, when both feet land together', () => {
      // Both beaters on the same head at the same moment is ONE stroke. A
      // second note-on for a note already sounding would cut it off or flam.
      const gd = gu.getGrooveDataFromUrlString(url('&K=|o---------------|&K2=|o---------------|'));
      const strokes = notesIn(gd).filter((n) => n === constant_OUR_MIDI_KICK_NORMAL);
      expect(strokes.length).toBe(1);
    });
  });
});
