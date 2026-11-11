import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptic, hapticPattern, hapticsEnabled, setHapticsEnabled } from '../utils/haptics';

describe('haptics (package S4)', () => {
  afterEach(() => {
    setHapticsEnabled(true);
    vi.unstubAllGlobals();
  });

  it('is on by default and remembers being turned off', () => {
    expect(hapticsEnabled()).toBe(true);
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
  });

  it('vibrates with the pattern for the moment, unless turned off', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    haptic('win');
    expect(vibrate).toHaveBeenCalledWith(hapticPattern('win'));
    setHapticsEnabled(false);
    haptic('lose');
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('does nothing where the browser cannot vibrate (iOS Safari)', () => {
    vi.stubGlobal('navigator', {});
    expect(() => haptic('lock')).not.toThrow();
  });
});
