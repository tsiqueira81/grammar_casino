import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import ActionButton from './ActionButton';
import { SoundEffect } from '../types';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  playSound?: (sound: SoundEffect) => void;
  closable?: boolean;
  hideCloseButton?: boolean;
  hideOkButton?: boolean;
  maxWidth?: string;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children, playSound, closable = true, hideCloseButton = false, hideOkButton = false, maxWidth = 'max-w-lg' }) => {
  const handleClose = () => {
    if (closable) {
      if (playSound) playSound('click');
      onClose();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (closable && e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, closable, playSound]);

  const handleBackdropClick = () => {
    handleClose();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex justify-center items-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <motion.div 
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ type: 'spring', damping: 28, stiffness: 340 }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`gc-panel rounded-gc-lg w-full ${maxWidth} m-4 overflow-hidden max-h-[90vh] flex flex-col relative`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 border-b border-gc-line/[0.12] flex justify-between items-center gap-4">
          <h2 className="text-gc-title font-bold text-gc-ink">{title}</h2>
          {closable && !hideCloseButton && (
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="w-10 h-10 shrink-0 rounded-full bg-gc-line/[0.06] hover:bg-gc-line/[0.12] text-gc-quiet hover:text-gc-ink grid place-items-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="p-6 text-gc-ink overflow-y-auto modal-content-scroll">
          {children}
        </div>
        {closable && !hideOkButton && (
          <div className="px-6 py-4 border-t border-gc-line/[0.12] flex justify-end">
              <ActionButton onClick={onClose} playSound={playSound} variant="primary" className="h-12 px-8 text-gc-body">
                  OK
              </ActionButton>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default Modal;

