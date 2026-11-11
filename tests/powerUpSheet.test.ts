import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PowerUpSheetBody, powerUpEnds } from '../components/PowerUpSheet';
import { POWER_UP_CATALOG } from '../game/powerUpCatalog';

describe('power-up sheet (package S5)', () => {
  it.each(POWER_UP_CATALOG.map(e => [e.key, e] as const))('%s renders its name, plain description and who it affects', (_key, entry) => {
    const html = renderToStaticMarkup(React.createElement(PowerUpSheetBody, { info: { key: entry.key } }));
    expect(html).toContain(entry.name.replace(/&/g, '&amp;').replace(/'/g, '&#x27;'));
    expect(html).toContain(entry.plainDescription.replace(/&/g, '&amp;').replace(/'/g, '&#x27;'));
    expect(html).toMatch(/Affects<\/dt><dd[^>]*>(You|One player you choose|Every other player)<\/dd>/);
  });

  it('names the sender of an attack and how long it lasts', () => {
    const html = renderToStaticMarkup(React.createElement(PowerUpSheetBody, { info: { key: 'CRUCIO', fromName: 'Bruno', handsLeft: 3 } }));
    expect(html).toContain('Bruno used this on you.');
    expect(html).toContain('In 3 hands');
  });

  it('says when an effect ends', () => {
    expect(powerUpEnds({ key: 'SECOND_CHANCE', handsLeft: -1 })).toBe('When it is used');
    expect(powerUpEnds({ key: 'BLESSING', handsLeft: 1 })).toBe('After this hand');
    expect(powerUpEnds({ key: 'JACKPOT' })).toBe('At the end of this hand');
  });
});
