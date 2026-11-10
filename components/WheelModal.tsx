import React, { useState, useRef, useEffect } from 'react';
import { Player, SoundEffect, WheelItem } from '../types';
import { WHEEL_ITEMS } from '../constants';
import ActionButton from './ActionButton';
import PowerUpTooltip from './PowerUpTooltip';
import { PlayerAvatar } from './PlayerAvatar';

interface WheelModalProps {
  player: Player;
  onClose: () => void;
  onApplyResult: (item: WheelItem) => void;
  playSound: (sound: SoundEffect) => void;
  /** When set (phones in a room), the wheel lands on this prize, which the host already drew. */
  forcedItemId?: string | null;
}

export const WheelModal: React.FC<WheelModalProps> = ({
  player,
  onClose,
  onApplyResult,
  playSound,
  forcedItemId,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [hasSpun, setHasSpun] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [flapperTilt, setFlapperTilt] = useState(0);
  const [activeStudIndex, setActiveStudIndex] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<WheelItem | null>(null);
  const [showOddsList, setShowOddsList] = useState(false);
  const wheelRef = useRef<SVGGElement>(null);
  const rafRef = useRef<number | null>(null);

  const numSlices = WHEEL_ITEMS.length; // 10
  const sliceAngle = 360 / numSlices; // 36 deg
  const studStepDeg = 18; // 20 brass studs around the rim

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleSpin = () => {
    if (isSpinning || hasSpun) return;

    playSound('click');
    setIsSpinning(true);
    setSelectedItem(null);

    // Pick random target slice (0 to 9)
    const forcedIndex = forcedItemId ? WHEEL_ITEMS.findIndex(w => w.id === forcedItemId) : -1;
    const targetIndex = forcedIndex >= 0 ? forcedIndex : Math.floor(Math.random() * numSlices);
    const targetItem = WHEEL_ITEMS[targetIndex];

    // Jitter inside slice (avoid landing right on the divider)
    const jitter = (Math.random() - 0.5) * (sliceAngle * 0.55);

    // Calculate rotation so targetIndex lands at pointer (12 o'clock = 270 deg)
    const sliceCenterAngle = targetIndex * sliceAngle + sliceAngle / 2;
    const targetOffset = (270 - sliceCenterAngle + 360) % 360;

    // Minimum 6 full revolutions (6 * 360 = 2160 deg) plus extra to land on target
    const startRotation = rotation;
    const currentBase = Math.floor(startRotation / 360) * 360;
    const extraSpins = 360 * 6;
    const finalRotation = currentBase + extraSpins + targetOffset + jitter;
    const totalDelta = finalRotation - startRotation;

    const durationMs = 4250;
    const startTime = performance.now();
    let lastPegSlot = Math.floor(startRotation / studStepDeg);
    let currentFlapperDeflection = 0;

    // Quintic ease-out matching a heavy brass roulette wheel
    const easeOutWheel = (t: number) => 1 - Math.pow(1 - t, 4.2);

    const stepPhysics = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, Math.max(0, elapsed / durationMs));
      const eased = easeOutWheel(t);
      const currentAngle = startRotation + totalDelta * eased;

      setRotation(currentAngle);

      // Detect every time a brass stud (every 18 deg) strikes the 12 o'clock flapper
      const currentPegSlot = Math.floor(currentAngle / studStepDeg);
      if (currentPegSlot > lastPegSlot) {
        lastPegSlot = currentPegSlot;
        const speedFactor = Math.max(0.28, 1 - t * 0.72);
        currentFlapperDeflection = -32 * speedFactor;
        setActiveStudIndex(((currentPegSlot % 20) + 20) % 20);
        playSound('wheelTick');
      } else {
        // Spring return of the leather flapper
        currentFlapperDeflection *= 0.82;
        if (Math.abs(currentFlapperDeflection) < 0.4) currentFlapperDeflection = 0;
      }
      setFlapperTilt(currentFlapperDeflection);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(stepPhysics);
      } else {
        setFlapperTilt(0);
        setActiveStudIndex(null);
        setIsSpinning(false);
        setHasSpun(true);
        setSelectedItem(targetItem);

        if (targetItem.type === 'positive') {
          playSound('win');
        } else {
          playSound('lose');
        }
      }
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(stepPhysics);
  };

  const handleClaim = () => {
    if (!selectedItem) return;
    playSound('powerUp');
    onApplyResult(selectedItem);
    onClose();
  };

  // Helper to create SVG pie slice path
  const createSlicePath = (index: number, radius: number = 175) => {
    const startAngle = index * sliceAngle;
    const endAngle = (index + 1) * sliceAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = 200 + radius * Math.cos(startRad);
    const y1 = 200 + radius * Math.sin(startRad);
    const x2 = 200 + radius * Math.cos(endRad);
    const y2 = 200 + radius * Math.sin(endRad);

    return `M 200 200 L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-3 md:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border-2 border-amber-400/80 rounded-2xl p-6 md:p-8 max-w-xl w-full text-center shadow-2xl relative my-auto border-t-4">
        
        {/* Header Badge */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <PlayerAvatar value={player.avatar} size="md" className="ring-2 ring-amber-400/70" />
            <div className="text-left">
              <h2 className="text-xl md:text-2xl font-sans font-black text-amber-900 dark:text-amber-400 uppercase tracking-wide">
                The Wheel of Fortune
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {player.name}'s fate hangs in the balance
              </p>
            </div>
          </div>
          
          <button
            onClick={() => setShowOddsList(!showOddsList)}
            className="text-xs font-sans font-bold text-amber-700 dark:text-amber-400 hover:underline px-2.5 py-1 rounded bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-slate-700"
            title="Toggle odds breakdown"
          >
            {showOddsList ? 'Hide Odds' : 'View 10 Odds'}
          </button>
        </div>

        {/* Odds Overview Drawer (Optional View) */}
        {showOddsList && (
          <div className="mb-4 p-3 bg-amber-50/80 dark:bg-slate-800/80 rounded-xl border border-amber-200 dark:border-slate-700 text-left text-xs max-h-48 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <span>✨</span> 5 Fortunes (50%)
                </div>
                <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                  {WHEEL_ITEMS.filter(i => i.type === 'positive').map(item => (
                    <li key={item.id} className="flex items-center gap-1.5 truncate">
                      <PowerUpTooltip icon={item.icon} name={item.name} description={item.description} placement="top">
                        <span className="cursor-help hover:scale-125 transition-transform inline-block">{item.icon}</span>
                      </PowerUpTooltip>
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">({item.shortDesc})</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <span>☠️</span> 5 Misfortunes (50%)
                </div>
                <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                  {WHEEL_ITEMS.filter(i => i.type === 'negative').map(item => (
                    <li key={item.id} className="flex items-center gap-1.5 truncate">
                      <PowerUpTooltip icon={item.icon} name={item.name} description={item.description} placement="top">
                        <span className="cursor-help hover:scale-125 transition-transform inline-block">{item.icon}</span>
                      </PowerUpTooltip>
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-rose-600 dark:text-rose-400">({item.shortDesc})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* The Wheel Stage */}
        <div className="relative flex justify-center items-center my-4 select-none">
          {/* Physically Deflecting Top Brass & Leather Flapper Needle */}
          <div
            style={{
              transformOrigin: '50% 10px',
              transform: `rotate(${flapperTilt}deg)`,
            }}
            className="absolute -top-3.5 z-30 flex flex-col items-center pointer-events-none filter drop-shadow-[0_6px_8px_rgba(0,0,0,0.65)]"
          >
            <div className="w-7 h-7 bg-gradient-to-b from-amber-200 via-amber-400 to-amber-700 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] font-black text-amber-950">
              ▼
            </div>
            <div className="w-0 h-0 border-l-[11px] border-l-transparent border-r-[11px] border-r-transparent border-t-[22px] border-t-amber-500 -mt-1.5"></div>
          </div>

          {/* SVG Wheel Container */}
          <div className="w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96 relative">
            <svg
              viewBox="0 0 400 400"
              className="w-full h-full filter drop-shadow-2xl overflow-visible"
            >
              {/* Outer 3D Beveled Golden Casing Rim */}
              <circle
                cx="200"
                cy="200"
                r="196"
                fill="none"
                stroke="#78350f"
                strokeWidth="16"
              />
              <circle
                cx="200"
                cy="200"
                r="194"
                fill="none"
                stroke="url(#goldGradient)"
                strokeWidth="12"
              />
              <circle
                cx="200"
                cy="200"
                r="188"
                fill="none"
                stroke="#fef08a"
                strokeWidth="2"
                opacity="0.85"
              />
              
              {/* Spinning Wheel Group (Slices + Rim Studs) */}
              <g
                ref={wheelRef}
                style={{
                  transformOrigin: '200px 200px',
                  transform: `rotate(${rotation}deg)`,
                }}
              >
                {/* Casino Decorative Brass Studs that strike the flapper */}
                {Array.from({ length: 20 }).map((_, i) => {
                  const angle = (i * 18 * Math.PI) / 180;
                  const studX = 200 + 191 * Math.cos(angle);
                  const studY = 200 + 191 * Math.sin(angle);
                  const isGlowing = activeStudIndex === i;
                  return (
                    <circle
                      key={i}
                      cx={studX}
                      cy={studY}
                      r={isGlowing ? '5' : '3.8'}
                      fill={isGlowing ? '#ffffff' : i % 2 === 0 ? '#fef08a' : '#f59e0b'}
                      stroke="#451a03"
                      strokeWidth="1.2"
                    />
                  );
                })}
                {WHEEL_ITEMS.map((item, index) => {
                  const midAngle = index * sliceAngle + sliceAngle / 2;
                  const rad = (midAngle * Math.PI) / 180;
                  const iconRadius = 126;
                  const textRadius = 88;
                  const iconX = 200 + iconRadius * Math.cos(rad);
                  const iconY = 200 + iconRadius * Math.sin(rad);
                  const textX = 200 + textRadius * Math.cos(rad);
                  const textY = 200 + textRadius * Math.sin(rad);

                  return (
                    <g key={item.id}>
                      {/* Segment Slice */}
                      <path
                        d={createSlicePath(index, 185)}
                        fill={item.color}
                        stroke="#fef08a"
                        strokeWidth="1.5"
                      />

                      {/* Small Type Indicator (+ or -) */}
                      <circle
                        cx={200 + 168 * Math.cos(rad)}
                        cy={200 + 168 * Math.sin(rad)}
                        r="8"
                        fill={item.type === 'positive' ? '#15803d' : '#991b1b'}
                        stroke="#ffffff"
                        strokeWidth="1"
                      />
                      <text
                        x={200 + 168 * Math.cos(rad)}
                        y={200 + 168 * Math.sin(rad) + 3}
                        fontSize="9"
                        fontWeight="bold"
                        fill="#ffffff"
                        textAnchor="middle"
                      >
                        {item.type === 'positive' ? '+' : '–'}
                      </text>

                      {/* Icon */}
                      <text
                        x={iconX}
                        y={iconY + 5}
                        fontSize="20"
                        textAnchor="middle"
                        transform={`rotate(${midAngle + 90}, ${iconX}, ${iconY})`}
                      >
                        {item.icon}
                      </text>

                      {/* Short Label */}
                      <text
                        x={textX}
                        y={textY + 4}
                        fontSize="11"
                        fontWeight="bold"
                        fill="#ffffff"
                        textAnchor="middle"
                        transform={`rotate(${midAngle + 90}, ${textX}, ${textY})`}
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                      >
                        {item.shortDesc}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* Center Hub Overlay */}
              <circle
                cx="200"
                cy="200"
                r="46"
                fill="url(#goldGradient)"
                stroke="#ca8a04"
                strokeWidth="4"
                className="filter drop-shadow-lg"
              />
              <circle
                cx="200"
                cy="200"
                r="38"
                fill="#0f172a"
                stroke="#fef08a"
                strokeWidth="2"
              />
              <text
                x="200"
                y="196"
                fontSize="18"
                textAnchor="middle"
                className="pointer-events-none select-none"
              >
                🎡
              </text>
              <text
                x="200"
                y="214"
                fontSize="10"
                fontWeight="900"
                fill="#ca8a04"
                textAnchor="middle"
                letterSpacing="1"
                className="pointer-events-none select-none font-sans"
              >
                WHEEL
              </text>

              {/* SVG Gradients */}
              <defs>
                <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fef08a" />
                  <stop offset="50%" stopColor="#ca8a04" />
                  <stop offset="100%" stopColor="#854d0e" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Result Reveal Card */}
        {selectedItem && !isSpinning && (
          <div
            className={`p-4 rounded-xl border-2 mb-5 animate-scaleUp transition-all ${
              selectedItem.type === 'positive'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-950 dark:text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.25)]'
            }`}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <PowerUpTooltip icon={selectedItem.icon} name={selectedItem.name} description={selectedItem.description} placement="top">
                <span className="text-3xl cursor-help hover:scale-125 transition-transform inline-block">{selectedItem.icon}</span>
              </PowerUpTooltip>
              <span className="text-lg font-sans font-black uppercase tracking-wider">
                {selectedItem.type === 'positive' ? 'Fortune Smiles!' : 'Misfortune Strikes!'}
              </span>
            </div>
            <div className="text-xl font-bold font-sans mb-1 text-slate-900 dark:text-white">
              {selectedItem.name} ({selectedItem.shortDesc})
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
              {selectedItem.description}
            </p>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex justify-center gap-4">
          {!hasSpun ? (
            <button
              onClick={handleSpin}
              disabled={isSpinning}
              className={`px-8 py-3.5 rounded-xl font-sans text-lg font-black uppercase tracking-widest transition-all duration-200 transform shadow-xl flex items-center gap-3 ${
                isSpinning
                  ? 'bg-slate-400 text-slate-200 cursor-not-allowed opacity-75'
                  : 'cursor-pointer bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 hover:scale-105 active:scale-95 border-2 border-amber-300'
              }`}
            >
              <span>🎡</span>
              <span>{isSpinning ? 'Spinning...' : 'SPIN THE WHEEL!'}</span>
            </button>
          ) : (
            <ActionButton
              onClick={handleClaim}
              playSound={playSound}
              variant={selectedItem?.type === 'positive' ? 'gold' : 'danger'}
              className="px-8 py-3.5 text-lg font-black uppercase tracking-wider shadow-lg"
            >
              Claim Outcome & Continue
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default WheelModal;
