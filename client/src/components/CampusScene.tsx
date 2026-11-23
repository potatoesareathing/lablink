import { useEffect, useRef } from 'react';
import {
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import type { Mesh } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Disposer,
  addBuildings,
  addGround,
  addRoutes,
  addSelectionMarker,
  addTrees,
  animateParcels,
  createLabels,
  hasWebGL,
  readPalette,
} from '../three/campusModel';

/** Pointer travel (px) below which a press counts as a click rather than a drag. */
const CLICK_TOLERANCE = 5;

export interface CampusSceneProps {
  /** Enables orbit/zoom and building picking (the Campus map view). */
  interactive?: boolean;
  selected?: string | null;
  onSelect?: (departmentId: string) => void;
}

interface SceneHandle {
  highlight(departmentId: string | null): void;
}

/** Returns the department under a pointer event, if any. */
function createPicker(canvas: HTMLCanvasElement, camera: PerspectiveCamera, meshes: Mesh[]) {
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  return (e: PointerEvent): string | undefined => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(meshes)[0]?.object.userData.departmentId as
      string | undefined;
  };
}

/**
 * 3D campus model. Always aria-hidden: the interactive map pairs it with an accessible
 * department list offering the same choices. Renders a single static frame under
 * prefers-reduced-motion, pauses when off-screen, and renders nothing without WebGL.
 */
export function CampusScene({ interactive = false, selected = null, onSelect }: CampusSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasWebGL()) return;

    const palette = readPalette(host);
    const disposer = new Disposer();
    const renderer = disposer.track(new WebGLRenderer({ antialias: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = palette.backdrop;
    scene.fog = new Fog(palette.backdrop, 20, 36);
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 10, 4);
    scene.add(new HemisphereLight(0xffffff, palette.ink, 1.6), sun);

    const camera = new PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(11, 9.5, 12.5);
    camera.lookAt(0, 0.4, 0);

    const campus = new Group();
    scene.add(campus);
    addGround(campus, palette, disposer);
    addTrees(campus, palette, disposer);
    const buildings = addBuildings(campus, palette, disposer);
    const parcels = addRoutes(campus, buildings, palette, disposer);
    const marker = addSelectionMarker(campus, palette, disposer);
    const labels = createLabels(host, buildings);

    const controls = interactive ? new OrbitControls(camera, renderer.domElement) : null;
    if (controls) {
      controls.target.set(0, 0.6, 0);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 7;
      controls.maxDistance = 26;
      controls.maxPolarAngle = Math.PI / 2.2;
      controls.update();
      disposer.track(controls);
    }

    let lastTime = 4000;
    const draw = (time: number) => {
      lastTime = time;
      if (!interactive) campus.rotation.y = -0.35 + Math.sin(time * 0.00012) * 0.35;
      animateParcels(parcels, time);
      controls?.update();
      campus.updateMatrixWorld();
      renderer.render(scene, camera);
      labels.place(camera, campus);
    };

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw(lastTime);
    };

    handleRef.current = {
      highlight(departmentId) {
        const chosen = buildings.find((b) => b.departmentId === departmentId);
        for (const b of buildings) b.material.color.copy(b === chosen ? palette.tag : palette.face);
        labels.select(departmentId);
        marker.visible = !!chosen;
        if (chosen) marker.position.set(chosen.roof.x, marker.position.y, chosen.roof.z);
        draw(lastTime);
      },
    };

    // Picking: a click (not a drag) selects the department under the pointer.
    const canvas = renderer.domElement;
    const pick = createPicker(
      canvas,
      camera,
      buildings.flatMap((b) => b.meshes),
    );
    let downAt: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      downAt = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      const id = moved <= CLICK_TOLERANCE ? pick(e) : undefined;
      if (id) onSelectRef.current?.(id);
    };
    const onHover = (e: PointerEvent) => {
      if (!e.buttons) canvas.style.cursor = pick(e) ? 'pointer' : 'grab';
    };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (interactive) {
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointermove', onHover);
      if (reduceMotion) controls?.addEventListener('change', () => draw(lastTime));
    }

    // Animation loop: runs only while visible and motion is allowed.
    let frame = 0;
    let visible = true;
    const loop = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!reduceMotion && visible && !frame) frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) start();
      else stop();
    });
    visibility.observe(host);
    resize();
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      visibility.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointermove', onHover);
      handleRef.current = null;
      disposer.disposeAll();
      canvas.remove();
      labels.remove();
    };
  }, [interactive]);

  useEffect(() => {
    handleRef.current?.highlight(selected);
  }, [selected]);

  return (
    <div
      ref={hostRef}
      className={`campus-scene${interactive ? ' campus-scene-interactive' : ''}`}
      aria-hidden="true"
    />
  );
}
