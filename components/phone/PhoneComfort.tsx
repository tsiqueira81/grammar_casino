// The phone's comfort settings panel (package S6; moved out of StudentControllerView, F7).
import { safeLocalStorage } from '../../utils/safeStorage';
import React from 'react';
import { canVibrate, setHapticsEnabled } from '../../utils/haptics';
import { Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { SFX_MUTED_STORAGE_KEY } from '../../utils/soundEngine';
import { TEXT_SIZES, type StudentPrefs } from '../../utils/studentPrefs';

export interface PhoneComfortProps {
  showComfort: boolean;
  setShowComfort: React.Dispatch<React.SetStateAction<boolean>>;
  soundOn: boolean;
  setSoundOn: React.Dispatch<React.SetStateAction<boolean>>;
  vibrationOn: boolean;
  setVibrationOn: React.Dispatch<React.SetStateAction<boolean>>;
  comfort: StudentPrefs;
  setComfort: React.Dispatch<React.SetStateAction<StudentPrefs>>;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export function PhoneComfort({
  showComfort,
  setShowComfort,
  soundOn,
  setSoundOn,
  vibrationOn,
  setVibrationOn,
  comfort,
  setComfort,
  isDarkMode,
  onToggleTheme,
}: PhoneComfortProps) {

  return (
    <>
      {showComfort && (
        <div className="w-full max-w-xl mx-auto px-4 pt-3 animate-gc-slide-up" data-testid="comfort-panel">
          <div className="gc-surface rounded-gc-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gc-small font-bold text-gc-ink">On this phone</span>
              <button
                type="button"
                onClick={() => setShowComfort(false)}
                className="h-11 px-4 rounded-full text-gc-small font-bold text-gc-on-gold bg-gc-gold cursor-pointer"
              >
                Done
              </button>
            </div>
            {([
              {
                key: 'sound', label: 'Sound', on: soundOn,
                toggle: () => { const next = !soundOn; setSoundOn(next); safeLocalStorage.setItem(SFX_MUTED_STORAGE_KEY, next ? 'false' : 'true'); },
                icon: soundOn ? <Volume2 className="w-[18px] h-[18px]" aria-hidden="true" /> : <VolumeX className="w-[18px] h-[18px]" aria-hidden="true" />,
              },
              ...(canVibrate() ? [{
                key: 'vibration', label: 'Vibration', on: vibrationOn,
                toggle: () => { setHapticsEnabled(!vibrationOn); setVibrationOn(!vibrationOn); },
                icon: null,
              }] : []),
              { key: 'font', label: 'Plain font for the sentence', on: comfort.plainFont, toggle: () => setComfort((c) => ({ ...c, plainFont: !c.plainFont })), icon: null },
              { key: 'motion', label: 'Less motion', on: comfort.lessMotion, toggle: () => setComfort((c) => ({ ...c, lessMotion: !c.lessMotion })), icon: null },
              { key: 'dark', label: 'Dark theme', on: isDarkMode, toggle: onToggleTheme, icon: isDarkMode ? <Moon className="w-[18px] h-[18px]" aria-hidden="true" /> : <Sun className="w-[18px] h-[18px]" aria-hidden="true" /> },
            ]).map((row) => (
              <button
                key={row.key}
                type="button"
                role="switch"
                aria-checked={row.on}
                onClick={row.toggle}
                className="w-full min-h-[48px] flex items-center justify-between gap-3 px-3 rounded-gc-sm bg-gc-line/[0.05] text-left cursor-pointer"
              >
                <span className="inline-flex items-center gap-2 text-gc-body font-semibold text-gc-ink">{row.icon}{row.label}</span>
                <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${row.on ? 'bg-gc-win' : 'bg-gc-line/[0.2]'}`} aria-hidden="true">
                  <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${row.on ? 'translate-x-5' : ''}`} />
                </span>
              </button>
            ))}
            <div className="flex items-center justify-between gap-3 px-3 min-h-[48px] rounded-gc-sm bg-gc-line/[0.05]">
              <span className="text-gc-body font-semibold text-gc-ink" id="comfort-text-size">Text size</span>
              <div className="inline-flex p-1 rounded-full bg-gc-line/[0.07]" role="group" aria-labelledby="comfort-text-size">
                {TEXT_SIZES.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    aria-pressed={comfort.textSize === size.id}
                    onClick={() => setComfort((c) => ({ ...c, textSize: size.id }))}
                    className={`h-9 px-3 rounded-full text-gc-small font-bold cursor-pointer ${comfort.textSize === size.id ? 'bg-gc-gold text-gc-on-gold' : 'text-gc-quiet'}`}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
