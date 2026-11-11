import React, { useMemo } from 'react';

interface ThemeAmbienceProps {
  theme: string;
  calmMode?: boolean;
}

type ThemeMood = 'fantasy' | 'scifi' | 'popculture' | 'history' | 'tech' | 'business' | 'everyday';

function resolveThemeMood(theme: string): ThemeMood {
  const lower = (theme || '').toLowerCase();
  if (lower.includes('fantasy') || lower.includes('magic') || lower.includes('dragon')) return 'fantasy';
  if (lower.includes('sci-fi') || lower.includes('space') || lower.includes('future')) return 'scifi';
  if (lower.includes('pop culture') || lower.includes('movie') || lower.includes('music')) return 'popculture';
  if (lower.includes('history') || lower.includes('ancient')) return 'history';
  if (lower.includes('tech') || lower.includes('cyber')) return 'tech';
  if (lower.includes('business') || lower.includes('finance')) return 'business';
  return 'everyday';
}

export const ThemeAmbience: React.FC<ThemeAmbienceProps> = ({ theme, calmMode = false }) => {
  const mood = useMemo(() => resolveThemeMood(theme), [theme]);

  if (calmMode) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none opacity-65 dark:opacity-85 transition-opacity duration-gc-slow"
      aria-hidden="true"
    >
      {mood === 'popculture' && (
        <>
          {/* Dual stage premiere spotlights */}
          <div
            className="absolute -top-24 left-[12%] w-72 h-[38rem] rounded-full blur-3xl opacity-20 dark:opacity-25 animate-pulse"
            style={{
              background: 'radial-gradient(ellipse at top, rgba(253, 224, 71, 0.55), transparent 70%)',
              transform: 'rotate(18deg)',
            }}
          />
          <div
            className="absolute -top-24 right-[12%] w-72 h-[38rem] rounded-full blur-3xl opacity-20 dark:opacity-25 animate-pulse"
            style={{
              background: 'radial-gradient(ellipse at top, rgba(244, 114, 182, 0.45), transparent 70%)',
              transform: 'rotate(-18deg)',
              animationDelay: '1.2s',
            }}
          />
        </>
      )}

      {mood === 'scifi' && (
        <>
          {/* Subtle holographic horizon glow */}
          <div
            className="absolute -top-32 left-1/2 -translate-x-1/2 w-[52rem] h-72 rounded-full blur-3xl opacity-20 dark:opacity-30"
            style={{
              background: 'radial-gradient(circle, rgba(56, 189, 248, 0.45) 0%, rgba(168, 85, 247, 0.15) 55%, transparent 75%)',
            }}
          />
        </>
      )}

      {mood === 'fantasy' && (
        <>
          {/* Warm arcane candlelight aura */}
          <div
            className="absolute -top-20 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 dark:opacity-25"
            style={{
              background: 'radial-gradient(circle, rgba(251, 191, 36, 0.5) 0%, rgba(217, 119, 6, 0.15) 60%, transparent 80%)',
            }}
          />
          <div
            className="absolute bottom-0 right-1/4 w-96 h-80 rounded-full blur-3xl opacity-15 dark:opacity-20"
            style={{
              background: 'radial-gradient(circle, rgba(52, 211, 153, 0.35) 0%, transparent 75%)',
            }}
          />
        </>
      )}

      {mood === 'tech' && (
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[48rem] h-64 rounded-full blur-3xl opacity-15 dark:opacity-25"
          style={{
            background: 'radial-gradient(circle, rgba(45, 212, 191, 0.4) 0%, rgba(59, 130, 246, 0.15) 60%, transparent 80%)',
          }}
        />
      )}

      {(mood === 'history' || mood === 'business' || mood === 'everyday') && (
        <div
          className="absolute -top-28 left-1/2 -translate-x-1/2 w-[48rem] h-64 rounded-full blur-3xl opacity-15 dark:opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(241, 207, 114, 0.4) 0%, transparent 75%)',
          }}
        />
      )}
    </div>
  );
};

export default ThemeAmbience;
