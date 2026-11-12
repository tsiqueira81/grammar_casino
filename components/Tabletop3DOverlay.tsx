import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BUDGET, FrameGuard, TIER_SETTINGS, type QualityTier } from '../show/quality';
import { POT_CENTER, POT_CHIP_CAP, potSlot } from '../show/pot';
import type { PowerUpFlightEvent } from '../show/flight';
import { TOTEM_NODES, totemScreenPoint, totemsFor, type TotemKind } from '../show/totems';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Is WebGL drawn in software here (SwiftShader, llvmpipe, Microsoft Basic Render Driver)? */
export function isSoftwareRenderer(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(name);
  } catch {
    return false;
  }
}

export interface Seat3DState {
  playerId: number;
  seatIndex: number;
  totalSeats: number;
  hasShield: boolean;
  isFrozen: boolean;
  winStreak: number;
}

export interface ChipTossEvent {
  id: string;
  playerId: number;
  seatIndex: number;
  totalSeats: number;
  amountDelta: number;
}

export interface PotSweepEvent {
  id: string;
  winnerSeatIndices: number[];
  totalSeats: number;
  /** The winners' player ids, so the pot can fly to their own cards on screen. */
  winnerPlayerIds?: number[];
}

/** Package V4: a power-up card is dealt from the shoe to this player. */
export interface ShoeDealEvent {
  id: string;
  playerId: number;
  seatIndex: number;
  totalSeats: number;
}

export interface BoomerangArcEvent {
  id: string;
  attackerSeatIndex: number;
  defenderSeatIndex: number;
  totalSeats: number;
}

/** A shower of spinning gold coins (big wins, game over). intensity is 0..1. */
export interface JackpotEvent {
  id: string;
  intensity: number;
}

export interface Tabletop3DOverlayProps {
  active: boolean;
  calmMode: boolean;
  /** Package V1: how much the table draws. 'off' draws nothing. */
  quality?: QualityTier;
  /** Called when the frame-rate guard steps down, or the graphics card drops the table. */
  onQualityChange?: (tier: QualityTier, reason: string) => void;
  projectorMode?: boolean;
  seatStates?: Seat3DState[];
  tossEvent: ChipTossEvent | null;
  sweepEvent: PotSweepEvent | null;
  boomerangEvent: BoomerangArcEvent | null;
  shoeEvent?: ShoeDealEvent | null;
  /** Package V4: a targeted power-up flies from one player to another. */
  flightEvent?: PowerUpFlightEvent | null;
  jackpotEvent?: JackpotEvent | null;
  onChipImpactSound?: (denomination: number) => void;
  /** Package V3: every bet still on the table this hand. 0 clears the pot. */
  potTotal?: number;
  /** Package V8: the theme's spark colours (gold by default). */
  sparkPalette?: number[];
  /** Table view: the chips are drawn on the felt under the game screens (which let the felt show through). */
  behindInterface?: boolean;
}

interface RigidChipBody {
  mesh: THREE.Object3D;
  baseScale: number;
  denomination: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  settled: boolean;
  settledTime: number;
  bounces: number;
  sweeping: boolean;
  sweepStart?: THREE.Vector3;
  sweepTarget?: THREE.Vector3;
  sweepProgress: number;
  sweepDelay: number;
  /** Euler's-disk wobble after landing: amplitude decays to 0. */
  wobble: number;
  wobblePhase: number;
  shadow?: THREE.Mesh;
  /** Package V3: rests on a pot pile until the payout, instead of fading away. */
  inPot?: boolean;
  /** The pile's slot on the felt and the height this chip rests at. */
  slot?: { x: number; z: number };
  floorY?: number;
}

interface DealtCard {
  mesh: THREE.Object3D;
  slideFrom: THREE.Vector3;
  arc: THREE.QuadraticBezierCurve3;
  elapsed: number;
  scale: number;
  /** Package V4: the colours of the burst where the card lands (a targeted power-up). */
  palette?: number[];
}

interface SeatTotem {
  mesh: THREE.Object3D;
  playerId: number;
  kind: TotemKind;
  index: number;
  count: number;
  /** 0..1 pop-in progress. */
  pop: number;
  scale: number;
}

interface FallingCoin {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  spin: THREE.Vector3;
  delay: number;
  life: number;
  bounced: boolean;
}

interface ActiveBoomerangFlight {
  mesh: THREE.Object3D;
  outCurve: THREE.QuadraticBezierCurve3;
  backCurve: THREE.QuadraticBezierCurve3;
  elapsed: number;
  duration: number;
  trailTimer: number;
}

const MAX_SPARKS = 420;
const GOLD_PALETTE = [0xffe08a, 0xf5c542, 0xfff6d5, 0xffb347];
// Package V4: the card shoe on the far rail, right of the dealer tray, and the deal timing.
const SHOE_POSITION = { x: 1.25, y: 0.02, z: -2.35, turn: -0.35 };
const SHOE_SCALE = 0.42;
const CARD_SCALE = 0.62;
const DEAL_SLIDE_SEC = 0.25;
const DEAL_FLY_SEC = 0.6;
const DEAL_FADE_SEC = 0.18;
const MAX_COINS = 72;

/** Soft round sprite used for sparkles and contact shadows. */
function makeRadialTexture(inner: string, outer: string): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Computes a seat's 3D world position on a semi-circular arc around the table
 * for transient chip tosses, pot sweeps, and Boomerang flights.
 */
function getSeatWorldPosition(seatIndex: number, totalSeats: number): THREE.Vector3 {
  const count = Math.max(1, totalSeats);
  if (count === 1) {
    return new THREE.Vector3(0, 0.15, 2.35);
  }
  const t = seatIndex / Math.max(1, count - 1);
  const angle = THREE.MathUtils.lerp(-Math.PI * 0.42, Math.PI * 0.42, t);
  const radiusX = 3.2;
  const radiusZ = 2.3;
  return new THREE.Vector3(
    Math.sin(angle) * radiusX,
    0.15,
    Math.cos(angle) * radiusZ + 0.25
  );
}

/**
 * Package V2 step 3: where a player's tile or betting card is on screen, as a point on the table
 * plane, so a tossed chip leaves from that player. Null when the element is not on screen.
 */
