import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { arcOffset } from '../components/PlayerTileGrid';
import { seatPointFromScreen } from '../components/Tabletop3DOverlay';
import { TABLE_CAMERA } from '../show/tableView';

// Package V2 step 3: players sit in a curved row in Table view, and a tossed chip leaves from
// the player's own tile or card.
describe('seats around the table (package V2 step 3)', () => {
  it('curves the row: the ends high, the middle lowest, symmetric', () => {
    const six = Array.from({ length: 6 }, (_, i) => arcOffset(i, 6));
    expect(six[0]).toBe(0);
    expect(six[5]).toBe(0);
    expect(six).toEqual([...six].reverse());
    expect(Math.max(...six)).toBeLessThanOrEqual(56);
    expect(arcOffset(0, 2)).toBe(0); // two players stay level
  });

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
