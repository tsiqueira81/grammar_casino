import React, { useState, useMemo } from 'react';
import { Dices, Check } from 'lucide-react';
import { AVATARS } from '../constants';
import { SoundEffect } from '../types';
import {
  AuraId,
  AVATAR_AURAS,
  AVATAR_FLAIRS,
  CHARACTER_AVATARS,
  CHARACTER_CATEGORIES,
  CharacterAvatarDefinition,
  CharacterCategoryId,
  FlairId,
  getRandomCharacterAvatar,
  parseAvatarString,
  serializeCharacterAvatar,
  serializeEmojiAvatar,
} from '../utils/characterAvatars';

export type PlayerAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface PlayerAvatarProps {
  value: string | undefined | null;
  size?: PlayerAvatarSize;
  animated?: boolean;
  /** 'happy' holds the 3D character's smile (e.g. the winner); otherwise it blinks and smiles now and then. */
  mood?: 'idle' | 'happy';
  className?: string;
}

const SIZE_CLASSES: Record<PlayerAvatarSize, { box: string; emoji: string }> = {
  xs: { box: 'w-6 h-6', emoji: 'text-sm' },
  sm: { box: 'w-8 h-8', emoji: 'text-lg' },
  md: { box: 'w-11 h-11', emoji: 'text-2xl' },
  lg: { box: 'w-14 h-14', emoji: 'text-3xl' },
  xl: { box: 'w-20 h-20', emoji: 'text-4xl' },
  '2xl': { box: 'w-24 h-24 sm:w-28 sm:h-28', emoji: 'text-5xl' },
};

