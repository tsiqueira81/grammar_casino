/**
 * Grammar Casino — Pure Node.js glTF 2.0 Binary (.glb) Asset Generator
 * ====================================================================
 * Generates the exact 4 PBR `.glb` 3D model packs in `public/models/` when Blender CLI
 * is not installed on PATH, matching all node names, materials, geometry, and animations
 * produced by `scripts/assets/blender_generate_props.py`:
 *   1. public/models/poker_chips.glb      (Chip_10, Chip_25, Chip_50, Chip_100, Chip_500)
 *   2. public/models/card_shoe.glb        (DealerCardShoe, ShoeBrassLip, PowerUpCard + CardDrawSlide animation)
 *   3. public/models/wheel_of_fortune.glb (WheelDisc, WheelBrassRim, WheelPeg_00..19, WheelFlapper)
 *   4. public/models/powerup_totems.glb   (Totem_ShieldDome, Totem_SubZeroIce, Totem_Boomerang, Totem_StreakCrown)
 */

import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'models');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// --- Geometry Builders (Indexed Triangle Meshes: positions, normals, indices) ---

function createCylinderGeometry(radiusTop, radiusBottom, height, radialSegments = 32, offset = [0, 0, 0]) {
  const positions = [];
  const normals = [];
  const indices = [];
  const halfH = height / 2;

  // Side ring vertices
  for (let yStep = 0; yStep <= 1; yStep++) {
    const v = yStep;
    const y = (v - 0.5) * height;
    const r = yStep === 0 ? radiusBottom : radiusTop;
    for (let i = 0; i <= radialSegments; i++) {
      const theta = (i / radialSegments) * Math.PI * 2;
      const nx = Math.cos(theta);
      const nz = Math.sin(theta);
      positions.push(nx * r + offset[0], y + offset[1], nz * r + offset[2]);
      normals.push(nx, 0, nz);
    }
  }
  const stride = radialSegments + 1;
  for (let i = 0; i < radialSegments; i++) {
    const a = i;
    const b = i + stride;
    const c = i + stride + 1;
    const d = i + 1;
    indices.push(a, b, d, b, c, d);
  }

  // Top cap
  const topCenterIdx = positions.length / 3;
  positions.push(offset[0], halfH + offset[1], offset[2]);
  normals.push(0, 1, 0);
  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2;
    positions.push(
      Math.cos(theta) * radiusTop + offset[0],
      halfH + offset[1],
      Math.sin(theta) * radiusTop + offset[2]
    );
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < radialSegments; i++) {
    indices.push(topCenterIdx, topCenterIdx + i + 2, topCenterIdx + i + 1);
  }

  // Bottom cap
  const botCenterIdx = positions.length / 3;
  positions.push(offset[0], -halfH + offset[1], offset[2]);
  normals.push(0, -1, 0);
  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2;
    positions.push(
      Math.cos(theta) * radiusBottom + offset[0],
      -halfH + offset[1],
      Math.sin(theta) * radiusBottom + offset[2]
    );
    normals.push(0, -1, 0);
  }
  for (let i = 0; i < radialSegments; i++) {
    indices.push(botCenterIdx, botCenterIdx + i + 1, botCenterIdx + i + 2);
  }

  return { positions, normals, indices };
}

