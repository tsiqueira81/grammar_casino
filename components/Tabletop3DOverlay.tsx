import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BUDGET, FrameGuard, TIER_SETTINGS, type QualityTier } from '../show/quality';
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
  jackpotEvent?: JackpotEvent | null;
  onChipImpactSound?: (denomination: number) => void;
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
  jackpotEvent,
  onChipImpactSound,
}) => {
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
    lastProcessedTossId: string | null;
    lastProcessedSweepId: string | null;
    lastProcessedBoomerangId: string | null;
    lastProcessedJackpotId: string | null;
    spawnSparks: (at: THREE.Vector3, count: number, palette?: number[], speed?: number) => void;
    makeShadow: () => THREE.Mesh;
    coins: FallingCoin[];
    wake: () => void;
  } | null>(null);

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
      });
    } catch {
      return;
    }
    // No 3D table on a computer that draws WebGL in software (no graphics acceleration, as
    // on some school PCs): building the scene there froze the whole screen for seconds after a
    // reload. The table is decoration only, so the game goes on without it.
    if (isSoftwareRenderer(renderer)) {
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
      lastProcessedTossId: null as string | null,
      lastProcessedSweepId: null as string | null,
      lastProcessedBoomerangId: null as string | null,
      lastProcessedJackpotId: null as string | null,
      spawnSparks: (() => {}) as (at: THREE.Vector3, count: number, palette?: number[], speed?: number) => void,
      makeShadow: (() => new THREE.Mesh()) as () => THREE.Mesh,
      coins: [] as FallingCoin[],
      wake: () => {},
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
    const GOLD_PALETTE = [0xffe08a, 0xf5c542, 0xfff6d5, 0xffb347];
    stateObj.spawnSparks = (at, count, palette = GOLD_PALETTE, speed = 1) => {
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

    loader.load(
      '/models/powerup_totems.glb',
      (gltf) => {
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
    const hasWork = () =>
      stateObj.chips.length > 0 || stateObj.boomerangs.length > 0 || sparks.length > 0 || stateObj.coins.length > 0;

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
      const stepped = guard.push(rawDt * 1000);
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
          if (chip.settledTime > SETTLED_HOLD_SEC) {
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

        if (chip.position.y <= TABLE_Y) {
          chip.position.y = TABLE_Y;
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

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
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

    const origin = getSeatWorldPosition(tossEvent.seatIndex, tossEvent.totalSeats);
    const potTarget = new THREE.Vector3(0, 0.04, -0.35);

    chipsToSpawn.forEach((denom, idx) => {
      const template = ctx.chipTemplates[denom] || ctx.chipTemplates[25];
      if (!template) return;
      const mesh = template.clone(true);
      const baseScale = mesh.scale.x || 0.32;

      const startPos = new THREE.Vector3(
        origin.x + (Math.random() - 0.5) * 0.2,
        0.24 + idx * 0.07,
        origin.z + (Math.random() - 0.5) * 0.2
      );
      mesh.position.copy(startPos);

      const landingSpot = new THREE.Vector3(
        potTarget.x + (Math.random() - 0.5) * 0.55,
        0.03,
        potTarget.z + (Math.random() - 0.5) * 0.4
      );
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
      });
    });
    ctx.wake();
  }, [tossEvent, calmMode]);

  // Handle celebratory 3D Pot Sweep on Round Settlement (spawns transient payout chips that arc to winners and vanish)
  useEffect(() => {
    if (!sweepEvent || calmMode) return;
    const ctx = sceneRef.current;
    if (ctx && ctx.lastProcessedSweepId === sweepEvent.id) return;
    if (ctx) ctx.lastProcessedSweepId = sweepEvent.id;


    if (!ctx) return;

    const hasWinners = sweepEvent.winnerSeatIndices.length > 0;
    const houseVaultPos = new THREE.Vector3(0, 0.3, -2.6);
    const potCenter = new THREE.Vector3(0, 0.08, -0.35);
    const sweepDenoms = [100, 50, 25, 100, 500, 50, 25, 100];

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

      const targetPos = hasWinners
        ? getSeatWorldPosition(
            sweepEvent.winnerSeatIndices[idx % sweepEvent.winnerSeatIndices.length],
            sweepEvent.totalSeats
          )
        : houseVaultPos.clone();

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
        className="fixed inset-0 pointer-events-none z-[12] overflow-hidden"
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
