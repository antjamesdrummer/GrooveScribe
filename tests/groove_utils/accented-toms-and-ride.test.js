import { describe, it, expect } from 'vitest';
import {
  constant_ABC_HH_Accent,
  constant_ABC_HH_Ride,
  constant_ABC_HH_Ride_Accent,
  constant_ABC_HH_Ride_Bell,
  constant_ABC_HH_Ride_Bell_Accent,
  constant_ABC_SN_Accent,
  constant_ABC_T1_Accent,
  constant_ABC_T1_Normal,
  constant_ABC_T2_Accent,
  constant_ABC_T3_Accent,
  constant_ABC_T4_Accent,
  constant_ABC_T4_Normal,
} from '../../js/constants.js';
import { noteArraysFromURLData, tabLineFromAbcNoteArray } from '../../js/noteArrays.js';

/**
 * Accents on the toms, the ride and the ride bell.
 *
 * The hi-hat (X) and the snare (O) were the only voices a link could accent,
 * so a groove whose right hand had moved to the floor tom or the ride lost its
 * accents on the stave. O in a tom lane and R / B in the hi-hat lane carry
 * them. The grid has no control for them: they arrive only from a link.
 */
describe('accented toms, ride and ride bell', () => {
  const parse = (lane, line) => noteArraysFromURLData(lane, `|${line}|`, 16, 1);
  const tab = (lane, notes) => tabLineFromAbcNoteArray(lane, notes, true, true, 16, 0);

  it('reads O in a tom lane as an accented tom, and o and x as a plain one', () => {
    const floor = parse('T4', 'O-o-x-----------');
    expect(floor[0]).toBe(constant_ABC_T4_Accent);
    expect(floor[2]).toBe(constant_ABC_T4_Normal);
    expect(floor[4]).toBe(constant_ABC_T4_Normal);
    expect(parse('T1', 'O-o-------------').slice(0, 3)).toEqual([
      constant_ABC_T1_Accent,
      false,
      constant_ABC_T1_Normal,
    ]);
    expect(parse('T2', 'O---------------')[0]).toBe(constant_ABC_T2_Accent);
    expect(parse('T3', 'O---------------')[0]).toBe(constant_ABC_T3_Accent);
  });

  it('reads R and B in the hi-hat lane as an accented ride and bell, r and b as plain', () => {
    const cymbals = parse('H', 'R-r-B-b-X-------');
    expect(cymbals[0]).toBe(constant_ABC_HH_Ride_Accent);
    expect(cymbals[2]).toBe(constant_ABC_HH_Ride);
    expect(cymbals[4]).toBe(constant_ABC_HH_Ride_Bell_Accent);
    expect(cymbals[6]).toBe(constant_ABC_HH_Ride_Bell);
    expect(cymbals[8]).toBe(constant_ABC_HH_Accent);
  });

  it('leaves the snare lane alone: O is its accent and B its buzz', () => {
    expect(parse('S', 'O---------------')[0]).toBe(constant_ABC_SN_Accent);
    expect(parse('S', 'B---------------')[0]).toBe(parse('S', 'b---------------')[0]);
  });

  it('writes each accent as the same note with an accent mark, so it is drawn where the plain one is', () => {
    expect(constant_ABC_T4_Accent).toBe('!accent!' + constant_ABC_T4_Normal);
    expect(constant_ABC_T1_Accent).toBe('!accent!' + constant_ABC_T1_Normal);
    expect(constant_ABC_HH_Ride_Accent).toBe('!accent!' + constant_ABC_HH_Ride);
    expect(constant_ABC_HH_Ride_Bell_Accent).toBe('!accent!' + constant_ABC_HH_Ride_Bell);
  });

  it('round-trips through a link', () => {
    const toms = 'O-o-O-o-O-o-O-o-';
    const cymbals = 'R-r-B-b-X-x-----';
    expect(tab('T4', parse('T4', toms))).toBe(toms);
    expect(tab('H', parse('H', cymbals))).toBe(cymbals);
  });
});
