import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

export interface CardDrawEvent {
  id: string;
}

export interface Tabletop3DOverlayProps {
  active: boolean;
  calmMode: boolean;
  projectorMode?: boolean;
  seatStates: Seat3DState[];
  tossEvent: ChipTossEvent | null;
  sweepEvent: PotSweepEvent | null;
  boomerangEvent: BoomerangArcEvent | null;
  cardDrawEvent?: CardDrawEvent | null;
  onChipImpactSound?: (denomination: number) => void;
}

declare global {
  interface Window {
    grammarCasinoGodot?: (eventJson: string) => void;
  }
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
}

interface ActiveBoomerangFlight {
  mesh: THREE.Object3D;
  outCurve: THREE.QuadraticBezierCurve3;
  backCurve: THREE.QuadraticBezierCurve3;
  elapsed: number;
  duration: number;
}

/**
 * Computes a seat's 3D world position on a semi-circular arc around the table.
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
  tossEvent,
  sweepEvent,
  boomerangEvent,
  onChipImpactSound,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const impactCallbackRef = useRef(onChipImpactSound);
  impactCallbackRef.current = onChipImpactSound;

  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    chipTemplates: Record<number, THREE.Object3D>;
    boomerangTemplate?: THREE.Object3D;
    chips: RigidChipBody[];
    boomerangs: ActiveBoomerangFlight[];
    lastProcessedTossId: string | null;
    lastProcessedSweepId: string | null;
    lastProcessedBoomerangId: string | null;
  } | null>(null);

  // Initialize Three.js WebGL scene & load `.glb` chip/boomerang models
  useEffect(() => {
    if (!active || calmMode) return;
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
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Warm casino lighting for the transient 3D chips
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
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

    const stateObj = {
      scene,
      camera,
      renderer,
      chipTemplates,
      boomerangTemplate: undefined as THREE.Object3D | undefined,
      chips: [] as RigidChipBody[],
      boomerangs: [] as ActiveBoomerangFlight[],
      lastProcessedTossId: null as string | null,
      lastProcessedSweepId: null as string | null,
      lastProcessedBoomerangId: null as string | null,
    };
    sceneRef.current = stateObj;

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

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);

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

          if (chip.sweepProgress >= 1) {
            scene.remove(chip.mesh);
            stateObj.chips.splice(i, 1);
          }
          continue;
        }

        if (chip.settled) {
          chip.settledTime += dt;
          if (chip.settledTime > SETTLED_HOLD_SEC) {
            const fadeT = (chip.settledTime - SETTLED_HOLD_SEC) / SETTLED_FADE_SEC;
            if (fadeT >= 1) {
              scene.remove(chip.mesh);
              stateObj.chips.splice(i, 1);
              continue;
            }
            const scaleFactor = Math.max(0.001, 1 - fadeT * fadeT);
            chip.mesh.scale.setScalar(chip.baseScale * scaleFactor);
          }
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
            chip.mesh.rotation.x = 0;
            chip.mesh.rotation.z = 0;
            chip.settled = true;
          }
        }

        chip.mesh.position.copy(chip.position);
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

        if (progress >= 1) {
          scene.remove(b.mesh);
          stateObj.boomerangs.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [active, calmMode]);

  // Handle transient 3D Chip Toss when a player adds chips to their wager
  useEffect(() => {
    if (!tossEvent || calmMode) return;
    const ctx = sceneRef.current;
    if (ctx && ctx.lastProcessedTossId === tossEvent.id) return;
    if (ctx) ctx.lastProcessedTossId = tossEvent.id;

    const chipsToSpawn = decomposeBetIntoChips(tossEvent.amountDelta);

    if (typeof window !== 'undefined' && typeof window.grammarCasinoGodot === 'function') {
      try {
        window.grammarCasinoGodot(
          JSON.stringify({
            action: 'toss_bet',
            seatIndex: tossEvent.seatIndex,
            chipCount: chipsToSpawn.length,
          })
        );
      } catch {
        // Ignore bridge errors
      }
    }

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
      });
    });
  }, [tossEvent, calmMode]);

  // Handle celebratory 3D Pot Sweep on Round Settlement (spawns transient payout chips that arc to winners and vanish)
  useEffect(() => {
    if (!sweepEvent || calmMode) return;
    const ctx = sceneRef.current;
    if (ctx && ctx.lastProcessedSweepId === sweepEvent.id) return;
    if (ctx) ctx.lastProcessedSweepId = sweepEvent.id;

    if (typeof window !== 'undefined' && typeof window.grammarCasinoGodot === 'function') {
      try {
        window.grammarCasinoGodot(
          JSON.stringify({
            action: 'sweep_pot',
            winnerSeats: sweepEvent.winnerSeatIndices,
          })
        );
      } catch {
        // Ignore bridge errors
      }
    }

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
      });
    });
  }, [sweepEvent, calmMode]);

  // Handle 3D Boomerang Parabolic Reflection Flight
  useEffect(() => {
    if (!boomerangEvent || calmMode) return;
    const ctx = sceneRef.current;
    if (ctx && ctx.lastProcessedBoomerangId === boomerangEvent.id) return;
    if (ctx) ctx.lastProcessedBoomerangId = boomerangEvent.id;

    if (typeof window !== 'undefined' && typeof window.grammarCasinoGodot === 'function') {
      try {
        window.grammarCasinoGodot(
          JSON.stringify({
            action: 'boomerang_reflect',
            attackerSeat: boomerangEvent.attackerSeatIndex,
            defenderSeat: boomerangEvent.defenderSeatIndex,
          })
        );
      } catch {
        // Ignore bridge errors
      }
    }

    if (!ctx) return;

    const startPos = getSeatWorldPosition(boomerangEvent.attackerSeatIndex, boomerangEvent.totalSeats);
    const reflectPos = getSeatWorldPosition(boomerangEvent.defenderSeatIndex, boomerangEvent.totalSeats);

    const midOut = startPos.clone().add(reflectPos).multiplyScalar(0.5).add(new THREE.Vector3(-0.7, 1.45, -0.6));
    const midBack = reflectPos.clone().add(startPos).multiplyScalar(0.5).add(new THREE.Vector3(0.7, 1.65, 0.5));

    const mesh = ctx.boomerangTemplate
      ? ctx.boomerangTemplate.clone(true)
      : new THREE.Mesh(
          new THREE.TorusGeometry(0.22, 0.045, 12, 24, Math.PI * 1.3),
          new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0xd97706,
            emissiveIntensity: 0.6,
            metalness: 0.6,
            roughness: 0.2,
          })
        );
    mesh.position.copy(startPos);
    ctx.scene.add(mesh);

    ctx.boomerangs.push({
      mesh,
      outCurve: new THREE.QuadraticBezierCurve3(startPos, midOut, reflectPos),
      backCurve: new THREE.QuadraticBezierCurve3(reflectPos, midBack, startPos),
      elapsed: 0,
      duration: 0.9,
    });
  }, [boomerangEvent, calmMode]);

  if (!active || calmMode) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[12] overflow-hidden"
    />
  );
};

export default Tabletop3DOverlay;
