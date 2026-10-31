import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(({ className, onWheel, ...rest }, ref) => {
  const baseClasses = "w-full bg-amber-50/60 dark:bg-[#03170d]/90 border border-[#ca8a04]/60 dark:border-[#d4af37]/50 rounded-lg px-4 py-2.5 text-slate-900 dark:text-amber-50 placeholder-slate-400 dark:placeholder-amber-200/35 focus:outline-none focus:border-[#ca8a04] dark:focus:border-[#fef08a] focus:ring-2 focus:ring-[#ca8a04]/25 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_3px_8px_rgba(0,0,0,0.65)] transition-all duration-200 font-serif";
  
  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    // Prevent changing value on scroll for number inputs by removing focus
    if (rest.type === 'number') {
        e.currentTarget.blur();
    }
    if (onWheel) {
        onWheel(e);
    }
  };

  return (
    <input
      ref={ref}
      className={twMerge(baseClasses, className)}
      onWheel={handleWheel}
      {...rest}
    />
  );
});

TextInput.displayName = 'TextInput';

export default TextInput;