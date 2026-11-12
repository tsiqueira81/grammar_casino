import { describe, expect, it } from 'vitest';
import { flightPalette } from '../show/flight';

describe('power-up flight colours (package V4)', () => {
  it('bursts red for mischief, ice blue for a freeze', () => {
    expect(flightPalette('PICKPOCKET')[0]).toBe(0xff6b6b);
    expect(flightPalette('SUB_ZERO')[0]).toBe(0xbae6fd);
  });
});
