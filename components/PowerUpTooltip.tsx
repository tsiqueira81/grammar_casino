import React, { useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { PowerUpKey } from '../types';
import { POWER_UPS } from '../constants';

interface PowerUpTooltipProps {
  powerUpKey?: PowerUpKey;
  name?: string;
  icon?: string;
  description?: string;
  targetName?: string;
  children?: React.ReactNode;
  className?: string;
  placement?: 'top' | 'bottom';
  asSpan?: boolean;
  statusBadge?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}

export const PowerUpTooltip: React.FC<PowerUpTooltipProps> = ({
  powerUpKey,
  name: propName,
  icon: propIcon,
  description: propDescription,
  targetName,
  children,
  className = '',
  placement = 'top',
  asSpan = false,
  statusBadge,
  onClick,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const powerUp = powerUpKey ? POWER_UPS[powerUpKey] : null;
  const name = propName || powerUp?.name || '';
  const icon = propIcon || powerUp?.icon || '✨';
  const description = propDescription || powerUp?.description || '';

  const tooltipTitle = `${name ? `${name}: ` : ''}${description}${targetName ? ` (Target: ${targetName})` : ''}`;

  const positionClasses = placement === 'bottom'
    ? 'top-full mt-2'
    : 'bottom-full mb-2';

  const arrowClasses = placement === 'bottom'
    ? 'bottom-full border-b-[6px] border-b-slate-900 dark:border-b-black border-t-0'
    : 'top-full border-t-[6px] border-t-slate-900 dark:border-t-black border-b-0';

  const Component = asSpan ? 'span' : 'div';

  return (
    <Component
      className={twMerge('relative inline-flex items-center justify-center', className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      onClick={onClick}
      title={tooltipTitle}
    >
      {children || (
        <span className="cursor-help text-base filter drop-shadow-sm hover:scale-125 transition-transform select-none">
          {icon}
        </span>
      )}

      {/* Hover Tooltip Popup */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 ${positionClasses} z-50 pointer-events-none transition-all duration-200 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
        style={{ display: isVisible ? 'block' : 'none' }}
        role="tooltip"
      >
        <div className="w-56 max-w-[85vw] p-2.5 rounded-lg bg-slate-900/95 dark:bg-black/95 text-slate-100 border border-amber-400/50 shadow-2xl backdrop-blur-md text-left">
          <div className="flex items-center gap-1.5 border-b border-amber-500/30 pb-1.5 mb-1.5">
            <span className="text-base">{icon}</span>
            <span className="font-serif font-bold text-xs text-amber-400 tracking-wide truncate">
              {name}
            </span>
          </div>

          {targetName && (
            <div className="text-[10px] uppercase font-bold text-sky-400 mb-1 tracking-wider">
              🎯 Target: {targetName}
            </div>
          )}

          <p className="text-[11px] text-slate-200 dark:text-slate-300 leading-snug font-sans">
            {description}
          </p>

          {statusBadge && (
            <div className="mt-2 pt-1.5 border-t border-amber-500/20 text-[10px]">
              {statusBadge}
            </div>
          )}
        </div>

        {/* Triangle Arrow */}
        <div
          className={`w-0 h-0 border-x-[6px] border-x-transparent absolute left-1/2 -translate-x-1/2 ${arrowClasses}`}
        />
      </div>
    </Component>
  );
};

export default PowerUpTooltip;
