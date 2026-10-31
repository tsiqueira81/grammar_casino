import React from 'react';

// A number that counts from `from` to `to` once, after `delayMs`.
// Devices that ask for less motion see the final number straight away.
interface CountUpProps {
  from: number;
  to: number;
  delayMs?: number;
  durationMs?: number;
  format?: (n: number) => string;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CountUp: React.FC<CountUpProps> = ({ from, to, delayMs = 0, durationMs = 800, format = n => n.toLocaleString() }) => {
  const [value, setValue] = React.useState(() => (from === to || prefersReducedMotion() ? to : from));

  React.useEffect(() => {
    if (from === to || prefersReducedMotion()) {
      setValue(to);
      return;
    }
    setValue(from);
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const timer = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, delayMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [from, to, delayMs, durationMs]);

  return <>{format(value)}</>;
};

export default CountUp;
