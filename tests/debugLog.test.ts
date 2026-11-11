import { beforeEach, describe, expect, it } from 'vitest';
import { APP_VERSION, LOG_LIMIT, clearLog, crashDetails, formatLog, getLog, logEvent } from '../utils/debugLog';
import { hotkeyAction } from '../utils/hotkeys';

describe('debug log (package A4)', () => {
  beforeEach(() => clearLog());

  it('keeps only the last 500 events', () => {
    for (let i = 0; i < LOG_LIMIT + 20; i++) logEvent('info', `event ${i}`, i);
    const log = getLog();
    expect(log.length).toBe(LOG_LIMIT);
    expect(log[0].message).toBe('event 20');
    expect(log[log.length - 1].message).toBe(`event ${LOG_LIMIT + 19}`);
  });

  it('returns the last few events on request', () => {
    ['a', 'b', 'c'].forEach((m) => logEvent('step', m));
    expect(getLog(2).map((e) => e.message)).toEqual(['b', 'c']);
  });

  it('formats one line per event under the version', () => {
    logEvent('room', 'Seat 2 disconnected', new Date(2026, 0, 1, 9, 5, 7).getTime());
    const text = formatLog();
    expect(text.split('\n')[0]).toBe(`Grammar Casino ${APP_VERSION}`);
    expect(text).toContain('09:05:07 [room] Seat 2 disconnected');
  });

  it('crash details hold the error and at most 50 events', () => {
    for (let i = 0; i < 80; i++) logEvent('info', `e${i}`);
    const text = crashDetails(new Error('boom'), '\n    at Table');
    expect(text).toContain('Error: boom');
    expect(text).toContain('at Table');
    expect(text).toContain('e79');
    expect(text).not.toContain('e29\n');
    expect(text.split('\n').filter((l) => / \[info\] /.test(l)).length).toBe(50);
  });

  it('cuts very long messages', () => {
    logEvent('info', 'x'.repeat(1000));
    expect(getLog()[0].message.length).toBe(300);
  });

  it('is "dev" outside a build', () => {
    expect(APP_VERSION).toBe('dev');
  });
});

describe('Shift+L opens the log', () => {
  it('Shift+L is the log; plain L still reads aloud', () => {
    expect(hotkeyAction({ key: 'L', shiftKey: true })).toBe('debug-log');
    expect(hotkeyAction({ key: 'l' })).toBe('read');
    expect(hotkeyAction({ key: 'L', shiftKey: true, targetTag: 'INPUT' })).toBeNull();
  });
});
