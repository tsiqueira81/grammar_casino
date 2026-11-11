import React, { useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import TextInput from './TextInput';
import {
  SAVED_DECKS_KEY,
  addSavedDeck,
  deckFromFile,
  deckSummary,
  deckToFile,
  parseDeckText,
  parseSavedDecks,
  type SavedDeck,
} from '../game/teacherDeck';
import { safeLocalStorage } from '../utils/safeStorage';
import type { SoundEffect } from '../types';

const EXAMPLE = `She goes to school every day.
She go to school every day. -> She goes to school every day.
I have lived here _____ 2010. [since]
I have lived here _____ two years. [for | since, during, while]
The children laughed _____. (HAPPY) [happily]`;

function loadSaved(): SavedDeck[] {
  return parseSavedDecks(safeLocalStorage.getItem(SAVED_DECKS_KEY));
}

/** Package L4: the teacher's own sentences, dealt first and in order. */
export const OwnDeckModal: React.FC<{
  initialText: string;
  initialName: string;
  onUse: (text: string, name: string) => void;
  onClose: () => void;
  playSound?: (s: SoundEffect) => void;
}> = ({ initialText, initialName, onUse, onClose, playSound }) => {
  const [text, setText] = useState(initialText);
  const [name, setName] = useState(initialName || 'My deck');
  const [saved, setSaved] = useState<SavedDeck[]>(loadSaved);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseDeckText(text), [text]);

  const persist = (list: SavedDeck[]) => {
    setSaved(list);
    safeLocalStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(list));
  };

  const saveHere = () => {
    playSound?.('click');
    persist(addSavedDeck(saved, { name, text, savedAt: Date.now() }));
    setNotice(`Saved "${name.trim() || 'My deck'}" on this computer.`);
  };

  const download = () => {
    playSound?.('click');
    const url = URL.createObjectURL(new Blob([deckToFile({ name, text, savedAt: Date.now() })], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name.trim() || 'deck').replace(/[^\w-]+/g, '_')}.grammar-deck.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    const deck = deckFromFile(await file.text());
    if (!deck) {
      setNotice('That file is not a Grammar Casino deck.');
      return;
    }
    setText(deck.text);
    setName(deck.name);
    setNotice(`Opened "${deck.name}".`);
  };

  const btn = 'min-h-[44px] px-4 rounded-gc-sm font-semibold cursor-pointer border border-gc-line/[0.16] bg-gc-line/[0.05] text-gc-ink hover:border-gc-line/30';

  return (
    <Modal title="Your own sentences" onClose={onClose} playSound={playSound} maxWidth="max-w-2xl" hideOkButton>
      <p className="text-gc-small text-gc-quiet mb-2">
        One sentence per line. They are dealt first, in this order; after them the game goes on with its own sentences.
        For a mistake, write the sentence, then <b>-&gt;</b> and the correction. For a gap, write _____ and the answer in [brackets].
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={EXAMPLE}
        aria-label="Your sentences, one per line"
        data-testid="own-deck-text"
        rows={9}
        className="w-full rounded-gc-sm bg-gc-line/[0.05] border border-gc-line/[0.2] px-3 py-2 font-mono text-[14px] text-gc-ink focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30"
      />
      <p className="mt-2 mb-1 text-gc-body font-semibold text-gc-ink" data-testid="own-deck-summary" role="status">
        {deckSummary(parsed.items)}
      </p>
      {parsed.problems.length > 0 && (
        <ul className="m-0 mb-2 pl-5 text-gc-small text-gc-danger space-y-0.5" data-testid="own-deck-problems">
          {parsed.problems.slice(0, 8).map((p) => (
            <li key={p.line}>
              Line {p.line} is left out: {p.problem}.
            </li>
          ))}
          {parsed.problems.length > 8 && <li>And {parsed.problems.length - 8} more.</li>}
        </ul>
      )}
      {!text.trim() && (
        <button type="button" className="text-gc-small underline underline-offset-4 text-gc-quiet min-h-[44px] cursor-pointer" onClick={() => setText(EXAMPLE)}>
          Show me an example
        </button>
      )}

      <div className="mt-3 grid sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} aria-label="Deck name" maxLength={60} className="h-11" />
        <button type="button" className={btn} onClick={saveHere} disabled={!parsed.items.length}>
          Save on this computer
        </button>
        <button type="button" className={btn} onClick={download} disabled={!parsed.items.length}>
          Download to share
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
          Open a deck file
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void openFile(e.target.files?.[0])} />
        {notice && <span className="text-gc-small text-gc-quiet" role="status">{notice}</span>}
      </div>

      {saved.length > 0 && (
        <div className="mt-4">
          <div className="text-gc-small font-bold text-gc-quiet mb-1">Saved on this computer</div>
          <ul className="m-0 p-0 list-none space-y-1">
            {saved.map((d) => (
              <li key={d.name} className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate text-gc-body text-gc-ink">{d.name}</span>
                <button type="button" className={btn} onClick={() => { playSound?.('click'); setText(d.text); setName(d.name); }}>
                  Open
                </button>
                <button
                  type="button"
                  className={btn}
                  aria-label={`Delete ${d.name}`}
                  onClick={() => { playSound?.('click'); persist(saved.filter((x) => x.name !== d.name)); }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className={btn} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => { playSound?.('click'); onUse(text, name); }}
          className="min-h-[44px] px-5 rounded-gc-sm bg-gc-gold text-black font-bold cursor-pointer"
        >
          {parsed.items.length ? `Use ${parsed.items.length} sentence${parsed.items.length === 1 ? '' : 's'}` : 'Use no own sentences'}
        </button>
      </div>
    </Modal>
  );
};