function createBoxGeometry(sx, sy, sz, offset = [0, 0, 0], rotZ = 0) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const faces = [
    { n: [0, 1, 0], v: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
    { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
  ];

  const positions = [];
  const normals = [];
  const indices = [];
  const cosZ = Math.cos(rotZ);
  const sinZ = Math.sin(rotZ);

  for (const f of faces) {
    const base = positions.length / 3;
    const rnx = f.n[0] * cosZ - f.n[2] * sinZ;
    const rnz = f.n[0] * sinZ + f.n[2] * cosZ;
    for (const [vx, vy, vz] of f.v) {
      const rx = vx * cosZ - vz * sinZ;
      const rz = vx * sinZ + vz * cosZ;
      positions.push(rx + offset[0], vy + offset[1], rz + offset[2]);
      normals.push(rnx, f.n[1], rnz);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

function createTorusGeometry(majorRadius, minorRadius, radialSegments = 16, tubularSegments = 32, offset = [0, 0, 0]) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let j = 0; j <= radialSegments; j++) {
    for (let i = 0; i <= tubularSegments; i++) {
      const u = (i / tubularSegments) * Math.PI * 2;
      const v = (j / radialSegments) * Math.PI * 2;
      const cx = (majorRadius + minorRadius * Math.cos(v)) * Math.cos(u);
      const cy = minorRadius * Math.sin(v);
      const cz = (majorRadius + minorRadius * Math.cos(v)) * Math.sin(u);
      const nx = Math.cos(v) * Math.cos(u);
      const ny = Math.sin(v);
      const nz = Math.cos(v) * Math.sin(u);
      positions.push(cx + offset[0], cy + offset[1], cz + offset[2]);
      normals.push(nx, ny, nz);
    }
  }
  for (let j = 1; j <= radialSegments; j++) {
    for (let i = 1; i <= tubularSegments; i++) {
      const a = (tubularSegments + 1) * j + i - 1;
      const b = (tubularSegments + 1) * (j - 1) + i - 1;
      const c = (tubularSegments + 1) * (j - 1) + i;
      const d = (tubularSegments + 1) * j + i;
      indices.push(a, b, d, b, c, d);
    }
  }
  return { positions, normals, indices };
}

function createSphereDomeGeometry(radius, latBands = 14, lonBands = 24, offset = [0, 0, 0]) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat * Math.PI) / latBands;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let lon = 0; lon <= lonBands; lon++) {
      const phi = (lon * 2 * Math.PI) / lonBands;
      const nx = Math.cos(phi) * sinT;
      const ny = cosT;
      const nz = Math.sin(phi) * sinT;
      positions.push(nx * radius + offset[0], ny * radius + offset[1], nz * radius + offset[2]);
      normals.push(nx, ny, nz);
    }
  }
  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const first = lat * (lonBands + 1) + lon;
      const second = first + lonBands + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }
  return { positions, normals, indices };
}

function mergeGeometries(geos) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const g of geos) {
    const vertexOffset = positions.length / 3;
    positions.push(...g.positions);
    normals.push(...g.normals);
    for (const idx of g.indices) {
      indices.push(idx + vertexOffset);
    }
  }
  return { positions, normals, indices };
}

// --- glTF 2.0 Binary (.glb) Serializer ---

function buildGlb({ materials, nodes, animations = [] }) {
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const gltfNodes = [];
  const binaryChunks = [];
  let byteOffset = 0;

  function appendBuffer(typedArray, target) {
    const buf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = (4 - (buf.length % 4)) % 4;
    const padded = pad > 0 ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
    const viewIndex = bufferViews.length;
    const view = {
      buffer: 0,
      byteOffset,
      byteLength: buf.length,
    };
    if (target) view.target = target;
    bufferViews.push(view);
    binaryChunks.push(padded);
    byteOffset += padded.length;
    return viewIndex;
  }

  function computeMinMaxVec3(arr) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < arr.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (arr[i + k] < min[k]) min[k] = arr[i + k];
        if (arr[i + k] > max[k]) max[k] = arr[i + k];
      }
    }
    return { min, max };
  }

  for (const nodeDef of nodes) {
    const primitives = [];
    for (const prim of nodeDef.primitives) {
      const posArr = new Float32Array(prim.geometry.positions);
      const normArr = new Float32Array(prim.geometry.normals);
      const idxArr = new Uint16Array(prim.geometry.indices);

      const posView = appendBuffer(posArr, 34962);
      const normView = appendBuffer(normArr, 34962);
      const idxView = appendBuffer(idxArr, 34963);

      const { min, max } = computeMinMaxVec3(posArr);
      const posAcc = accessors.length;
      accessors.push({
        bufferView: posView,
        componentType: 5126,
        count: posArr.length / 3,
        type: 'VEC3',
        min,
        max,
      });

      const normAcc = accessors.length;
      accessors.push({
        bufferView: normView,
        componentType: 5126,
        count: normArr.length / 3,
        type: 'VEC3',
      });

      const idxAcc = accessors.length;
      accessors.push({
        bufferView: idxView,
        componentType: 5123,
        count: idxArr.length,
        type: 'SCALAR',
      });

      primitives.push({
        attributes: { POSITION: posAcc, NORMAL: normAcc },
        indices: idxAcc,
        material: prim.materialIndex,
      });
    }

    const meshIndex = meshes.length;
    meshes.push({ name: `${nodeDef.name}_Mesh`, primitives });

    const gltfNode = {
      name: nodeDef.name,
      mesh: meshIndex,
    };
    if (nodeDef.translation) gltfNode.translation = nodeDef.translation;
    if (nodeDef.rotation) gltfNode.rotation = nodeDef.rotation;
    gltfNodes.push(gltfNode);
  }

  const gltfAnimations = [];
  for (const anim of animations) {
    const tArr = new Float32Array(anim.times);
    const tView = appendBuffer(tArr);
    const tAcc = accessors.length;
    accessors.push({
      bufferView: tView,
      componentType: 5126,
      count: tArr.length,
      type: 'SCALAR',
      min: [tArr[0]],
      max: [tArr[tArr.length - 1]],
    });

    const vArr = new Float32Array(anim.translations.flat());
    const vView = appendBuffer(vArr);
    const vAcc = accessors.length;
    accessors.push({
      bufferView: vView,
      componentType: 5126,
      count: anim.translations.length,
      type: 'VEC3',
    });

    const rArr = new Float32Array(anim.rotations.flat());
    const rView = appendBuffer(rArr);
    const rAcc = accessors.length;
    accessors.push({
      bufferView: rView,
      componentType: 5126,
      count: anim.rotations.length,
      type: 'VEC4',
    });

    gltfAnimations.push({
      name: anim.name,
      samplers: [
        { input: tAcc, interpolation: 'LINEAR', output: vAcc },
        { input: tAcc, interpolation: 'LINEAR', output: rAcc },
      ],
      channels: [
        { sampler: 0, target: { node: anim.nodeIndex, path: 'translation' } },
        { sampler: 1, target: { node: anim.nodeIndex, path: 'rotation' } },
      ],
    });
  }

  const jsonObj = {
    asset: { version: '2.0', generator: 'GrammarCasino-Antigravity-GLB-Generator' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: gltfNodes.map((_, i) => i) }],
    nodes: gltfNodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };
  if (gltfAnimations.length > 0) {
    jsonObj.animations = gltfAnimations;
  }

  const jsonBuffer = Buffer.from(JSON.stringify(jsonObj), 'utf8');
  const jsonPad = (4 - (jsonBuffer.length % 4)) % 4;
  const jsonChunkData = jsonPad > 0
    ? Buffer.concat([jsonBuffer, Buffer.alloc(jsonPad, 0x20)])
    : jsonBuffer;

  const binChunkData = Buffer.concat(binaryChunks);

  const totalLength = 12 + 8 + jsonChunkData.length + 8 + binChunkData.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);          // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonChunkData.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binChunkData.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonChunkHeader, jsonChunkData, binChunkHeader, binChunkData]);
}

