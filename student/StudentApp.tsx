import React, { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import StudentControllerView from '../components/StudentControllerView';
import type { SoundEffect } from '../types';
import { safeLocalStorage } from '../utils/safeStorage';
import {
  clampVolume,
  createSoundEngine,
  DEFAULT_SFX_VOLUME,
  SFX_MUTED_STORAGE_KEY,
  SFX_VOLUME_STORAGE_KEY,
} from '../utils/soundEngine';

/**
 * The phone app on its own (package S1). A phone that opens a room link (?room=CODE) loads only
 * this and what it needs, not the teacher's screen, the 3D table or the offline sentence bank.
 * It keeps the same theme, sound and motion settings the full app gives the phone screen.
 */

const THEME_KEY = 'grammar_casino_theme';

const soundEngine = createSoundEngine(clampVolume(safeLocalStorage.getItem(SFX_VOLUME_STORAGE_KEY), DEFAULT_SFX_VOLUME));

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
}

export default function StudentApp({ initialRoomCode, onExit }: { initialRoomCode: string; onExit: () => void }) {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => safeLocalStorage.getItem(THEME_KEY) !== 'light');
  const isMuted = safeLocalStorage.getItem(SFX_MUTED_STORAGE_KEY) === 'true';

  useEffect(() => {
    applyTheme(isDarkMode);
  }, [isDarkMode]);

  // Same as the full app on this device: Calm mode and projector mode as last chosen here.
  useEffect(() => {
    document.documentElement.classList.toggle('gc-calm', safeLocalStorage.getItem('grammar_casino_calm_mode') === 'on');
    document.documentElement.classList.toggle('projector', safeLocalStorage.getItem('grammar_casino_projector_mode') === 'on');
  }, []);

  // Browsers keep audio locked until the first tap.
  useEffect(() => {
    const unlock = () => soundEngine.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const playSound = useCallback(
    (sound: SoundEffect, ...args: any[]) => {
      if (isMuted || !soundEngine.isSupported()) return;
      soundEngine.play(sound, ...args);
    },
    [isMuted]
  );

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      safeLocalStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      return next;
    });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <StudentControllerView
        initialRoomCode={initialRoomCode}
        playSound={playSound}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        onExitStudentMode={onExit}
      />
    </MotionConfig>
  );
}