function renderCharacterSvg(ch: CharacterAvatarDefinition, flair: FlairId) {
  const { primaryColor, secondaryColor, detailColor, earStyle, eyeStyle, mouthStyle, collarStyle, facePattern } = ch;

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full overflow-visible select-none"
      aria-hidden="true"
    >
      {/* 1. EARS / HORNS / FINS / ANTENNA (Behind head) */}
      {earStyle === 'fox' && (
        <g>
          <polygon points="16,46 10,12 40,28" fill={primaryColor} />
          <polygon points="20,42 15,19 35,30" fill={secondaryColor} />
          <polygon points="84,46 90,12 60,28" fill={primaryColor} />
          <polygon points="80,42 85,19 65,30" fill={secondaryColor} />
        </g>
      )}
      {earStyle === 'cat' && (
        <g>
          <polygon points="18,45 16,16 42,29" fill={primaryColor} />
          <polygon points="22,41 20,22 37,31" fill={detailColor} opacity="0.65" />
          <polygon points="82,45 84,16 58,29" fill={primaryColor} />
          <polygon points="78,41 80,22 63,31" fill={detailColor} opacity="0.65" />
        </g>
      )}
      {earStyle === 'round' && (
        <g>
          <circle cx="23" cy="27" r="13" fill={primaryColor} />
          <circle cx="23" cy="27" r="7.5" fill={secondaryColor} />
          <circle cx="77" cy="27" r="13" fill={primaryColor} />
          <circle cx="77" cy="27" r="7.5" fill={secondaryColor} />
        </g>
      )}
      {earStyle === 'floppy' && (
        <g>
          <ellipse cx="16" cy="48" rx="9" ry="18" transform="rotate(14 16 48)" fill={detailColor} />
          <ellipse cx="84" cy="48" rx="9" ry="18" transform="rotate(-14 84 48)" fill={detailColor} />
        </g>
      )}
      {earStyle === 'bunny' && (
        <g>
          <ellipse cx="34" cy="18" rx="7.5" ry="17" transform="rotate(-8 34 18)" fill={primaryColor} />
          <ellipse cx="34" cy="18" rx="4" ry="12" transform="rotate(-8 34 18)" fill={secondaryColor} />
          <ellipse cx="66" cy="18" rx="7.5" ry="17" transform="rotate(8 66 18)" fill={primaryColor} />
          <ellipse cx="66" cy="18" rx="4" ry="12" transform="rotate(8 66 18)" fill={secondaryColor} />
        </g>
      )}
      {earStyle === 'horns' && (
        <g>
          <path d="M 24 34 Q 10 18 22 10 Q 28 20 35 28 Z" fill={detailColor} />
          <path d="M 76 34 Q 90 18 78 10 Q 72 20 65 28 Z" fill={detailColor} />
        </g>
      )}
      {earStyle === 'antenna' && (
        <g>
          <line x1="50" y1="24" x2="50" y2="9" stroke={detailColor} strokeWidth="4" strokeLinecap="round" />
          <circle cx="50" cy="8" r="5.5" fill={detailColor} />
          <rect x="12" y="44" width="7" height="16" rx="3" fill={detailColor} />
          <rect x="81" y="44" width="7" height="16" rx="3" fill={detailColor} />
        </g>
      )}
      {earStyle === 'fins' && (
        <g>
          <path d="M 18 40 L 5 30 L 10 46 L 4 56 L 19 56 Z" fill={detailColor} />
          <path d="M 82 40 L 95 30 L 90 46 L 96 56 L 81 56 Z" fill={detailColor} />
        </g>
      )}
      {earStyle === 'feathers' && (
        <g>
          <path d="M 42 25 Q 36 8 44 12 Q 50 5 54 13 Q 62 9 58 25 Z" fill={detailColor} />
        </g>
      )}

      {/* 2. COLLAR / SUIT / SHOULDERS */}
      {collarStyle === 'tuxedo' && (
        <g>
          <path d="M 20 96 Q 24 72 50 72 Q 76 72 80 96 Z" fill="#1e293b" />
          <polygon points="38,74 50,92 62,74" fill="#f8fafc" />
          {/* Bowtie */}
          <polygon points="41,77 50,82 41,87" fill={detailColor} />
          <polygon points="59,77 50,82 59,87" fill={detailColor} />
          <circle cx="50" cy="82" r="2.6" fill="#ffffff" />
        </g>
      )}
      {collarStyle === 'royal_robe' && (
        <g>
          <path d="M 18 96 Q 22 71 50 71 Q 78 71 82 96 Z" fill={detailColor} />
          <path d="M 28 75 Q 50 85 72 75" stroke="#ffffff" strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="50" cy="83" r="4" fill="#fbbf24" />
        </g>
      )}
      {collarStyle === 'cape' && (
        <g>
          <path d="M 16 96 Q 22 70 50 70 Q 78 70 84 96 Z" fill="#311042" />
          <path d="M 32 74 L 50 86 L 68 74" fill={detailColor} />
          <circle cx="50" cy="81" r="3.5" fill="#fde047" />
        </g>
      )}
      {collarStyle === 'cyber_armor' && (
        <g>
          <path d="M 18 96 L 26 72 L 74 72 L 82 96 Z" fill="#0f172a" stroke={detailColor} strokeWidth="2.5" />
          <line x1="36" y1="82" x2="64" y2="82" stroke={detailColor} strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="89" r="3.5" fill={detailColor} />
        </g>
      )}
      {collarStyle === 'hoodie' && (
        <g>
          <path d="M 19 96 Q 24 72 50 72 Q 76 72 81 96 Z" fill={detailColor} />
          <line x1="43" y1="77" x2="43" y2="90" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="57" y1="77" x2="57" y2="90" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      {collarStyle === 'scarf' && (
        <g>
          <path d="M 21 96 Q 25 73 50 73 Q 75 73 79 96 Z" fill={primaryColor} />
          <rect x="27" y="71" width="46" height="11" rx="5.5" fill={detailColor} />
          <rect x="55" y="76" width="10" height="17" rx="4" fill={detailColor} />
        </g>
      )}

      {/* 3. HEAD BASE SILHOUETTE */}
      <rect x="20" y="23" width="60" height="54" rx="26" fill={primaryColor} />
      {/* Inner lower face / cheek highlight */}
      <ellipse cx="50" cy="57" rx="23" ry="17" fill={secondaryColor} opacity="0.92" />

      {/* 4. FACIAL PATTERNS */}
      {facePattern === 'mask' && (
        <g>
          <rect x="23" y="37" width="54" height="16" rx="8" fill="#1e293b" opacity="0.82" />
        </g>
      )}
      {facePattern === 'patch' && (
        <ellipse cx="36" cy="45" rx="10" ry="9" fill={secondaryColor} opacity="0.9" />
      )}
      {facePattern === 'stripes' && (
        <g stroke={detailColor} strokeWidth="2.6" strokeLinecap="round" opacity="0.75">
          <line x1="46" y1="26" x2="46" y2="33" />
          <line x1="50" y1="25" x2="50" y2="35" />
          <line x1="54" y1="26" x2="54" y2="33" />
        </g>
      )}
      {facePattern === 'blush' && (
        <g fill="#fb7185" opacity="0.55">
          <ellipse cx="29" cy="55" rx="5" ry="3" />
          <ellipse cx="71" cy="55" rx="5" ry="3" />
        </g>
      )}
      {facePattern === 'freckles' && (
        <g fill={detailColor} opacity="0.65">
          <circle cx="28" cy="55" r="1.4" />
          <circle cx="32" cy="57" r="1.4" />
          <circle cx="31" cy="53" r="1.4" />
          <circle cx="72" cy="55" r="1.4" />
          <circle cx="68" cy="57" r="1.4" />
          <circle cx="69" cy="53" r="1.4" />
        </g>
      )}
      {facePattern === 'circuit' && (
        <g stroke={detailColor} strokeWidth="1.6" fill="none" opacity="0.8">
          <polyline points="23,36 31,36 34,31" />
          <polyline points="77,36 69,36 66,31" />
        </g>
      )}
      {facePattern === 'scales' && (
        <g fill={detailColor} opacity="0.55">
          <polygon points="50,26 46,32 54,32" />
          <polygon points="42,30 39,34 45,34" />
          <polygon points="58,30 55,34 61,34" />
        </g>
      )}

      {/* 5. EYES */}
      {eyeStyle === 'confident' && (
        <g>
          <circle cx="36" cy="45" r="5" fill="#0f172a" />
          <circle cx="38" cy="43.5" r="1.8" fill="#ffffff" />
          <circle cx="64" cy="45" r="5" fill="#0f172a" />
          <circle cx="66" cy="43.5" r="1.8" fill="#ffffff" />
          <path d="M 30 38 Q 36 36 42 39" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M 58 39 Q 64 36 70 38" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </g>
      )}
      {eyeStyle === 'sparkle' && (
        <g>
          <circle cx="36" cy="45" r="5.8" fill="#0f172a" />
          <circle cx="34.5" cy="43" r="2.2" fill="#ffffff" />
          <circle cx="38" cy="47" r="1.1" fill="#ffffff" />
          <circle cx="64" cy="45" r="5.8" fill="#0f172a" />
          <circle cx="62.5" cy="43" r="2.2" fill="#ffffff" />
          <circle cx="66" cy="47" r="1.1" fill="#ffffff" />
        </g>
      )}
      {eyeStyle === 'happy' && (
        <g>
          <circle cx="36" cy="45" r="4.8" fill="#0f172a" />
          <circle cx="37.5" cy="43.5" r="1.7" fill="#ffffff" />
          <circle cx="64" cy="45" r="4.8" fill="#0f172a" />
          <circle cx="65.5" cy="43.5" r="1.7" fill="#ffffff" />
        </g>
      )}
      {eyeStyle === 'cool' && (
        <g>
          <ellipse cx="36" cy="45" rx="5.2" ry="4" fill="#0f172a" />
          <circle cx="37.5" cy="44" r="1.5" fill="#ffffff" />
          <ellipse cx="64" cy="45" rx="5.2" ry="4" fill="#0f172a" />
          <circle cx="65.5" cy="44" r="1.5" fill="#ffffff" />
          <line x1="30" y1="40" x2="42" y2="40" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="58" y1="40" x2="70" y2="40" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
      {eyeStyle === 'fierce' && (
        <g>
          <circle cx="36" cy="46" r="4.8" fill="#0f172a" />
          <circle cx="37" cy="44.5" r="1.6" fill="#fde047" />
          <circle cx="64" cy="46" r="4.8" fill="#0f172a" />
          <circle cx="65" cy="44.5" r="1.6" fill="#fde047" />
          <line x1="29" y1="38" x2="42" y2="42" stroke="#0f172a" strokeWidth="2.8" strokeLinecap="round" />
          <line x1="71" y1="38" x2="58" y2="42" stroke="#0f172a" strokeWidth="2.8" strokeLinecap="round" />
        </g>
      )}
      {eyeStyle === 'wise' && (
        <g>
          <circle cx="36" cy="45" r="6.5" fill="#ffffff" stroke="#fbbf24" strokeWidth="2" />
          <circle cx="36" cy="45" r="3.4" fill="#0f172a" />
          <circle cx="64" cy="45" r="6.5" fill="#ffffff" stroke="#fbbf24" strokeWidth="2" />
          <circle cx="64" cy="45" r="3.4" fill="#0f172a" />
          <line x1="42.5" y1="45" x2="57.5" y2="45" stroke="#fbbf24" strokeWidth="2" />
        </g>
      )}
      {eyeStyle === 'visor' && (
        <g>
          <rect x="24" y="39" width="52" height="12" rx="6" fill="#0f172a" stroke={detailColor} strokeWidth="2" />
          <line x1="29" y1="43" x2="45" y2="43" stroke={detailColor} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="65" cy="45" r="2.5" fill={detailColor} />
        </g>
      )}
      {eyeStyle === 'robo' && (
        <g>
          <rect x="27" y="38" width="46" height="14" rx="5" fill="#0f172a" />
          <circle cx="38" cy="45" r="4" fill={detailColor} />
          <circle cx="62" cy="45" r="4" fill={detailColor} />
        </g>
      )}

      {/* 6. MOUTH / SNOUT / BEAK / MUSTACHE */}
      {mouthStyle === 'snout' && (
        <g>
          <polygon points="46,52 54,52 50,57" fill="#0f172a" />
          <path d="M 43 60 Q 50 65 57 60" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </g>
      )}
      {mouthStyle === 'whiskers' && (
        <g>
          <polygon points="47,52 53,52 50,56" fill="#f43f5e" />
          <path d="M 44 58 Q 47 62 50 58 Q 53 62 56 58" stroke="#0f172a" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}
      {mouthStyle === 'smirk' && (
        <path d="M 43 59 Q 51 63 59 56" stroke="#0f172a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      )}
      {mouthStyle === 'grin' && (
        <path d="M 41 56 Q 50 66 59 56 Z" fill="#0f172a" />
      )}
      {mouthStyle === 'beak' && (
        <polygon points="44,51 56,51 50,62" fill="#f59e0b" stroke="#b45309" strokeWidth="1.2" />
      )}
      {mouthStyle === 'fangs' && (
        <g>
          <path d="M 40 58 Q 50 63 60 58" stroke="#0f172a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <polygon points="42,58 45,64 47,59" fill="#ffffff" />
          <polygon points="58,58 55,64 53,59" fill="#ffffff" />
        </g>
      )}
      {mouthStyle === 'mustache' && (
        <g>
          <path
            d="M 50 56 Q 40 52 33 59 Q 42 62 50 58 Q 58 62 67 59 Q 60 52 50 56 Z"
            fill="#1e293b"
          />
        </g>
      )}
      {mouthStyle === 'robo_grille' && (
        <g>
          <rect x="38" y="56" width="24" height="7" rx="3" fill="#0f172a" />
          <line x1="44" y1="56" x2="44" y2="63" stroke={detailColor} strokeWidth="1.6" />
          <line x1="50" y1="56" x2="50" y2="63" stroke={detailColor} strokeWidth="1.6" />
          <line x1="56" y1="56" x2="56" y2="63" stroke={detailColor} strokeWidth="1.6" />
        </g>
      )}

      {/* 7. HEADGEAR FLAIR OVERLAY */}
      {renderFlairSvg(flair)}
    </svg>
  );
}

// ============================================================================
// 3D CHARACTERS (Blender renders, scripts/assets/build_avatars.py)
// ============================================================================

/** Sprite strips: 4 frames side by side (open, blink, happy, wink). `s/` holds the half-size set. */
const AVATAR_3D_BASE = '/avatars3d/';
const SMALL_3D_SIZES: ReadonlySet<PlayerAvatarSize> = new Set(['xs', 'sm', 'md']);

export function character3DUrl(id: string, size: PlayerAvatarSize): string {
  return `${AVATAR_3D_BASE}${SMALL_3D_SIZES.has(size) ? 's/' : ''}${id}.webp`;
}

export function flair3DUrl(flair: FlairId, size: PlayerAvatarSize): string {
  return `${AVATAR_3D_BASE}${SMALL_3D_SIZES.has(size) ? 's/' : ''}flair_${flair}.webp`;
}

const Character3D: React.FC<{
  ch: CharacterAvatarDefinition;
  flair: FlairId;
  size: PlayerAvatarSize;
  mood: 'idle' | 'happy';
}> = ({ ch, flair, size, mood }) => {
  const [failed, setFailed] = useState(false);
  // Each avatar gets its own rhythm so a table of 35 never blinks in unison.
  const seed = useMemo(() => Math.random(), []);

  if (failed) {
    return (
      <span className="w-[88%] h-[88%] block">{renderCharacterSvg(ch, flair)}</span>
    );
  }

  const style = {
    '--gc-av-dur': `${(8 + seed * 4).toFixed(2)}s`,
    '--gc-av-delay': `-${(seed * 12).toFixed(2)}s`,
    '--gc-av-bob-delay': `-${(seed * 3.4).toFixed(2)}s`,
  } as React.CSSProperties;

  return (
    <span
      className={`gc-av3d ${size === 'xs' ? 'gc-av3d-clip' : 'gc-av3d-pop'} ${seed < 0.35 ? 'gc-av3d-alt' : ''} ${
        mood === 'happy' ? 'gc-av3d-happy' : ''
      }`}
      style={style}
      data-character={ch.id}
    >
      <span className="gc-av3d-bob">
        <span className="gc-av3d-frames">
          <img
            src={character3DUrl(ch.id, size)}
            alt=""
            draggable={false}
            decoding="async"
            onError={() => setFailed(true)}
          />
        </span>
        {flair !== 'none' && (
          <img className="gc-av3d-flair" src={flair3DUrl(flair, size)} alt="" draggable={false} decoding="async" />
        )}
      </span>
    </span>
  );
};

function renderFlairSvg(flair: FlairId) {
  if (flair === 'none') return null;

  if (flair === 'crown') {
    return (
      <g>
        <polygon
          points="30,25 34,9 43,18 50,6 57,18 66,9 70,25"
          fill="#fbbf24"
          stroke="#b45309"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="17" r="2.4" fill="#ef4444" />
        <circle cx="39" cy="19" r="1.8" fill="#38bdf8" />
        <circle cx="61" cy="19" r="1.8" fill="#34d399" />
      </g>
    );
  }

  if (flair === 'tophat') {
    return (
      <g>
        <rect x="26" y="21" width="48" height="5" rx="2.5" fill="#0f172a" />
        <rect x="34" y="4" width="32" height="18" rx="3" fill="#1e293b" />
        <rect x="34" y="16" width="32" height="4.5" fill="#f59e0b" />
      </g>
    );
  }

  if (flair === 'shades') {
    return (
      <g>
        <line x1="22" y1="43" x2="78" y2="43" stroke="#09090b" strokeWidth="3.2" />
        <rect x="26" y="40" width="20" height="11" rx="2" fill="#09090b" />
        <rect x="54" y="40" width="20" height="11" rx="2" fill="#09090b" />
        {/* Pixel deal-with-it shine */}
        <rect x="29" y="42" width="4" height="3" fill="#ffffff" />
        <rect x="33" y="45" width="4" height="3" fill="#ffffff" />
        <rect x="57" y="42" width="4" height="3" fill="#ffffff" />
        <rect x="61" y="45" width="4" height="3" fill="#ffffff" />
      </g>
    );
  }

  if (flair === 'halo') {
    return (
      <g>
        <ellipse
          cx="50"
          cy="11"
          rx="21"
          ry="5.5"
          fill="none"
          stroke="#fde047"
          strokeWidth="4"
        />
      </g>
    );
  }

  if (flair === 'wizard') {
    return (
      <g>
        <ellipse cx="50" cy="23" rx="28" ry="5" fill="#4c1d95" stroke="#fbbf24" strokeWidth="1.5" />
        <polygon points="32,23 52,2 68,23" fill="#5b21b6" />
        <circle cx="50" cy="15" r="2.3" fill="#fde047" />
      </g>
    );
  }

  if (flair === 'headset') {
    return (
      <g>
        <path
          d="M 18 48 A 32 30 0 0 1 82 48"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <rect x="12" y="39" width="9" height="18" rx="4.5" fill="#0284c7" stroke="#38bdf8" strokeWidth="1.5" />
        <rect x="79" y="39" width="9" height="18" rx="4.5" fill="#0284c7" stroke="#38bdf8" strokeWidth="1.5" />
      </g>
    );
  }

  if (flair === 'horns') {
    return (
      <g>
        <path d="M 28 24 Q 16 8 28 5 Q 32 14 38 22 Z" fill="#ef4444" />
        <path d="M 72 24 Q 84 8 72 5 Q 68 14 62 22 Z" fill="#ef4444" />
      </g>
    );
  }

  return null;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  value,
  size = 'md',
  animated = false,
  mood = 'idle',
  className = '',
}) => {
  const parsed = useMemo(() => parseAvatarString(value), [value]);
  const sz = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  // Legacy plain emoji without custom aura/flair
  const isPlainLegacyEmoji =
    parsed.kind === 'emoji' &&
    !(value || '').startsWith('emoji:') &&
    parsed.flair.id === 'none';

  const isCharacter = parsed.kind === 'character' && !!parsed.character;

  if (isPlainLegacyEmoji) {
    return (
      <span
        className={`inline-flex items-center justify-center leading-none select-none ${sz.emoji} ${className}`}
        aria-hidden="true"
      >
        {parsed.emoji}
      </span>
    );
  }

  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full shrink-0 select-none ${
        isCharacter ? '' : 'overflow-hidden'
      } ${sz.box} ${
        animated ? 'transition-transform duration-gc-base hover:scale-105' : ''
      } ${className}`}
      style={{
        background: parsed.aura.bgGradient,
        boxShadow: `inset 0 0 0 2px ${parsed.aura.ringColor}`,
      }}
      aria-hidden="true"
    >
      {parsed.kind === 'character' && parsed.character ? (
        <Character3D ch={parsed.character} flair={parsed.flair.id} size={size} mood={mood} />
      ) : (
        <span className="relative flex items-center justify-center w-full h-full">
          <span className={`${sz.emoji} leading-none filter drop-shadow-sm`}>
            {parsed.emoji}
          </span>
          {parsed.flair.id !== 'none' && (
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 w-full h-full pointer-events-none"
              aria-hidden="true"
            >
              {renderFlairSvg(parsed.flair.id)}
            </svg>
          )}
        </span>
      )}
    </span>
  );
};

// ============================================================================
// WAYGROUND-STYLE HERO CHARACTER & AURA + FLAIR CUSTOMIZER PANEL
// ============================================================================

interface CharacterPickerPanelProps {
  value: string;
  onChange: (newAvatar: string) => void;
  playerName?: string;
  playSound?: (sound: SoundEffect) => void;
  /** Compact layout for student mobile phones */
  compact?: boolean;
}

export const CharacterPickerPanel: React.FC<CharacterPickerPanelProps> = ({
  value,
  onChange,
  playerName,
  playSound,
  compact = false,
}) => {
  const parsed = useMemo(() => parseAvatarString(value), [value]);
  const [activeCategory, setActiveCategory] = useState<CharacterCategoryId | 'all' | 'emoji'>('all');

  const currentAuraId: AuraId = parsed.aura.id;
  const currentFlairId: FlairId = parsed.flair.id;

  const filteredCharacters = useMemo(() => {
    if (activeCategory === 'all') return CHARACTER_AVATARS;
    if (activeCategory === 'emoji') return [];
    return CHARACTER_AVATARS.filter((c) => c.category === activeCategory);
  }, [activeCategory]);

  const handleSelectCharacter = (ch: CharacterAvatarDefinition) => {
    playSound?.('click');
    onChange(serializeCharacterAvatar(ch.id, currentAuraId, currentFlairId));
  };

  const handleSelectEmoji = (emoji: string) => {
    playSound?.('click');
    onChange(serializeEmojiAvatar(emoji, currentAuraId, currentFlairId));
  };

  const handleSelectAura = (auraId: AuraId) => {
    playSound?.('click');
    if (parsed.kind === 'character' && parsed.character) {
      onChange(serializeCharacterAvatar(parsed.character.id, auraId, currentFlairId));
    } else {
      onChange(serializeEmojiAvatar(parsed.emoji, auraId, currentFlairId));
    }
  };

  const handleSelectFlair = (flairId: FlairId) => {
    playSound?.('click');
    if (parsed.kind === 'character' && parsed.character) {
      onChange(serializeCharacterAvatar(parsed.character.id, currentAuraId, flairId));
    } else {
      onChange(serializeEmojiAvatar(parsed.emoji, currentAuraId, flairId));
    }
  };

  const handleSurpriseMe = () => {
    playSound?.('click');
    const next = getRandomCharacterAvatar([value], true);
    onChange(next);
  };

  return (
    <div className="space-y-3.5 text-left">
      {/* 1. HERO SPOTLIGHT STAGE */}
      <div className="p-3.5 rounded-gc bg-gc-line/[0.05] border border-gc-line/[0.14] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <PlayerAvatar value={value} size={compact ? 'lg' : 'xl'} animated />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gc-body font-bold text-gc-ink truncate">
                {parsed.kind === 'character' && parsed.character
                  ? parsed.character.name
                  : `Classic ${parsed.emoji}`}
              </span>
              {playerName && (
                <span className="text-gc-cap font-semibold text-gc-quiet truncate">
                  · {playerName}
                </span>
              )}
            </div>
            <p className="text-gc-small text-gc-quiet truncate">
              {parsed.kind === 'character' && parsed.character
                ? parsed.character.title
                : 'Classic Emoji Avatar'}
            </p>
            <p className="text-gc-cap text-gc-quiet/90 mt-0.5 truncate">
              Aura: <strong className="text-gc-ink">{parsed.aura.name}</strong> · Flair:{' '}
              <strong className="text-gc-ink">{parsed.flair.name}</strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSurpriseMe}
          className="h-11 px-3.5 rounded-full bg-gc-gold/15 hover:bg-gc-gold/25 border border-gc-gold/50 text-gc-small font-bold text-gc-ink inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          title="Randomize character, aura, and headgear flair"
        >
          <Dices className="w-4 h-4 text-gc-gold" aria-hidden="true" />
          <span>Surprise me</span>
        </button>
      </div>

      {/* 2. AURA + HEADGEAR FLAIR CUSTOMIZER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Aura Swatches */}
        <div className="p-2.5 rounded-gc-sm bg-gc-line/[0.04] border border-gc-line/[0.12] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-gc-cap font-bold text-gc-quiet">Backdrop Aura</span>
            <span className="text-gc-cap font-semibold text-gc-ink">{parsed.aura.name}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {AVATAR_AURAS.map((aura) => {
              const isSelected = aura.id === currentAuraId;
              return (
                <button
                  key={aura.id}
                  type="button"
                  onClick={() => handleSelectAura(aura.id)}
                  aria-label={`Aura ${aura.name}`}
                  aria-pressed={isSelected}
                  title={aura.name}
                  className={`w-11 h-11 rounded-full cursor-pointer transition-transform grid place-items-center ${
                    isSelected ? 'scale-110 ring-2 ring-white shadow-md' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{
                    background: aura.bgGradient,
                    border: `2px solid ${aura.ringColor}`,
                  }}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Headgear Flair Picker */}
        <div className="p-2.5 rounded-gc-sm bg-gc-line/[0.04] border border-gc-line/[0.12] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-gc-cap font-bold text-gc-quiet">Headgear Flair</span>
            <span className="text-gc-cap font-semibold text-gc-ink">{parsed.flair.name}</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {AVATAR_FLAIRS.map((flair) => {
              const isSelected = flair.id === currentFlairId;
              return (
                <button
                  key={flair.id}
                  type="button"
                  onClick={() => handleSelectFlair(flair.id)}
                  aria-label={`Flair ${flair.name}`}
                  aria-pressed={isSelected}
                  title={flair.name}
                  className={`h-11 rounded-md text-base grid place-items-center cursor-pointer transition-colors border ${
                    isSelected
                      ? 'bg-gc-gold/20 border-gc-gold text-gc-ink font-bold'
                      : 'bg-gc-line/[0.05] border-transparent text-gc-quiet hover:text-gc-ink hover:bg-gc-line/[0.12]'
                  }`}
                >
                  <span aria-hidden="true">{flair.icon}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. CATEGORY FILTER TABS */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="Character categories">
        {CHARACTER_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                playSound?.('click');
                setActiveCategory(cat.id);
              }}
              className={`h-11 px-3.5 rounded-full text-gc-cap font-bold whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors border ${
                isActive
                  ? 'bg-gc-gold/20 border-gc-gold text-gc-ink'
                  : 'bg-gc-line/[0.05] border-transparent text-gc-quiet hover:text-gc-ink hover:bg-gc-line/[0.1]'
              }`}
            >
              <span aria-hidden="true">{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4. CHARACTER ROSTER GRID */}
      {activeCategory === 'emoji' ? (
        <div
          className={`grid grid-cols-6 sm:grid-cols-8 gap-2 overflow-y-auto pr-1 modal-content-scroll ${
            compact ? 'max-h-[220px]' : 'max-h-[300px]'
          }`}
        >
          {AVATARS.map((em) => {
            const isSelected = parsed.kind === 'emoji' && parsed.emoji === em;
            return (
              <button
                key={em}
                type="button"
                onClick={() => handleSelectEmoji(em)}
                aria-label={`Emoji ${em}`}
                aria-pressed={isSelected}
                className={`h-11 rounded-gc-sm border grid place-items-center text-2xl cursor-pointer transition-all ${
                  isSelected
                    ? 'border-gc-gold bg-gc-gold/15 ring-2 ring-gc-gold/30'
                    : 'border-gc-line/[0.12] bg-gc-line/[0.04] hover:bg-gc-line/[0.1]'
                }`}
              >
                {em}
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className={`grid grid-cols-4 sm:grid-cols-5 gap-2 overflow-y-auto pr-1 modal-content-scroll ${
            compact ? 'max-h-[240px]' : 'max-h-[320px]'
          }`}
        >
          {filteredCharacters.map((ch) => {
            const isSelected = parsed.kind === 'character' && parsed.character?.id === ch.id;
            const previewAvatarStr = serializeCharacterAvatar(
              ch.id,
              isSelected ? currentAuraId : ch.defaultAura,
              isSelected ? currentFlairId : ch.defaultFlair
            );
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleSelectCharacter(ch)}
                aria-label={`${ch.name} — ${ch.title}`}
                aria-pressed={isSelected}
                title={`${ch.name} (${ch.title})`}
                className={`p-2 rounded-gc-sm border flex flex-col items-center gap-1.5 cursor-pointer transition-all relative ${
                  isSelected
                    ? 'border-gc-gold bg-gc-gold/15 ring-2 ring-gc-gold/30'
                    : 'border-gc-line/[0.12] bg-gc-line/[0.04] hover:border-gc-line/30 hover:bg-gc-line/[0.09]'
                }`}
              >
                <PlayerAvatar value={previewAvatarStr} size="md" />
                <span className="text-[11px] font-bold text-gc-ink truncate w-full text-center leading-tight">
                  {ch.name}
                </span>
                {isSelected && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gc-gold text-black text-[10px] font-bold grid place-items-center shadow">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlayerAvatar;
