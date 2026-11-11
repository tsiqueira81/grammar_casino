import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function parseGlbJsonChunk(filePath: string): any {
  const buf = fs.readFileSync(filePath);
  expect(buf.length).toBeGreaterThan(28);
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const totalLen = buf.readUInt32LE(8);
  expect(magic).toBe(0x46546c67); // 'glTF'
  expect(version).toBe(2);
  expect(totalLen).toBe(buf.length);

  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  expect(jsonType).toBe(0x4e4f534a); // 'JSON'

  const jsonStr = buf.subarray(20, 20 + jsonLen).toString('utf8').trim();
  return JSON.parse(jsonStr);
}

describe('3D Tabletop glTF 2.0 (.glb) Asset Packs', () => {
  const modelsDir = path.join(process.cwd(), 'public', 'models');

  it('generates valid poker_chips.glb with all 5 chip denominations', () => {
    const file = path.join(modelsDir, 'poker_chips.glb');
    expect(fs.existsSync(file)).toBe(true);
    const gltf = parseGlbJsonChunk(file);
    const nodeNames = (gltf.nodes || []).map((n: any) => n.name);
    expect(nodeNames).toEqual(
      expect.arrayContaining(['Chip_10', 'Chip_25', 'Chip_50', 'Chip_100', 'Chip_500'])
    );
  });

  it('generates valid card_shoe.glb with DealerCardShoe, PowerUpCard, and CardDrawSlide animation', () => {
    const file = path.join(modelsDir, 'card_shoe.glb');
    expect(fs.existsSync(file)).toBe(true);
    const gltf = parseGlbJsonChunk(file);
    const nodeNames = (gltf.nodes || []).map((n: any) => n.name);
    expect(nodeNames).toEqual(expect.arrayContaining(['DealerCardShoe', 'PowerUpCard']));
    const animNames = (gltf.animations || []).map((a: any) => a.name);
    expect(animNames).toContain('CardDrawSlide');
  });

  it('generates valid wheel_of_fortune.glb with WheelDisc and WheelFlapper', () => {
    const file = path.join(modelsDir, 'wheel_of_fortune.glb');
    expect(fs.existsSync(file)).toBe(true);
    const gltf = parseGlbJsonChunk(file);
    const nodeNames = (gltf.nodes || []).map((n: any) => n.name);
    expect(nodeNames).toEqual(expect.arrayContaining(['WheelDisc', 'WheelFlapper']));
  });

  it('generates valid powerup_totems.glb with Shield, Sub-Zero Ice, Boomerang, and Streak Crown totems', () => {
    const file = path.join(modelsDir, 'powerup_totems.glb');
    expect(fs.existsSync(file)).toBe(true);
    const gltf = parseGlbJsonChunk(file);
    const nodeNames = (gltf.nodes || []).map((n: any) => n.name);
    expect(nodeNames).toEqual(
      expect.arrayContaining([
        'Totem_ShieldDome',
        'Totem_SubZeroIce',
        'Totem_Boomerang',
        'Totem_StreakCrown',
      ])
    );
  });

  // Package V2: the table and room built by scripts/assets/build_table.py.
  it('table.glb has the felt, rail, pot ring, dealer tray and 40 seat anchors', () => {
    const gltf = parseGlbJsonChunk(path.join(modelsDir, 'table.glb'));
    const nodeNames = (gltf.nodes || []).map((n: any) => n.name);
    const anchors = Array.from({ length: 40 }, (_, i) => `Seat_Anchor_${String(i).padStart(2, '0')}`);
    expect(nodeNames).toEqual(expect.arrayContaining(['Table_Felt', 'Table_Rail', 'Pot_Ring', 'Dealer_Tray', ...anchors]));
    expect(nodeNames).not.toContain('Seat_Anchor_40');
  });

  it('room.glb has a floor, walls and two lamps', () => {
    const gltf = parseGlbJsonChunk(path.join(modelsDir, 'room.glb'));
    const nodeNames = (gltf.nodes || []).map((n: any) => n.name);
    expect(nodeNames).toEqual(expect.arrayContaining(['Room_Floor', 'Room_Walls', 'Lamp_Shade_L', 'Lamp_Shade_R']));
  });

  it('the table and room together stay under 1.5 MB', () => {
    const bytes = ['table.glb', 'room.glb'].reduce((sum, f) => sum + fs.statSync(path.join(modelsDir, f)).size, 0);
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);
  });
});
