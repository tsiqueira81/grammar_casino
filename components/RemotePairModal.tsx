// Package T3: pairing the teacher's own phone as a remote. The QR code stays hidden until the
// teacher asks for it, because this screen is usually on the projector and anyone who scans the
// code could run the game. A link works for one phone only.
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Smartphone, X } from 'lucide-react';
import { useFocusTrap } from '../utils/useFocusTrap';

interface RemotePairModalProps {
  /** The one-time link, while it waits for a phone. Null when there is none yet, or it is used. */
  link: string | null;
  paired: boolean;
  roomLocked: boolean;
  onMakeLink: () => void;
  onUnpair: () => void;
  onClose: () => void;
}

const btn =
  'h-11 px-4 rounded-full border border-gc-line/[0.2] bg-gc-line/[0.05] hover:border-gc-line/40 text-gc-small font-bold text-gc-ink transition-colors cursor-pointer inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-turn';
const primaryBtn =
  'h-12 px-6 rounded-full bg-gc-gold text-gc-on-gold text-gc-body font-bold cursor-pointer inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-ink';

export const RemotePairModal: React.FC<RemotePairModalProps> = ({ link, paired, roomLocked, onMakeLink, onUnpair, onClose }) => {
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    setShowQr(false);
    if (!link) {
      setQr('');
      return;
    }
    QRCode.toDataURL(link, { width: 240, margin: 2, color: { dark: '#051a0f', light: '#fffdf7' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [link]);

  const copy = () => {
    if (!link) return;
    void navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-gc-fade" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Teacher remote"
        data-testid="remote-pair"
        data-remote-url={link || undefined}
        className="gc-panel rounded-gc-lg max-w-md w-full p-5 sm:p-6 relative max-h-[92vh] overflow-y-auto text-left space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-gc-small text-gc-quiet">Run the game from anywhere in the room</p>
            <h2 className="font-logo text-gc-title font-bold text-gc-ink">Teacher remote</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 shrink-0 rounded-full bg-gc-line/[0.06] hover:bg-gc-line/[0.12] text-gc-quiet hover:text-gc-ink grid place-items-center cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {paired ? (
          <>
            <p className="text-gc-body text-gc-ink" data-testid="remote-paired">
              <Smartphone className="inline w-5 h-5 mr-1 text-gc-win" aria-hidden="true" />
              Your phone is the remote. It shows the answer and who has not locked in yet, and its buttons do what this screen offers at that moment.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={onUnpair}>
                Unpair this phone
              </button>
            </div>
          </>
        ) : link ? (
          <>
            <p className="text-gc-body text-gc-ink">
              Open this link on <strong>your own phone</strong>. It works for one phone only.
            </p>
            {roomLocked && <p className="text-gc-small text-gc-loss">The room is locked. Open it for a moment so your phone can join.</p>}
            {showQr ? (
              qr ? (
                <img src={qr} alt="QR code for the teacher remote" className="w-56 h-56 mx-auto rounded-gc bg-white p-1.5" />
              ) : (
                <p className="text-gc-small text-gc-quiet">Making the QR code…</p>
              )
            ) : (
              <div className="gc-surface rounded-gc p-3 text-gc-small text-gc-quiet">
                Anyone who scans this code can run the game. If this screen is on the projector, freeze or turn off the projector first.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {!showQr && (
                <button type="button" className={primaryBtn} onClick={() => setShowQr(true)} data-testid="remote-show-qr">
                  Show the QR code
                </button>
              )}
              <button type="button" className={btn} onClick={copy}>
                {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy the link'}
              </button>
              <button type="button" className={btn} onClick={onUnpair}>
                Cancel the link
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-gc-body text-gc-ink">
              Your phone joins the room as a remote, not as a player. It sees the answer, who is still deciding and who is away, and has big buttons to reveal, deal, pause and read aloud.
            </p>
            <button type="button" className={primaryBtn} onClick={onMakeLink} data-testid="remote-make-link">
              <Smartphone className="w-5 h-5" aria-hidden="true" />
              Make a remote link
            </button>
          </>
        )}
      </div>
    </div>
  );
};
