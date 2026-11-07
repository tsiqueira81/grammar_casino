import { describe, it, expect } from 'vitest';
import {
  CHARACTER_AVATARS,
  AVATAR_AURAS,
  AVATAR_FLAIRS,
  parseAvatarString,
  serializeCharacterAvatar,
  serializeEmojiAvatar,
  getRandomCharacterAvatar,
  getAvatarPlainText,
  getAvatarDisplayName,
} from '../utils/characterAvatars';

describe('Wayground-Style Character Avatar Engine', () => {
  it('defines 40 unique illustrated characters across 5 themed categories', () => {
    expect(CHARACTER_AVATARS.length).toBe(40);
    const ids = new Set(CHARACTER_AVATARS.map((c) => c.id));
    expect(ids.size).toBe(40);

    const auraIds = new Set(AVATAR_AURAS.map((a) => a.id));
    const flairIds = new Set(AVATAR_FLAIRS.map((f) => f.id));

    for (const ch of CHARACTER_AVATARS) {
      expect(ch.name.length).toBeGreaterThan(2);
      expect(ch.title.length).toBeGreaterThan(4);
      expect(ch.fallbackEmoji.length).toBeGreaterThan(0);
      expect(auraIds.has(ch.defaultAura)).toBe(true);
      expect(flairIds.has(ch.defaultFlair)).toBe(true);
    }
  });

  it('round-trips character avatar strings with custom aura and headgear flair', () => {
    const raw = serializeCharacterAvatar('baron_fox', 'neon', 'crown');
    expect(raw).toBe('char:baron_fox|neon|crown');

    const parsed = parseAvatarString(raw);
    expect(parsed.kind).toBe('character');
    expect(parsed.character?.id).toBe('baron_fox');
    expect(parsed.aura.id).toBe('neon');
    expect(parsed.flair.id).toBe('crown');
    expect(getAvatarPlainText(raw)).toBe('🦊');
    expect(getAvatarDisplayName(raw)).toBe('Baron Fox');
  });

  it('maintains backward compatibility with legacy single-emoji avatars and customized emojis', () => {
    const legacy = parseAvatarString('🐼');
    expect(legacy.kind).toBe('emoji');
    expect(legacy.emoji).toBe('🐼');
    expect(legacy.aura.id).toBe('emerald');
    expect(legacy.flair.id).toBe('none');

    const customEmoji = serializeEmojiAvatar('🐼', 'gold', 'shades');
    expect(customEmoji).toBe('emoji:🐼|gold|shades');
    const parsedCustom = parseAvatarString(customEmoji);
    expect(parsedCustom.kind).toBe('emoji');
    expect(parsedCustom.emoji).toBe('🐼');
    expect(parsedCustom.aura.id).toBe('gold');
    expect(parsedCustom.flair.id).toBe('shades');
  });

  it('picks distinct characters before repeating when seating multiple players', () => {
    const seated: string[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const next = getRandomCharacterAvatar(seated);
      const parsed = parseAvatarString(next);
      expect(parsed.kind).toBe('character');
      expect(seenIds.has(parsed.character!.id)).toBe(false);
      seenIds.add(parsed.character!.id);
      seated.push(next);
    }
    expect(seenIds.size).toBe(40);
  });
});