export function seatPointFromScreen(
  rect: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
  camera: THREE.Camera,
  planeY = 0.15,
): THREE.Vector3 | null {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  if (rect.width <= 0 || cx < 0 || cy < 0 || cx > viewport.width || cy > viewport.height) return null;
  const ndc = new THREE.Vector2((cx / viewport.width) * 2 - 1, -(cy / viewport.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), hit)) return null;
  // Keep it on the table: a tile high on the screen still throws from the far rail, not the horizon.
  hit.x = THREE.MathUtils.clamp(hit.x, -4.2, 4.2);
  hit.z = THREE.MathUtils.clamp(hit.z, -2.6, 3.2);
  return hit;
}

/**
 * Breaks a wager amount into up to 5 transient 3D casino chips ($500, $100, $50, $25, $10).
 */
function decomposeBetIntoChips(amount: number): number[] {
  const clamped = Math.max(10, Math.min(5000, Math.abs(Math.round(amount))));
  const denoms = [500, 100, 50, 25, 10];
  const result: number[] = [];
  let remaining = clamped;

  for (const d of denoms) {
    while (remaining >= d && result.length < 5) {
      result.push(d);
      remaining -= d;
    }
  }
  if (result.length === 0) {
    result.push(10);
  }
  return result;
}

const CHIP_NODE_NAMES: Record<number, string> = {
  10: 'Chip_10',
  25: 'Chip_25',
  50: 'Chip_50',
  100: 'Chip_100',
  500: 'Chip_500',
};

const CHIP_FALLBACK_COLORS: Record<number, number> = {
  10: 0x1c5cd1,
  25: 0x149452,
  50: 0xd12429,
  100: 0x1f1f24,
  500: 0x7a2ec7,
};

