import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { seatPointFromScreen } from '../components/Tabletop3DOverlay';

// Package V2 step 3: a tossed chip leaves from the player's own tile or card.
const TABLE_CAMERA = { fov: 36, position: [0, 6.2, 6.6] as const, lookAt: [0, 0, 0.25] as const };

describe('chips leave from the player\'s seat (package V2 step 3)', () => {
  const camera = new THREE.PerspectiveCamera(TABLE_CAMERA.fov, 1920 / 1080, 0.1, 60);
  camera.position.set(...TABLE_CAMERA.position);
  camera.lookAt(...TABLE_CAMERA.lookAt);
  camera.updateMatrixWorld();
  const view = { width: 1920, height: 1080 };

  it('maps a tile on screen to a point on the table, left to left and low to near', () => {
    const left = seatPointFromScreen({ left: 300, top: 700, width: 180, height: 200 }, view, camera)!;
    const right = seatPointFromScreen({ left: 1440, top: 700, width: 180, height: 200 }, view, camera)!;
    const high = seatPointFromScreen({ left: 870, top: 300, width: 180, height: 100 }, view, camera)!;
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
    expect(high.z).toBeLessThan(left.z);
    for (const p of [left, right, high]) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(4.2);
      expect(p.z).toBeGreaterThanOrEqual(-2.6);
      expect(p.z).toBeLessThanOrEqual(3.2);
    }
  });

  it('gives no point for an element off screen, so the old seat arc is used', () => {
    expect(seatPointFromScreen({ left: 100, top: 1500, width: 100, height: 100 }, view, camera)).toBeNull();
    expect(seatPointFromScreen({ left: 0, top: 0, width: 0, height: 0 }, view, camera)).toBeNull();
  });
});
