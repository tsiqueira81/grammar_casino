import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge keeps the last of two conflicting classes. It has to be told about
// our own design-token names (tailwind.config.js), or it would read text-gc-small as
// a text colour and drop it next to text-gc-ink, and miss that rounded-gc-sm replaces rounded-lg.
export const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['gc-cap', 'gc-small', 'gc-body', 'gc-lead', 'gc-title', 'gc-display', 'gc-sentence'] }],
      rounded: [{ rounded: ['gc-sm', 'gc', 'gc-lg'] }],
      shadow: [{ shadow: ['gc-1', 'gc-2'] }],
    },
  },
});
