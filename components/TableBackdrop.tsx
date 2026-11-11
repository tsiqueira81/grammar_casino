import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TIER_SETTINGS, type QualityTier } from '../show/quality';
import { TABLE_CAMERA } from '../show/tableView';
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
}

/** Development only: `?force3d=1` draws the table on software WebGL, for screenshots. */
const forced = () => {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV) && new URLSearchParams(window.location.search).get('force3d') === '1';
  } catch {
    return false;
  }
};

export const TableBackdrop: React.FC<TableBackdropProps> = ({ quality, redrawKey, onUnavailable }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
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

    const draw = () => {
      if (disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    };
    draw();

    const loader = new GLTFLoader();
    const load = (file: string) =>
      new Promise<THREE.Object3D>((resolve, reject) => loader.load(`/models/${file}`, (g) => resolve(g.scene), undefined, reject));
    Promise.all([load('room.glb'), load('table.glb')])
      .then(([room, table]) => {
        if (disposed) return;
        scene.add(room, table);
        draw();
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
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [quality]);

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