export const Tabletop3DOverlay: React.FC<Tabletop3DOverlayProps> = ({
  active,
  calmMode,
  quality = 'medium',
  onQualityChange,
  tossEvent,
  sweepEvent,
  boomerangEvent,
  shoeEvent,
  flightEvent,
  jackpotEvent,
  seatStates,
  onChipImpactSound,
  potTotal = 0,
  behindInterface = false,
  sparkPalette,
}) => {
  const sparkPaletteRef = useRef<number[]>(GOLD_PALETTE);
  sparkPaletteRef.current = sparkPalette && sparkPalette.length ? sparkPalette : GOLD_PALETTE;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const impactCallbackRef = useRef(onChipImpactSound);
  impactCallbackRef.current = onChipImpactSound;
  const qualityCallbackRef = useRef(onQualityChange);
  qualityCallbackRef.current = onQualityChange;
  const off = !active || calmMode || quality === 'off';
  const tier = TIER_SETTINGS[quality === 'off' ? 'low' : quality];
  const tierRef = useRef(tier);
  tierRef.current = tier;
  // Shift+D: draw calls, triangles and texture memory against the budget (development overlay).
  const [budgetText, setBudgetText] = useState<string | null>(null);
  const showBudgetRef = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName || '';
      if (!e.shiftKey || e.key.toLowerCase() !== 'd' || /INPUT|TEXTAREA|SELECT/.test(tag)) return;
      showBudgetRef.current = !showBudgetRef.current;
      setBudgetText(showBudgetRef.current ? 'Waiting for the next animation' : null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    chipTemplates: Record<number, THREE.Object3D>;
    boomerangTemplate: THREE.Object3D;
    chips: RigidChipBody[];
    boomerangs: ActiveBoomerangFlight[];
    cardTemplate: THREE.Object3D | null;
    dealtCards: DealtCard[];
    lastProcessedShoeId: string | null;
    lastProcessedFlightId: string | null;
    lastProcessedTossId: string | null;
    lastProcessedSweepId: string | null;
    lastProcessedBoomerangId: string | null;
    lastProcessedJackpotId: string | null;
    spawnSparks: (at: THREE.Vector3, count: number, palette?: number[], speed?: number) => void;
    makeShadow: () => THREE.Mesh;
    coins: FallingCoin[];
    wake: () => void;
    totemTemplates: Partial<Record<TotemKind, THREE.Object3D>>;
    totems: Map<string, SeatTotem>;
    syncTotems: () => void;
  } | null>(null);
  const seatStatesRef = useRef(seatStates);
  seatStatesRef.current = seatStates;

  // Initialize Three.js WebGL scene & load `.glb` chip/boomerang models
  useEffect(() => {
    if (off) return;
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    camera.position.set(0, 6.2, 6.6);
    camera.lookAt(0, 0.0, 0.25);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: tier.antialias,
        powerPreference: 'high-performance',
        // The pot rests between animations, so the browser must keep the last frame.
        preserveDrawingBuffer: true,
      });
    } catch {
      return;
    }
    // No 3D table on a computer that draws WebGL in software (no graphics acceleration, as
    // on some school PCs): building the scene there froze the whole screen for seconds after a
    // reload. The table is decoration only, so the game goes on without it.
    const force3d = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV) && new URLSearchParams(window.location.search).get('force3d') === '1';
    if (isSoftwareRenderer(renderer) && !force3d) {
      renderer.dispose();
      qualityCallbackRef.current?.('off', 'software graphics');
      return;
    }
    // A lost graphics context (driver reset, too many tabs) turns the table off, never a blank screen.
    const onContextLost = (e: Event) => {
      e.preventDefault();
      qualityCallbackRef.current?.('off', 'graphics context lost');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    const guard = new FrameGuard(quality);
    let lastBudgetAt = 0;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Image-based lighting so lacquered chips and gold inlays pick up real reflections.
    // RoomEnvironment is procedural: nothing is downloaded.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmrem.dispose();

    // Warm casino lighting for transient 3D chips and Boomerang arcs
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const overheadLight = new THREE.DirectionalLight(0xfff3d1, 1.85);
    overheadLight.position.set(1.5, 7.5, 3.5);
    scene.add(overheadLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 0.9, 12);
    rimLight.position.set(-3.5, 2.6, -1.8);
    scene.add(rimLight);

    // Build fallback chip templates immediately
    const chipTemplates: Record<number, THREE.Object3D> = {};
    for (const denom of [10, 25, 50, 100, 500]) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.036, 32),
        new THREE.MeshStandardMaterial({
          color: CHIP_FALLBACK_COLORS[denom],
          roughness: 0.45,
          metalness: 0.1,
        })
      );
      const inlay = new THREE.Mesh(
        new THREE.TorusGeometry(0.11, 0.008, 10, 24),
        new THREE.MeshStandardMaterial({
          color: 0xe5b842,
          roughness: 0.25,
          metalness: 0.85,
        })
      );
      inlay.rotation.x = Math.PI / 2;
      inlay.position.y = 0.017;
      group.add(body, inlay);
      chipTemplates[denom] = group;
    }

    const boomerangFallback = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.045, 12, 24, Math.PI * 1.3),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.6,
        metalness: 0.6,
        roughness: 0.2,
      })
    );

    const stateObj = {
      scene,
      camera,
      renderer,
      chipTemplates,
      boomerangTemplate: boomerangFallback as THREE.Object3D,
      chips: [] as RigidChipBody[],
      boomerangs: [] as ActiveBoomerangFlight[],
      cardTemplate: null as THREE.Object3D | null,
      dealtCards: [] as DealtCard[],
      lastProcessedShoeId: null as string | null,
      lastProcessedFlightId: null as string | null,
      lastProcessedTossId: null as string | null,
      lastProcessedSweepId: null as string | null,
      lastProcessedBoomerangId: null as string | null,
      lastProcessedJackpotId: null as string | null,
      spawnSparks: (() => {}) as (at: THREE.Vector3, count: number, palette?: number[], speed?: number) => void,
      makeShadow: (() => new THREE.Mesh()) as () => THREE.Mesh,
      coins: [] as FallingCoin[],
      wake: () => {},
      totemTemplates: {} as Partial<Record<TotemKind, THREE.Object3D>>,
      totems: new Map<string, SeatTotem>(),
      syncTotems: () => {},
    };
    sceneRef.current = stateObj;

    // --- Contact shadows: a soft dark disc under every chip that shrinks and fades with height ---
    const shadowTexture = makeRadialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
    const shadowGeometry = new THREE.PlaneGeometry(0.5, 0.5);
    shadowGeometry.rotateX(-Math.PI / 2);
    stateObj.makeShadow = () => {
      const m = new THREE.Mesh(
        shadowGeometry,
        new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.8 })
      );
      m.position.y = 0.005;
      m.renderOrder = -1;
      scene.add(m);
      return m;
    };
    const updateShadow = (chip: RigidChipBody, visibility = 1) => {
      if (!chip.shadow) return;
      // Only the bottom chip of a pile casts the pile's shadow, or a tall pile would draw a black blot.
      if (chip.inPot && chip.settled && (chip.floorY ?? 0) > 0.03) visibility = 0;
      const h = Math.max(0, chip.position.y - 0.02);
      chip.shadow.position.set(chip.position.x, 0.005, chip.position.z);
      const spread = 1 + h * 0.9;
      chip.shadow.scale.setScalar(spread * (chip.mesh.scale.x / (chip.baseScale || 1)));
      (chip.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (0.85 / (1 + h * 2.2)) * visibility);
    };
    const removeChip = (index: number) => {
      const chip = stateObj.chips[index];
      scene.remove(chip.mesh);
      if (chip.shadow) {
        scene.remove(chip.shadow);
        (chip.shadow.material as THREE.Material).dispose();
      }
      stateObj.chips.splice(index, 1);
    };

    // --- Sparkle particles (additive, fade to black = invisible) ---
    const sparkPositions = new Float32Array(MAX_SPARKS * 3);
    const sparkColors = new Float32Array(MAX_SPARKS * 3);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));
    sparkGeometry.setDrawRange(0, 0);
    const sparkTexture = makeRadialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    const sparkMaterial = new THREE.PointsMaterial({
      size: 0.15,
      map: sparkTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const sparkPoints = new THREE.Points(sparkGeometry, sparkMaterial);
    sparkPoints.frustumCulled = false;
    scene.add(sparkPoints);
    type Spark = { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; c: THREE.Color };
    const sparks: Spark[] = [];
    stateObj.spawnSparks = (at, count, palette = sparkPaletteRef.current, speed = 1) => {
      for (let i = 0; i < count && sparks.length < Math.min(MAX_SPARKS, tierRef.current.maxSparks); i++) {
        const theta = Math.random() * Math.PI * 2;
        const up = 0.6 + Math.random() * 1.6;
        const out = (0.4 + Math.random() * 1.3) * speed;
        sparks.push({
          p: at.clone(),
          v: new THREE.Vector3(Math.cos(theta) * out, up * speed, Math.sin(theta) * out),
          life: 0,
          max: 0.45 + Math.random() * 0.5,
          c: new THREE.Color(palette[i % palette.length]),
        });
      }
      stateObj.wake();
    };

    // --- Jackpot coin shower (one draw call via InstancedMesh) ---
    const coinGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.016, 28);
    const coinMaterial = new THREE.MeshStandardMaterial({ color: 0xd9a93a, metalness: 1, roughness: 0.38, envMapIntensity: 0.75 });
    const coinMesh = new THREE.InstancedMesh(coinGeometry, coinMaterial, MAX_COINS);
    coinMesh.count = 0;
    coinMesh.frustumCulled = false;
    scene.add(coinMesh);
    const coinDummy = new THREE.Object3D();

    const loader = new GLTFLoader();

    loader.load(
      '/models/poker_chips.glb',
      (gltf) => {
        for (const [denomStr, nodeName] of Object.entries(CHIP_NODE_NAMES)) {
          const found = gltf.scene.getObjectByName(nodeName);
          if (found) {
            const clone = found.clone(true);
            clone.position.set(0, 0, 0);
            clone.scale.setScalar(0.32);
            stateObj.chipTemplates[Number(denomStr)] = clone;
          }
        }
      },
      undefined,
      () => {}
    );

    // Package V4: the dealer's card shoe sits on the far rail; power-up cards are dealt from it.
    loader.load(
      '/models/card_shoe.glb',
      (gltf) => {
        const shoe = gltf.scene.getObjectByName('DealerCardShoe');
        const card = gltf.scene.getObjectByName('PowerUpCard');
        if (shoe) {
          const s = shoe.clone(true);
          s.position.set(SHOE_POSITION.x, SHOE_POSITION.y, SHOE_POSITION.z);
          s.rotation.y = SHOE_POSITION.turn;
          s.scale.setScalar(SHOE_SCALE);
          scene.add(s);
          if (!running) renderer.render(scene, camera);
        }
        if (card) {
          const c = card.clone(true);
          c.position.set(0, 0, 0);
          stateObj.cardTemplate = c;
        }
      },
      undefined,
      () => {}
    );

    loader.load(
      '/models/powerup_totems.glb',
      (gltf) => {
        for (const kind of Object.keys(TOTEM_NODES) as TotemKind[]) {
          const node = gltf.scene.getObjectByName(TOTEM_NODES[kind].node);
          if (!node) continue;
          const t = node.clone(true);
          t.position.set(0, 0, 0);
          stateObj.totemTemplates[kind] = t;
        }
        stateObj.syncTotems();
        const boomerang = gltf.scene.getObjectByName('Totem_Boomerang');
        if (boomerang) {
          const c = boomerang.clone(true);
          c.position.set(0, 0, 0);
          c.scale.setScalar(0.55);
          stateObj.boomerangTemplate = c;
        }
      },
      undefined,
      () => {}
    );

    // 60fps transient physics loop (chips bounce, clink, and quickly fade/shrink away so UI is never blocked)
    let rafId = 0;
    const clock = new THREE.Clock();
    const GRAVITY = -15.5;
    const TABLE_Y = 0.024;
    const RESTITUTION = 0.38;
    const FRICTION = 0.84;
    const SETTLED_HOLD_SEC = 0.18;
    const SETTLED_FADE_SEC = 0.28;

    let running = false;
    // A chip resting on a pot pile is not work: the loop stops and the still frame stays.
    const resting = (c: RigidChipBody) => Boolean(c.inPot && c.settled && !c.sweeping && c.wobble <= 0.002);
    const hasWork = () =>
      stateObj.chips.some((c) => !resting(c)) ||
      [...stateObj.totems.values()].some((t) => t.pop < 1) || stateObj.dealtCards.length > 0 || stateObj.boomerangs.length > 0 || sparks.length > 0 || stateObj.coins.length > 0;

    // Render only while something is moving; an idle overlay costs nothing on the projector laptop.
    stateObj.wake = () => {
      if (running) return;
      running = true;
      clock.getDelta();
      rafId = requestAnimationFrame(animate);
    };

    const animate = () => {
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      // ?force3d=1 (development screenshots on software WebGL) keeps the chosen tier.
      const stepped = force3d ? null : guard.push(rawDt * 1000);
      if (stepped) {
        console.info(`[3D] Frame rate too low; table quality now ${stepped}.`);
        qualityCallbackRef.current?.(stepped, 'slow frames');
      }

      for (let i = stateObj.chips.length - 1; i >= 0; i--) {
        const chip = stateObj.chips[i];

        if (chip.sweeping && chip.sweepStart && chip.sweepTarget) {
          if (chip.sweepDelay > 0) {
            chip.sweepDelay -= dt;
            continue;
          }
          chip.sweepProgress = Math.min(1, chip.sweepProgress + dt * 2.2);
          const ease = 1 - Math.pow(1 - chip.sweepProgress, 3);
          chip.position.lerpVectors(chip.sweepStart, chip.sweepTarget, ease);
          chip.position.y += Math.sin(ease * Math.PI) * 0.45;
          chip.mesh.position.copy(chip.position);
          chip.mesh.rotation.y += dt * 7.0;

          // Shrink smoothly during the last 25% of the sweep so it vanishes cleanly at the seat
          if (chip.sweepProgress > 0.75) {
            const fadeOut = Math.max(0.001, 1 - (chip.sweepProgress - 0.75) / 0.25);
            chip.mesh.scale.setScalar(chip.baseScale * fadeOut);
          }

          updateShadow(chip, 1 - chip.sweepProgress);
          if (chip.sweepProgress >= 1) {
            // A small burst of gold where the winnings land
            if (Math.random() < 0.6) stateObj.spawnSparks(chip.position, 10, undefined, 0.8);
            removeChip(i);
          }
          continue;
        }

        if (chip.settled) {
          chip.settledTime += dt;
          if (chip.wobble > 0.002) {
            // Rolling wobble that speeds up as it dies away, like a real chip settling
            chip.wobblePhase += dt * (14 + (1 - chip.wobble / 0.35) * 30);
            chip.wobble *= Math.pow(0.012, dt);
            chip.mesh.rotation.x = Math.cos(chip.wobblePhase) * chip.wobble;
            chip.mesh.rotation.z = Math.sin(chip.wobblePhase) * chip.wobble;
          } else {
            chip.mesh.rotation.x = 0;
            chip.mesh.rotation.z = 0;
          }
          if (chip.settledTime > SETTLED_HOLD_SEC && !chip.inPot) {
            const fadeT = (chip.settledTime - SETTLED_HOLD_SEC) / SETTLED_FADE_SEC;
            if (fadeT >= 1) {
              removeChip(i);
              continue;
            }
            const scaleFactor = Math.max(0.001, 1 - fadeT * fadeT);
            chip.mesh.scale.setScalar(chip.baseScale * scaleFactor);
          }
          updateShadow(chip);
          continue;
        }

        // Integrate linear & angular velocity while airborne/bouncing
        chip.velocity.y += GRAVITY * dt;
        chip.position.addScaledVector(chip.velocity, dt);

        chip.mesh.rotation.x += chip.angularVelocity.x * dt;
        chip.mesh.rotation.y += chip.angularVelocity.y * dt;
        chip.mesh.rotation.z += chip.angularVelocity.z * dt;

        const floorY = chip.floorY ?? TABLE_Y;
        if (chip.position.y <= floorY && chip.velocity.y < 0) {
          chip.position.y = floorY;
          if (chip.slot) {
            // A pot chip drops onto its pile: no sliding, only a small hop.
            chip.position.x = chip.slot.x;
            chip.position.z = chip.slot.z;
            chip.velocity.x = 0;
            chip.velocity.z = 0;
          }
          if (Math.abs(chip.velocity.y) > 0.75 && chip.bounces < 2) {
            chip.velocity.y = -chip.velocity.y * RESTITUTION;
            chip.velocity.x *= FRICTION;
            chip.velocity.z *= FRICTION;
            chip.angularVelocity.multiplyScalar(0.5);
            chip.bounces += 1;
            if (chip.bounces === 1) {
              impactCallbackRef.current?.(chip.denomination);
            }
          } else {
            chip.velocity.set(0, 0, 0);
            chip.angularVelocity.set(0, 0, 0);
            chip.wobble = 0.22 + Math.random() * 0.12;
            chip.wobblePhase = Math.random() * Math.PI * 2;
            chip.settled = true;
            stateObj.spawnSparks(chip.position, 3, [0xfff1c1, 0xffffff], 0.35);
          }
        }

        chip.mesh.position.copy(chip.position);
        updateShadow(chip);
      }

      // Package V4: dealt cards slide out of the shoe, arc to the player, then shrink away.
      for (let i = stateObj.dealtCards.length - 1; i >= 0; i--) {
        const c = stateObj.dealtCards[i];
        c.elapsed += dt;
        const t = c.elapsed;
        if (t < DEAL_SLIDE_SEC) {
          const k = t / DEAL_SLIDE_SEC;
          c.mesh.position.lerpVectors(c.slideFrom, c.arc.v0, k * k * (3 - 2 * k));
        } else if (t < DEAL_SLIDE_SEC + DEAL_FLY_SEC) {
          const k = (t - DEAL_SLIDE_SEC) / DEAL_FLY_SEC;
          const e = 1 - Math.pow(1 - k, 2);
          c.mesh.position.copy(c.arc.getPoint(e));
          c.mesh.rotation.y += dt * 9;
          c.mesh.rotation.z = Math.sin(e * Math.PI) * 0.5;
        } else {
          const k = (t - DEAL_SLIDE_SEC - DEAL_FLY_SEC) / DEAL_FADE_SEC;
          if (k >= 1) {
            scene.remove(c.mesh);
            stateObj.dealtCards.splice(i, 1);
            continue;
          }
          c.mesh.scale.setScalar(c.scale * Math.max(0.001, 1 - k));
          if (k < dt / DEAL_FADE_SEC + 0.001) stateObj.spawnSparks(c.mesh.position, c.palette ? 22 : 12, c.palette ?? [0xe9d5ff, 0xfde68a, 0xffffff], c.palette ? 0.9 : 0.7);
        }
      }

      // Step 3D Boomerang flights along quadratic Bezier curves
      for (let i = stateObj.boomerangs.length - 1; i >= 0; i--) {
        const b = stateObj.boomerangs[i];
        b.elapsed += dt;
        const progress = Math.min(1, b.elapsed / b.duration);
        const pos =
          progress < 0.5
            ? b.outCurve.getPoint(progress * 2)
            : b.backCurve.getPoint((progress - 0.5) * 2);
        b.mesh.position.copy(pos);
        b.mesh.rotation.y += dt * 22.0;
        b.mesh.rotation.z = Math.sin(progress * Math.PI * 2) * 0.35;
        b.trailTimer += dt;
        if (b.trailTimer > 0.03) {
          b.trailTimer = 0;
          stateObj.spawnSparks(pos, 2, [0xffb347, 0xff7a18, 0xffe08a], 0.15);
        }

        if (progress >= 1) {
          scene.remove(b.mesh);
          stateObj.boomerangs.splice(i, 1);
        }
      }

      // Sparkles: integrate, fade, and compact into the GPU buffer
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.life += dt;
        if (sp.life >= sp.max) {
          sparks.splice(i, 1);
          continue;
        }
        sp.v.y -= 4.2 * dt;
        sp.v.multiplyScalar(Math.pow(0.35, dt));
        sp.p.addScaledVector(sp.v, dt);
      }
      for (let i = 0; i < sparks.length; i++) {
        const sp = sparks[i];
        const k = 1 - sp.life / sp.max;
        const twinkle = 0.7 + 0.3 * Math.sin(sp.life * 40 + i);
        sparkPositions[i * 3] = sp.p.x;
        sparkPositions[i * 3 + 1] = sp.p.y;
        sparkPositions[i * 3 + 2] = sp.p.z;
        sparkColors[i * 3] = sp.c.r * k * twinkle;
        sparkColors[i * 3 + 1] = sp.c.g * k * twinkle;
        sparkColors[i * 3 + 2] = sp.c.b * k * twinkle;
      }
      sparkGeometry.setDrawRange(0, sparks.length);
      (sparkGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (sparkGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;

      // Jackpot coins: tumble down, bounce once on the felt, then shrink away
      let coinCount = 0;
      for (let i = stateObj.coins.length - 1; i >= 0; i--) {
        const coin = stateObj.coins[i];
        if (coin.delay > 0) {
          coin.delay -= dt;
          continue;
        }
        coin.life += dt;
        coin.velocity.y += GRAVITY * 0.55 * dt;
        coin.position.addScaledVector(coin.velocity, dt);
        coin.rotation.x += coin.spin.x * dt;
        coin.rotation.y += coin.spin.y * dt;
        coin.rotation.z += coin.spin.z * dt;
        if (coin.position.y <= 0.03 && coin.velocity.y < 0) {
          coin.position.y = 0.03;
          if (!coin.bounced) {
            coin.bounced = true;
            coin.velocity.y *= -0.35;
            coin.velocity.x *= 0.6;
            coin.velocity.z *= 0.6;
            coin.spin.multiplyScalar(0.4);
            if (Math.random() < 0.25) impactCallbackRef.current?.(500);
          } else {
            coin.velocity.set(0, 0, 0);
          }
        }
        if (coin.life > 2.6) {
          stateObj.coins.splice(i, 1);
        }
      }
      for (let i = 0; i < stateObj.coins.length && coinCount < Math.min(MAX_COINS, tierRef.current.maxCoins); i++) {
        const coin = stateObj.coins[i];
        if (coin.delay > 0) continue;
        const fade = coin.life > 2.1 ? Math.max(0.001, 1 - (coin.life - 2.1) / 0.5) : 1;
        coinDummy.position.copy(coin.position);
        coinDummy.rotation.copy(coin.rotation);
        coinDummy.scale.setScalar(fade);
        coinDummy.updateMatrix();
        coinMesh.setMatrixAt(coinCount++, coinDummy.matrix);
      }
      coinMesh.count = coinCount;
      coinMesh.instanceMatrix.needsUpdate = true;

      // Package V4: totems pop in with a small overshoot, then rest.
      for (const t of stateObj.totems.values()) {
        if (t.pop >= 1) continue;
        t.pop = Math.min(1, t.pop + dt / 0.35);
        const k = t.pop;
        const back = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
        t.mesh.scale.setScalar(t.scale * Math.max(0.001, back));
      }

      renderer.render(scene, camera);
      if (showBudgetRef.current && performance.now() - lastBudgetAt > 250) {
        lastBudgetAt = performance.now();
        const info = renderer.info;
        setBudgetText(
          `${guard.tier} · ${info.render.calls}/${BUDGET.drawCalls} draws · ${Math.round(info.render.triangles / 1000)}k/${BUDGET.triangles / 1000}k tris · ${info.memory.textures} textures`
        );
      }

      if (hasWork()) {
        rafId = requestAnimationFrame(animate);
      } else {
        running = false;
      }
    };

    renderer.render(scene, camera);


    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    };
    window.addEventListener('resize', handleResize);

    // --- Package V4: totems over the seats (shield, ice, crown), placed over each player's tile ---
    const layoutTotems = (): boolean => {
      let moved = false;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      for (const t of stateObj.totems.values()) {
        const el = document.querySelector(`[data-seat-player="${t.playerId}"]`);
        const r = el?.getBoundingClientRect();
        const pt = r && r.width > 0 ? totemScreenPoint(r, t.index, t.count) : null;
        const hit = pt ? seatPointFromScreen({ left: pt.x - 1, top: pt.y, width: 2, height: 0 }, viewport, camera, 0.5) : null;
        const visible = Boolean(hit);
        if (t.mesh.visible !== visible) moved = true;
        t.mesh.visible = visible;
        if (hit && hit.distanceToSquared(t.mesh.position) > 1e-6) {
          t.mesh.position.copy(hit);
          moved = true;
        }
      }
      return moved;
    };
    const renderIfIdle = () => {
      if (!running) renderer.render(scene, camera);
    };
    stateObj.syncTotems = () => {
      const wanted = new Map<string, { playerId: number; kind: TotemKind; index: number; count: number }>();
      for (const seat of seatStatesRef.current ?? []) {
        const kinds = totemsFor(seat);
        kinds.forEach((kind, index) => wanted.set(`${seat.playerId}:${kind}`, { playerId: seat.playerId, kind, index, count: kinds.length }));
      }
      let changed = false;
      for (const [key, t] of stateObj.totems) {
        if (wanted.has(key)) continue;
        scene.remove(t.mesh);
        stateObj.totems.delete(key);
        changed = true;
      }
      for (const [key, w] of wanted) {
        const have = stateObj.totems.get(key);
        if (have) {
          have.index = w.index;
          have.count = w.count;
          continue;
        }
        const template = stateObj.totemTemplates[w.kind];
        if (!template) continue;
        const mesh = template.clone(true);
        mesh.scale.setScalar(0.001);
        scene.add(mesh);
        stateObj.totems.set(key, { mesh, playerId: w.playerId, kind: w.kind, index: w.index, count: w.count, pop: 0, scale: TOTEM_NODES[w.kind].scale });
        changed = true;
      }
      layoutTotems();
      if (changed) stateObj.wake();
      else renderIfIdle();
    };
    // Tiles move when the page scrolls or the layout changes, so the totems follow them.
    let layoutQueued = false;
    const queueLayout = () => {
      if (layoutQueued || stateObj.totems.size === 0) return;
      layoutQueued = true;
      requestAnimationFrame(() => {
        layoutQueued = false;
        if (layoutTotems()) renderIfIdle();
      });
    };
    window.addEventListener('scroll', queueLayout, { capture: true, passive: true });
    window.addEventListener('resize', queueLayout);
    const totemTimer = window.setInterval(queueLayout, 800);
    stateObj.syncTotems();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', queueLayout, { capture: true });
      window.removeEventListener('resize', queueLayout);
      window.clearInterval(totemTimer);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      running = false;
      envTexture.dispose();
      shadowTexture.dispose();
      shadowGeometry.dispose();
      sparkTexture.dispose();
      sparkGeometry.dispose();
      sparkMaterial.dispose();
      coinGeometry.dispose();
      coinMaterial.dispose();
      coinMesh.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [off, quality]);

  // Handle transient 3D Chip Toss when a player adds chips to their wager
  useEffect(() => {
    if (!tossEvent || calmMode) return;
    const ctx = sceneRef.current;
    if (ctx && ctx.lastProcessedTossId === tossEvent.id) return;
    if (ctx) ctx.lastProcessedTossId = tossEvent.id;

    const chipsToSpawn = decomposeBetIntoChips(tossEvent.amountDelta).slice(0, tierRef.current.maxChipsPerToss);


    if (!ctx) return;

    const seatEl = typeof document !== 'undefined' ? document.querySelector(`[data-seat-player="${tossEvent.playerId}"]`) : null;
    const fromScreen = seatEl
      ? seatPointFromScreen(seatEl.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, ctx.camera)
      : null;
    const origin = fromScreen ?? getSeatWorldPosition(tossEvent.seatIndex, tossEvent.totalSeats);
    const potTarget = new THREE.Vector3(POT_CENTER.x, 0.04, POT_CENTER.z);
    const potCap = POT_CHIP_CAP[quality === 'off' ? 'low' : quality];
    let potCount = ctx.chips.filter((c) => c.inPot).length;

    chipsToSpawn.forEach((denom, idx) => {
      const template = ctx.chipTemplates[denom] || ctx.chipTemplates[25];
      if (!template) return;
      const mesh = template.clone(true);
      const baseScale = mesh.scale.x || 0.32;
      // Package V3: the chip joins a pot pile while there is room; past the cap it lands and fades.
      const keep = potCount < potCap;
      const slot = keep ? potSlot(potCount++) : null;
      const chipHeight = Math.max(0.02, new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).y);

      const startPos = new THREE.Vector3(
        origin.x + (Math.random() - 0.5) * 0.2,
        0.24 + idx * 0.07,
        origin.z + (Math.random() - 0.5) * 0.2
      );
      mesh.position.copy(startPos);

      const landingSpot = slot
        ? new THREE.Vector3(slot.x, 0.03, slot.z)
        : new THREE.Vector3(potTarget.x + (Math.random() - 0.5) * 0.55, 0.03, potTarget.z + (Math.random() - 0.5) * 0.4);
      const flightTime = 0.42 + Math.random() * 0.1;
      const vx = (landingSpot.x - startPos.x) / flightTime;
      const vz = (landingSpot.z - startPos.z) / flightTime;
      const vy = 2.4 + Math.random() * 0.7;

      ctx.scene.add(mesh);
      ctx.chips.push({
        mesh,
        baseScale,
        denomination: denom,
        position: startPos,
        velocity: new THREE.Vector3(vx, vy, vz),
        angularVelocity: new THREE.Vector3(
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 7
        ),
        settled: false,
        settledTime: 0,
        bounces: 0,
        sweeping: false,
        sweepProgress: 0,
        sweepDelay: 0,
        wobble: 0,
        wobblePhase: 0,
        shadow: ctx.makeShadow(),
        inPot: keep,
        slot: slot ? { x: slot.x, z: slot.z } : undefined,
        floorY: slot ? 0.024 + slot.level * chipHeight * 0.92 : undefined,
      });
    });
    ctx.wake();
  }, [tossEvent, calmMode, quality]);

  // Handle celebratory 3D Pot Sweep on Round Settlement (spawns transient payout chips that arc to winners and vanish)
  useEffect(() => {
    if (!sweepEvent || calmMode) return;
    const ctx = sceneRef.current;
    if (ctx && ctx.lastProcessedSweepId === sweepEvent.id) return;
    if (ctx) ctx.lastProcessedSweepId = sweepEvent.id;


    if (!ctx) return;

    const hasWinners = sweepEvent.winnerSeatIndices.length > 0;
    const houseVaultPos = new THREE.Vector3(0, 0.3, -2.6);
    const potCenter = new THREE.Vector3(POT_CENTER.x, 0.08, POT_CENTER.z);
    // Each winner's own card on screen when it can be found, else their seat on the rail.
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const winnerTargets = sweepEvent.winnerSeatIndices.map((seat, i) => {
      const id = sweepEvent.winnerPlayerIds?.[i];
      const el = id !== undefined ? document.querySelector(`[data-seat-player="${id}"]`) : null;
      const fromScreen = el ? seatPointFromScreen(el.getBoundingClientRect(), viewport, ctx.camera) : null;
      return fromScreen ?? getSeatWorldPosition(seat, sweepEvent.totalSeats);
    });
    const targetFor = (idx: number) => (hasWinners ? winnerTargets[idx % winnerTargets.length].clone() : houseVaultPos.clone());

    // Package V3: the chips that sat in the pot all hand are the ones that fly to the winners.
    const potChips = ctx.chips.filter((c) => c.inPot && !c.sweeping);
    potChips.forEach((chip, idx) => {
      chip.inPot = false;
      chip.slot = undefined;
      chip.settled = true;
      chip.velocity.set(0, 0, 0);
      chip.sweeping = true;
      chip.sweepStart = chip.position.clone();
      chip.sweepTarget = targetFor(idx);
      chip.sweepProgress = 0;
      chip.sweepDelay = Math.min(0.6, idx * 0.02);
    });
    const sweepDenoms = potChips.length >= 4 ? [] : [100, 50, 25, 100, 500, 50, 25, 100];

    sweepDenoms.forEach((denom, idx) => {
      const template = ctx.chipTemplates[denom] || ctx.chipTemplates[100];
      if (!template) return;
      const mesh = template.clone(true);
      const baseScale = mesh.scale.x || 0.32;

      const startPos = new THREE.Vector3(
        potCenter.x + (Math.random() - 0.5) * 0.4,
        potCenter.y + idx * 0.025,
        potCenter.z + (Math.random() - 0.5) * 0.3
      );
      mesh.position.copy(startPos);

      const targetPos = targetFor(idx);

      ctx.scene.add(mesh);
      ctx.chips.push({
        mesh,
        baseScale,
        denomination: denom,
        position: startPos.clone(),
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        settled: true,
        settledTime: 0,
        bounces: 2,
        sweeping: true,
        sweepStart: startPos,
        sweepTarget: targetPos,
        sweepProgress: 0,
        sweepDelay: idx * 0.035,
        wobble: 0,
        wobblePhase: 0,
        shadow: ctx.makeShadow(),
      });
    });
    // Gold burst from the pot as it is swept; red-tinted embers when the House takes it
    ctx.spawnSparks(potCenter, hasWinners ? 36 : 14, hasWinners ? undefined : [0xff6b6b, 0xffb347, 0x8b1e1e], hasWinners ? 1.1 : 0.6);
    ctx.wake();
  }, [sweepEvent, calmMode]);

  // Package V4: a totem appears or leaves as a player's shield, freeze or streak changes.
  useEffect(() => {
    if (calmMode) return;
    sceneRef.current?.syncTotems();
  }, [seatStates, calmMode]);

  // Package V3: when the bets leave the table without a payout (a void hand, a new hand), the pot
  // chips fade where they lie.
  useEffect(() => {
    if (potTotal > 0) return;
    const ctx = sceneRef.current;
    if (!ctx) return;
    let any = false;
    for (const chip of ctx.chips) {
      if (!chip.inPot || chip.sweeping) continue;
      chip.inPot = false;
      chip.slot = undefined;
      any = true;
    }
    if (any) ctx.wake();
  }, [potTotal]);

  // Package V4: a power-up card leaves the shoe and flies to the player who drew it.
  useEffect(() => {
    if (!shoeEvent || calmMode) return;
    const ctx = sceneRef.current;
    if (!ctx || ctx.lastProcessedShoeId === shoeEvent.id) return;
    ctx.lastProcessedShoeId = shoeEvent.id;
    if (!ctx.cardTemplate) return;
    const el = document.querySelector(`[data-seat-player="${shoeEvent.playerId}"]`);
    const fromScreen = el ? seatPointFromScreen(el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, ctx.camera, 0.3) : null;
    const target = fromScreen ?? getSeatWorldPosition(shoeEvent.seatIndex, shoeEvent.totalSeats);
    const mouth = new THREE.Vector3(SHOE_POSITION.x, SHOE_POSITION.y + 0.12, SHOE_POSITION.z + 0.42);
    const slideFrom = new THREE.Vector3(SHOE_POSITION.x, SHOE_POSITION.y + 0.12, SHOE_POSITION.z + 0.1);
    const mid = mouth.clone().add(target).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.4, 0));
    const mesh = ctx.cardTemplate.clone(true);
    mesh.scale.setScalar(CARD_SCALE);
    mesh.position.copy(slideFrom);
    ctx.scene.add(mesh);
    ctx.dealtCards.push({ mesh, slideFrom, arc: new THREE.QuadraticBezierCurve3(mouth, mid, target), elapsed: 0, scale: CARD_SCALE });
    ctx.wake();
  }, [shoeEvent, calmMode]);

  // Package V4: a targeted power-up card flies from the player who used it to the one it hits.
  useEffect(() => {
    if (!flightEvent || calmMode) return;
    const ctx = sceneRef.current;
    if (!ctx || ctx.lastProcessedFlightId === flightEvent.id) return;
    ctx.lastProcessedFlightId = flightEvent.id;
    if (!ctx.cardTemplate) return;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const seatPoint = (playerId: number, seatIndex: number) => {
      const el = document.querySelector(`[data-seat-player="${playerId}"]`);
      return (el ? seatPointFromScreen(el.getBoundingClientRect(), viewport, ctx.camera, 0.3) : null) ?? getSeatWorldPosition(seatIndex, flightEvent.totalSeats);
    };
    const from = seatPoint(flightEvent.fromPlayerId, flightEvent.fromSeatIndex);
    const to = seatPoint(flightEvent.toPlayerId, flightEvent.toSeatIndex);
    const mid = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.6, 0));
    const mesh = ctx.cardTemplate.clone(true);
    mesh.scale.setScalar(CARD_SCALE);
    mesh.position.copy(from);
    ctx.scene.add(mesh);
    // No slide out of the shoe: slideFrom is the start of the arc.
    ctx.dealtCards.push({ mesh, slideFrom: from.clone(), arc: new THREE.QuadraticBezierCurve3(from, mid, to), elapsed: DEAL_SLIDE_SEC, scale: CARD_SCALE, palette: flightEvent.palette });
    ctx.wake();
  }, [flightEvent, calmMode]);

  // Handle 3D Boomerang Parabolic Reflection Flight
  useEffect(() => {
    if (!boomerangEvent || calmMode) return;
    const ctx = sceneRef.current;
    if (ctx && ctx.lastProcessedBoomerangId === boomerangEvent.id) return;
    if (ctx) ctx.lastProcessedBoomerangId = boomerangEvent.id;


    if (!ctx) return;

    const startPos = getSeatWorldPosition(boomerangEvent.attackerSeatIndex, boomerangEvent.totalSeats);
    const reflectPos = getSeatWorldPosition(boomerangEvent.defenderSeatIndex, boomerangEvent.totalSeats);

    const midOut = startPos.clone().add(reflectPos).multiplyScalar(0.5).add(new THREE.Vector3(-0.7, 1.45, -0.6));
    const midBack = reflectPos.clone().add(startPos).multiplyScalar(0.5).add(new THREE.Vector3(0.7, 1.65, 0.5));

    const mesh = ctx.boomerangTemplate.clone(true);
    mesh.position.copy(startPos);
    ctx.scene.add(mesh);

    ctx.boomerangs.push({
      mesh,
      outCurve: new THREE.QuadraticBezierCurve3(startPos, midOut, reflectPos),
      backCurve: new THREE.QuadraticBezierCurve3(reflectPos, midBack, startPos),
      elapsed: 0,
      duration: 0.9,
      trailTimer: 0,
    });
    ctx.wake();
  }, [boomerangEvent, calmMode]);

  // Jackpot coin shower: gold coins tumble in from above the table
  useEffect(() => {
    if (!jackpotEvent || calmMode) return;
    const ctx = sceneRef.current;
    if (!ctx || ctx.lastProcessedJackpotId === jackpotEvent.id) return;
    ctx.lastProcessedJackpotId = jackpotEvent.id;

    const intensity = Math.max(0.1, Math.min(1, jackpotEvent.intensity));
    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 700;
    const count = Math.round(Math.min(isSmallScreen ? 36 : MAX_COINS, tierRef.current.maxCoins) * intensity);
    for (let i = 0; i < count; i++) {
      ctx.coins.push({
        position: new THREE.Vector3((Math.random() - 0.5) * 7, 3.6 + Math.random() * 1.2, -1.8 + Math.random() * 3.2),
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.8, -1 - Math.random() * 1.5, (Math.random() - 0.3) * 0.8),
        rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
        spin: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 16),
        delay: Math.random() * 0.9 * intensity,
        life: 0,
        bounced: false,
      });
    }
    ctx.spawnSparks(new THREE.Vector3(0, 0.4, -0.35), Math.round(60 * intensity), undefined, 1.4);
    ctx.wake();
  }, [jackpotEvent, calmMode]);

  if (off) {
    return null;
  }

  return (
    <>
      <div
        ref={containerRef}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: behindInterface ? -1 : 12 }}
      />
      {budgetText && (
        <div className="fixed left-2 bottom-2 z-[90] px-2 py-1 rounded bg-black/75 text-white font-mono text-[11px] pointer-events-none" data-testid="budget-overlay">
          {budgetText}
        </div>
      )}
    </>
  );
};

export default Tabletop3DOverlay;
