import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { TIER_SETTINGS, type QualityTier } from '../show/quality';
import { TABLE_CAMERA } from '../show/tableView';
import { CLASSIC_LOOK, recolorPixels, type StageLook } from '../show/looks';
import { isSoftwareRenderer } from './Tabletop3DOverlay';

// Package V2 step 2: Table view. The Blender table and room, drawn behind the game screens with
// the same camera as the chips overlay, so tossed chips land on the real felt. The scene is
// still, so it is drawn once when the models arrive and again on resize: it costs nothing while
// the class plays. Lazy-loaded with the 3D chunk; phones never load it.

export interface TableBackdropProps {
  quality: QualityTier;
  /** Changes when the screen changes (the step): the still frame is drawn again then. */
  redrawKey?: string;
  /** Called when the table cannot be drawn here, so the game falls back to Classic view. */
  onUnavailable?: (reason: string) => void;
  /** Package V8: the theme's felt and lamp colours. */
  look?: StageLook;
}

/** A recoloured copy of the felt texture (package V8), drawn once per colour. */
function recoloredFelt(original: THREE.Texture, rgb: [number, number, number]): THREE.Texture | null {
  const img = original.image as CanvasImageSource & { width: number; height: number };
  if (!img || !img.width || typeof document === 'undefined') return null;
  const scale = Math.min(1, 512 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = g.getImageData(0, 0, canvas.width, canvas.height);
  recolorPixels(pixels.data, rgb);
  g.putImageData(pixels, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = original.colorSpace;
  tex.flipY = original.flipY;
  tex.wrapS = original.wrapS;
  tex.wrapT = original.wrapT;
  tex.repeat.copy(original.repeat);
  tex.offset.copy(original.offset);
  tex.channel = original.channel;
  tex.anisotropy = original.anisotropy;
  return tex;
}

/** Development only: `?force3d=1` draws the table on software WebGL, for screenshots. */
const forced = () => {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV) && new URLSearchParams(window.location.search).get('force3d') === '1';
  } catch {
    return false;
  }
};

export const TableBackdrop: React.FC<TableBackdropProps> = ({ quality, redrawKey, onUnavailable, look = CLASSIC_LOOK }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const applyLookRef = useRef<((l: StageLook) => void) | null>(null);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  useEffect(() => {
    const container = ref.current;
    if (!container || quality === 'off') return;
    const tier = TIER_SETTINGS[quality];
    let renderer: THREE.WebGLRenderer;
    try {
      // preserveDrawingBuffer: the scene is drawn once, so the browser must keep that frame.
      renderer = new THREE.WebGLRenderer({ antialias: tier.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    } catch {
      unavailableRef.current?.('no WebGL');
      return;
    }
    if (isSoftwareRenderer(renderer) && !forced()) {
      renderer.dispose();
      unavailableRef.current?.('software graphics');
      return;
    }
    let disposed = false;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      unavailableRef.current?.('graphics context lost');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14100f);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmrem.dispose();
    // One key light plus the environment (the plan's lighting budget), and a soft fill.
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xfff3d1, 1.85);
    key.position.set(1.5, 7.5, 3.5);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(TABLE_CAMERA.fov, 1, 0.1, 60);
    camera.position.set(...TABLE_CAMERA.position);
    camera.lookAt(...TABLE_CAMERA.lookAt);

    // Package V7: finishing light, High only. The frame is still, so it costs one draw.
    if (tier.shadowMapSize > 0) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      key.castShadow = true;
      key.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
      const cam = key.shadow.camera;
      cam.left = -4.5;
      cam.right = 4.5;
      cam.top = 4.5;
      cam.bottom = -4.5;
      cam.near = 1;
      cam.far = 20;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.03;
      key.shadow.radius = 3;
    }
    let composer: EffectComposer | null = null;
    if (tier.bloom) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      // Only the brightest highlights (gold, the lamp's glints) glow, at low resolution.
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.9));
      const vignette = new ShaderPass(VignetteShader);
      vignette.uniforms.offset.value = 1.05;
      vignette.uniforms.darkness.value = 1.15;
      composer.addPass(vignette);
      composer.addPass(new OutputPass());
    }

    const draw = () => {
      if (disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(w, h);
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    };
    draw();

    const loader = new GLTFLoader();
    const load = (file: string) =>
      new Promise<THREE.Object3D>((resolve, reject) => loader.load(`/models/${file}`, (g) => resolve(g.scene), undefined, reject));
    // Package V8: the felt and the lamp take the theme's colours.
    let feltMaterial: THREE.MeshStandardMaterial | null = null;
    let feltOriginal: THREE.Texture | null = null;
    const feltCopies = new Map<string, THREE.Texture>();
    const applyLook = (l: StageLook) => {
      key.color.setHex(l.lamp);
      if (feltMaterial && feltOriginal) {
        let map: THREE.Texture | null = feltOriginal;
        if (l.felt) {
          const id = l.felt.join(',');
          map = feltCopies.get(id) ?? recoloredFelt(feltOriginal, l.felt);
          if (map) feltCopies.set(id, map);
        }
        if (map && feltMaterial.map !== map) {
          feltMaterial.map = map;
          feltMaterial.needsUpdate = true;
        }
      }
      draw();
    };
    applyLookRef.current = applyLook;
    Promise.all([load('room.glb'), load('table.glb')])
      .then(([room, table]) => {
        if (disposed) return;
        table.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && !Array.isArray(m) && m.name === 'Felt' && m.map) {
            feltMaterial = m;
            feltOriginal = m.map;
          }
        });
        if (tier.shadowMapSize > 0) {
          table.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          room.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
          });
        }
        scene.add(room, table);
        applyLook(lookRef.current);
        container.dataset.ready = 'true';
      })
      .catch(() => unavailableRef.current?.('models did not load'));

    // Some browsers drop a still WebGL frame when the page around it changes a lot, so the frame is
    // drawn again on each new screen, when the tab comes back, and every few seconds (one draw).
    drawRef.current = draw;
    const onVisible = () => {
      if (document.visibilityState === 'visible') draw();
    };
    const keepAlive = window.setInterval(draw, 4000);
    window.addEventListener('resize', draw);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      drawRef.current = null;
      applyLookRef.current = null;
      if (feltMaterial && feltOriginal) feltMaterial.map = feltOriginal;
      feltCopies.forEach((t) => t.dispose());
      window.clearInterval(keepAlive);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('resize', draw);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
        mats.forEach((m) => {
          Object.values(m).forEach((v) => {
            if (v instanceof THREE.Texture) v.dispose();
          });
          m.dispose();
        });
      });
      envTexture.dispose();
      composer?.dispose();
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [quality]);

  useEffect(() => {
    applyLookRef.current?.(look);
  }, [look]);

  useEffect(() => {
    const id = window.setTimeout(() => drawRef.current?.(), 60);
    return () => window.clearTimeout(id);
  }, [redrawKey]);

  // The veil (index.css) keeps every line of text readable over the felt and the gold line.
  return (
    <>
      <div ref={ref} aria-hidden="true" data-testid="table-backdrop" className="fixed inset-0 pointer-events-none" style={{ zIndex: -1 }} />
      <div aria-hidden="true" className="gc-table-veil fixed inset-0 pointer-events-none" style={{ zIndex: -1 }} />
    </>
  );
};

export default TableBackdrop;