function writeGlbFile(filename, data) {
  const fullPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(fullPath, data);
  console.log(`[Grammar Casino GLB] Generated ${fullPath} (${(data.length / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------------------
// 1. poker_chips.glb ($10 Blue, $25 Green, $50 Red, $100 Black/Gold, $500 Purple)
// ---------------------------------------------------------------------------
function generatePokerChipsGlb() {
  const specs = [
    { name: 'Chip_10',  clay: [0.11, 0.36, 0.82, 1], spot: [0.95, 0.96, 0.98, 1], x: -2.4 },
    { name: 'Chip_25',  clay: [0.08, 0.58, 0.32, 1], spot: [0.95, 0.96, 0.98, 1], x: -1.2 },
    { name: 'Chip_50',  clay: [0.82, 0.14, 0.16, 1], spot: [0.95, 0.96, 0.98, 1], x:  0.0 },
    { name: 'Chip_100', clay: [0.12, 0.12, 0.14, 1], spot: [0.92, 0.74, 0.25, 1], x:  1.2 },
    { name: 'Chip_500', clay: [0.48, 0.18, 0.78, 1], spot: [0.95, 0.78, 0.28, 1], x:  2.4 },
  ];

  const materials = [
    {
      name: 'BrassInlay',
      pbrMetallicRoughness: { baseColorFactor: [0.88, 0.69, 0.24, 1], metallicFactor: 0.85, roughnessFactor: 0.25 },
    },
  ];
  const nodes = [];

  for (const s of specs) {
    const clayMatIdx = materials.length;
    materials.push({
      name: `${s.name}_Clay`,
      pbrMetallicRoughness: { baseColorFactor: s.clay, metallicFactor: 0.05, roughnessFactor: 0.52 },
    });
    const spotMatIdx = materials.length;
    materials.push({
      name: `${s.name}_Spot`,
      pbrMetallicRoughness: { baseColorFactor: s.spot, metallicFactor: 0.18, roughnessFactor: 0.35 },
    });

    const bodyGeo = createCylinderGeometry(0.45, 0.45, 0.09, 36);
    const ringGeo = createTorusGeometry(0.30, 0.018, 12, 28, [0, 0.038, 0]);
    const botRingGeo = createTorusGeometry(0.30, 0.018, 12, 28, [0, -0.038, 0]);

    const spotGeos = [createCylinderGeometry(0.21, 0.21, 0.094, 24)];
    for (let k = 0; k < 6; k++) {
      const ang = (k * Math.PI) / 3;
      spotGeos.push(
        createBoxGeometry(0.085, 0.093, 0.095, [Math.cos(ang) * 0.415, 0, Math.sin(ang) * 0.415], -ang)
      );
    }

    nodes.push({
      name: s.name,
      translation: [s.x, 0.045, 0],
      primitives: [
        { geometry: bodyGeo, materialIndex: clayMatIdx },
        { geometry: mergeGeometries([ringGeo, botRingGeo]), materialIndex: 0 },
        { geometry: mergeGeometries(spotGeos), materialIndex: spotMatIdx },
      ],
    });
  }

  writeGlbFile('poker_chips.glb', buildGlb({ materials, nodes }));
}

// ---------------------------------------------------------------------------
// 2. card_shoe.glb (DealerCardShoe + PowerUpCard with `CardDrawSlide` animation)
// ---------------------------------------------------------------------------
function generateCardShoeGlb() {
  const materials = [
    {
      name: 'MahoganyWood',
      pbrMetallicRoughness: { baseColorFactor: [0.24, 0.08, 0.05, 1], metallicFactor: 0.05, roughnessFactor: 0.28 },
    },
    {
      name: 'BrushedBrass',
      pbrMetallicRoughness: { baseColorFactor: [0.85, 0.68, 0.24, 1], metallicFactor: 0.90, roughnessFactor: 0.22 },
    },
    {
      name: 'PowerUpFoil',
      pbrMetallicRoughness: { baseColorFactor: [0.95, 0.76, 0.26, 1], metallicFactor: 0.88, roughnessFactor: 0.16 },
      emissiveFactor: [0.28, 0.20, 0.04],
    },
  ];

  const shoeGeo = createBoxGeometry(0.7, 0.42, 1.35, [0, 0, 0]);
  const lipGeo = createBoxGeometry(0.74, 0.12, 0.08, [0, -0.15, 0.68]);
  const cardGeo = createBoxGeometry(0.48, 0.014, 0.72, [0, 0, 0]);

  const nodes = [
    {
      name: 'DealerCardShoe',
      translation: [0, 0.35, 0],
      primitives: [
        { geometry: shoeGeo, materialIndex: 0 },
        { geometry: lipGeo, materialIndex: 1 },
      ],
    },
    {
      name: 'PowerUpCard',
      translation: [0, 0.31, 0.58],
      rotation: [0.1908, 0, 0, 0.9816],
      primitives: [{ geometry: cardGeo, materialIndex: 2 }],
    },
  ];

  const animations = [
    {
      name: 'CardDrawSlide',
      nodeIndex: 1,
      times: [0.0, 0.5, 1.0],
      translations: [
        [0, 0.31, 0.58],
        [0, 0.44, 1.12],
        [0, 0.62, 1.35],
      ],
      rotations: [
        [0.1908, 0, 0, 0.9816],
        [0.3420, 0, 0.7071, 0.6188],
        [0, 0.9511, 0.3090, 0],
      ],
    },
  ];

  writeGlbFile('card_shoe.glb', buildGlb({ materials, nodes, animations }));
}

// ---------------------------------------------------------------------------
// 3. wheel_of_fortune.glb (WheelDisc + 20 Brass Pegs + WheelFlapper)
// ---------------------------------------------------------------------------
function generateWheelGlb() {
  const materials = [
    {
      name: 'WheelBrass',
      pbrMetallicRoughness: { baseColorFactor: [0.88, 0.70, 0.25, 1], metallicFactor: 0.92, roughnessFactor: 0.2 },
    },
    {
      name: 'WheelHub',
      pbrMetallicRoughness: { baseColorFactor: [0.07, 0.10, 0.14, 1], metallicFactor: 0.4, roughnessFactor: 0.35 },
    },
    {
      name: 'FlapperLeather',
      pbrMetallicRoughness: { baseColorFactor: [0.82, 0.12, 0.16, 1], metallicFactor: 0.1, roughnessFactor: 0.4 },
    },
  ];

  const discGeo = createCylinderGeometry(1.8, 1.8, 0.14, 60);
  const rimGeo = createTorusGeometry(1.82, 0.09, 14, 48, [0, 0.02, 0]);
  const hubGeo = createCylinderGeometry(0.28, 0.28, 0.22, 24, [0, 0.04, 0]);
  const pegGeos = [rimGeo, hubGeo];

  for (let i = 0; i < 20; i++) {
    const angle = ((i * 18 - 81) * Math.PI) / 180;
    const px = 1.72 * Math.cos(angle);
    const pz = 1.72 * Math.sin(angle);
    pegGeos.push(createCylinderGeometry(0.032, 0.032, 0.18, 12, [px, 0.11, pz]));
  }

  const flapperGeo = createCylinderGeometry(0.015, 0.11, 0.34, 16);

  const nodes = [
    {
      name: 'WheelDisc',
      translation: [0, 0, 0],
      primitives: [
        { geometry: discGeo, materialIndex: 1 },
        { geometry: mergeGeometries(pegGeos), materialIndex: 0 },
      ],
    },
    {
      name: 'WheelFlapper',
      translation: [0, 0.16, 1.92],
      primitives: [{ geometry: flapperGeo, materialIndex: 2 }],
    },
  ];

  writeGlbFile('wheel_of_fortune.glb', buildGlb({ materials, nodes }));
}

// ---------------------------------------------------------------------------
// 4. powerup_totems.glb (Totem_ShieldDome, Totem_SubZeroIce, Totem_Boomerang, Totem_StreakCrown)
// ---------------------------------------------------------------------------
function generatePowerUpTotemsGlb() {
  const materials = [
    {
      name: 'ShieldEnergy',
      alphaMode: 'BLEND',
      pbrMetallicRoughness: { baseColorFactor: [0.22, 0.62, 0.98, 0.42], metallicFactor: 0.15, roughnessFactor: 0.08 },
      emissiveFactor: [0.22, 0.62, 0.98],
    },
    {
      name: 'SubZeroIce',
      alphaMode: 'BLEND',
      pbrMetallicRoughness: { baseColorFactor: [0.45, 0.88, 0.98, 0.62], metallicFactor: 0.05, roughnessFactor: 0.06 },
      emissiveFactor: [0.20, 0.55, 0.72],
    },
    {
      name: 'BoomerangAmber',
      pbrMetallicRoughness: { baseColorFactor: [0.94, 0.55, 0.14, 1.0], metallicFactor: 0.45, roughnessFactor: 0.25 },
      emissiveFactor: [0.35, 0.18, 0.04],
    },
    {
      name: 'StreakGold',
      pbrMetallicRoughness: { baseColorFactor: [0.96, 0.78, 0.22, 1.0], metallicFactor: 0.92, roughnessFactor: 0.16 },
      emissiveFactor: [0.38, 0.28, 0.06],
    },
  ];

  const domeGeo = createSphereDomeGeometry(0.65, 14, 24);
  const iceGeo = createBoxGeometry(0.85, 0.85, 0.85);
  const boomGeo = mergeGeometries([
    createBoxGeometry(0.55, 0.06, 0.14, [-0.18, 0, 0], 0.55),
    createBoxGeometry(0.55, 0.06, 0.14, [0.18, 0, 0], -0.55),
  ]);

  const crownParts = [createCylinderGeometry(0.42, 0.38, 0.18, 24)];
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    crownParts.push(
      createCylinderGeometry(0.01, 0.08, 0.22, 12, [Math.cos(ang) * 0.36, 0.18, Math.sin(ang) * 0.36])
    );
  }
  const crownGeo = mergeGeometries(crownParts);

  const nodes = [
    {
      name: 'Totem_ShieldDome',
      translation: [-2.2, 0.65, 0],
      primitives: [{ geometry: domeGeo, materialIndex: 0 }],
    },
    {
      name: 'Totem_SubZeroIce',
      translation: [-0.7, 0.55, 0],
      primitives: [{ geometry: iceGeo, materialIndex: 1 }],
    },
    {
      name: 'Totem_Boomerang',
      translation: [0.8, 0.45, 0],
      primitives: [{ geometry: boomGeo, materialIndex: 2 }],
    },
    {
      name: 'Totem_StreakCrown',
      translation: [2.2, 0.24, 0],
      primitives: [{ geometry: crownGeo, materialIndex: 3 }],
    },
  ];

  writeGlbFile('powerup_totems.glb', buildGlb({ materials, nodes }));
}

generatePokerChipsGlb();
generateCardShoeGlb();
generateWheelGlb();
generatePowerUpTotemsGlb();
console.log('[Grammar Casino GLB] All 4 .glb asset packs generated in public/models/');
