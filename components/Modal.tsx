import React, { useEffect } from 'react';
import { motion } from 'motion/react';
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
      className="fixed inset-0 bg-black/75 dark:bg-black/85 backdrop-blur-md flex justify-center items-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <motion.div 
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className={`bg-gradient-to-b from-[#fffdf9] to-[#f5efe2] dark:from-[#082616] dark:to-[#03140b] border-2 border-[#d4af37]/80 rounded-2xl w-full ${maxWidth} m-4 overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_30px_rgba(212,175,55,0.2)] max-h-[90vh] flex flex-col relative`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle inner gold hairline */}
        <div className="pointer-events-none absolute inset-1.5 border border-[#d4af37]/20 rounded-xl z-20" />

        <div className="bg-gradient-to-r from-amber-100/80 via-amber-50/90 to-amber-100/80 dark:from-[#04180d] dark:via-[#0b2e1b] dark:to-[#04180d] px-6 py-4 border-b border-[#d4af37]/40 flex justify-between items-center relative">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#fef08a] to-transparent opacity-70"></div>
          <div className="flex items-center gap-2.5">
            <span className="text-[#d4af37] text-sm select-none">♦</span>
            <h2 className="text-xl sm:text-2xl font-serif font-extrabold text-gold uppercase tracking-widest">{title}</h2>
          </div>
          {closable && !hideCloseButton && (
            <button onClick={handleClose} className="w-8 h-8 rounded-full border border-[#d4af37]/30 hover:border-[#d4af37] bg-black/5 dark:bg-black/40 text-amber-800 dark:text-[#fef08a] flex items-center justify-center text-xl transition-all hover:scale-105 cursor-pointer leading-none">&times;</button>
          )}
        </div>
        <div className="p-6 text-slate-800 dark:text-slate-100 overflow-y-auto modal-content-scroll">
          {children}
        </div>
        {closable && !hideOkButton && (
          <div className="px-6 py-4 bg-amber-100/40 dark:bg-[#03120a]/80 border-t border-[#d4af37]/30 flex justify-end">
              <ActionButton onClick={onClose} playSound={playSound} variant="gold" className="px-8">
                  Continue
              </ActionButton>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default Modal;

