import React, { forwardRef } from 'react';
import { twMerge } from '../utils/twMerge';

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(({ className, onWheel, ...rest }, ref) => {
  // Style A field: quiet fill, hairline border, gold focus ring.
  const baseClasses = "w-full bg-gc-line/[0.05] border border-gc-line/[0.2] rounded-gc-sm px-4 py-2.5 text-gc-ink placeholder:text-gc-quiet/70 focus:outline-none focus:border-gc-gold focus:ring-2 focus:ring-gc-gold/30 transition-colors duration-gc-fast font-sans";
  
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