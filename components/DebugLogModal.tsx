import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { APP_VERSION, LOG_LIMIT, formatLog, getLog, onLogChange } from '../utils/debugLog';
import type { SoundEffect } from '../types';

/** Package A4: the host's debug log (Shift+L). It stays in this tab unless the teacher downloads it. */
export const DebugLogModal: React.FC<{ onClose: () => void; playSound?: (s: SoundEffect) => void }> = ({ onClose, playSound }) => {
  const [entries, setEntries] = useState(getLog);
  useEffect(() => onLogChange(() => setEntries(getLog())), []);

  const download = () => {
    playSound?.('click');
    const url = URL.createObjectURL(new Blob([formatLog(entries)], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `grammar-casino-log-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Modal title="Debug log" onClose={onClose} playSound={playSound} maxWidth="max-w-2xl">
      <p className="text-gc-small text-gc-quiet mb-3">
        The last {LOG_LIMIT} things the game did, kept only on this computer. If something goes wrong in class, download this file and send it with your report.
        Version <span data-testid="app-version">{APP_VERSION}</span>.
      </p>
      <div data-testid="debug-log" className="max-h-[50vh] overflow-auto rounded-gc-sm bg-gc-line/[0.05] border border-gc-line/[0.1] p-3 font-mono text-[12px] leading-relaxed text-gc-ink">
        {entries.length === 0 ? (
          <p className="m-0 text-gc-quiet">Nothing logged yet.</p>
        ) : (
          entries
            .slice()
            .reverse()
            .map((e, i) => (
              <div key={`${e.at}-${i}`}>
                <span className="text-gc-quiet tabular-nums">{new Date(e.at).toLocaleTimeString()}</span> <span className="font-bold">{e.kind}</span> {e.message}
              </div>
            ))
        )}
      </div>
      <button
        type="button"
        onClick={download}
        className="mt-3 min-h-[44px] px-4 rounded-gc-sm bg-gc-gold text-black font-bold cursor-pointer"
      >
        Download the log
      </button>
    </Modal>
  );
};
