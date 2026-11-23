import { useEffect, useRef } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Fog,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Block = [x: number, z: number, w: number, d: number, h: number];

/** Department buildings as an architectural massing model: main block + annexes. */
export const CAMPUS_BUILDINGS: { departmentId: string; label: string; blocks: Block[] }[] = [
  {
    departmentId: 'cse',
    label: 'CSE',
    blocks: [
      [-3.4, -1.7, 1.7, 1.2, 1.6],
      [-2.5, -0.9, 0.8, 0.7, 0.9],
    ],
  },
  {
    departmentId: 'ece',
    label: 'ECE',
    blocks: [
      [0.1, -2.9, 1.2, 1.2, 2.6],
      [1.1, -2.6, 0.9, 1.4, 1.2],
    ],
  },
  {
    departmentId: 'mech',
    label: 'MECH',
    blocks: [
      [3.3, -0.6, 1.9, 1.3, 0.9],
      [3.3, 0.6, 1.2, 0.8, 0.6],
    ],
  },
  {
    departmentId: 'bio',
    label: 'BIO',
    blocks: [
      [1.9, 2.6, 1.4, 1.2, 1.9],
      [0.9, 2.9, 0.7, 0.7, 1.1],
    ],
  },
  {
    departmentId: 'des',
    label: 'DESIGN',
    blocks: [
      [-2.3, 2.6, 1.6, 1.0, 1.3],
      [-3.3, 2.2, 0.6, 0.9, 0.7],
    ],
  },
];

/** Equipment routes between departments (indexes into CAMPUS_BUILDINGS). */
const ROUTES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 0],
  [0, 2],
  [1, 3],
];

const TREES: [number, number, number][] = [
  [-0.9, -0.2, 0.9],
  [0.9, 0.3, 1.1],
  [-0.4, 1.1, 0.8],
  [0.6, -1.2, 0.7],
  [-1.4, 0.9, 1],
  [1.5, 1.2, 0.8],
  [-4.6, 0.6, 0.9],
  [4.7, 1.8, 1],
  [-0.6, 4.2, 0.8],
  [3.9, -2.8, 0.9],
  [-4.2, -3.4, 1.1],
  [2.6, 4.3, 0.7],
];

const FLOOR = 0.32;

const cssColor = (el: Element, name: string, fallback: string) =>
  new Color(getComputedStyle(el).getPropertyValue(name).trim() || fallback);

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

interface SceneHandle {
  highlight(departmentId: string | null): void;
}

export interface CampusSceneProps {
  /** Enables orbit/zoom and building picking (the Campus map view). */
  interactive?: boolean;
  selected?: string | null;
  onSelect?: (departmentId: string) => void;
}

/**
 * 3D campus model: department buildings, quad, paths and trees on a base slab, with
 * equipment travelling between departments along dashed routes. Always aria-hidden:
 * the interactive map pairs it with an accessible list offering the same choices.
 * Static under prefers-reduced-motion; paused off-screen.
 */
export default function CampusScene({
  interactive = false,
  selected = null,
  onSelect,
}: CampusSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasWebGL()) return;

    const ink = cssColor(host, '--scene-ink', '#14213d');
    const face = cssColor(host, '--scene-face', '#ffffff');
    const ground = cssColor(host, '--scene-ground', '#eef2f4');
    const path = cssColor(host, '--scene-path', '#c9d6de');
    const lawn = cssColor(host, '--scene-lawn', '#cfe6e4');
    const signal = cssColor(host, '--scene-signal', '#0f6e6c');
    const tag = cssColor(host, '--scene-tag', '#f2c230');
    const backdrop = cssColor(host, '--scene-backdrop', '#ffffff');

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = backdrop;
    scene.fog = new Fog(backdrop, 20, 36);
    scene.add(new HemisphereLight(0xffffff, ink, 1.6));
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 10, 4);
    scene.add(sun);

    const camera = new PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(11, 9.5, 12.5);
    camera.lookAt(0, 0.4, 0);

    const campus = new Group();
    scene.add(campus);
    const disposables: { dispose(): void }[] = [renderer];
    const keep = <T extends { dispose(): void }>(x: T) => {
      disposables.push(x);
      return x;
    };

    // Base slab, ring road, footpaths and the central quad.
    const slab = new Mesh(
      keep(new BoxGeometry(12, 0.24, 10.5)),
      keep(new MeshStandardMaterial({ color: ground, roughness: 1 })),
    );
    slab.position.y = -0.12;
    const slabEdge = new LineSegments(
      keep(new EdgesGeometry(slab.geometry)),
      keep(new LineBasicMaterial({ color: ink, transparent: true, opacity: 0.35 })),
    );
    slabEdge.position.copy(slab.position);
    campus.add(slab, slabEdge);

    const flat = (geo: BufferGeometry, color: Color, y: number) => {
      const m = new Mesh(keep(geo), keep(new MeshBasicMaterial({ color })));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      return m;
    };
    campus.add(flat(new RingGeometry(3.05, 3.45, 64), path, 0.005));
    campus.add(flat(new CircleGeometry(2.2, 48), lawn, 0.006));
    campus.add(flat(new CircleGeometry(0.55, 32), path, 0.008));
    for (const angle of [0.35, 1.6, 2.75, 3.95, 5.2]) {
      const strip = flat(new PlaneGeometry(0.28, 2.4), path, 0.007);
      strip.rotation.z = angle;
      strip.position.set(Math.cos(angle) * 3.6, 0.007, -Math.sin(angle) * 3.6);
      campus.add(strip);
    }

    // Low-poly trees.
    const trunkGeo = keep(new CylinderGeometry(0.04, 0.05, 0.25, 6));
    const crownGeo = keep(new ConeGeometry(0.28, 0.65, 7));
    const trunkMat = keep(new MeshStandardMaterial({ color: ink, roughness: 1 }));
    const crownMat = keep(
      new MeshStandardMaterial({ color: signal, roughness: 0.9, flatShading: true }),
    );
    for (const [x, z, s] of TREES) {
      const trunk = new Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 0.12 * s, z);
      trunk.scale.setScalar(s);
      const crown = new Mesh(crownGeo, crownMat);
      crown.position.set(x, 0.55 * s, z);
      crown.scale.setScalar(s);
      campus.add(trunk, crown);
    }

    // Department buildings with floor bands.
    const edgeMat = keep(new LineBasicMaterial({ color: ink }));
    const bandMat = keep(new LineBasicMaterial({ color: ink, transparent: true, opacity: 0.35 }));
    const buildings = CAMPUS_BUILDINGS.map(({ departmentId, blocks }) => {
      const mat = keep(new MeshStandardMaterial({ color: face, roughness: 0.85 }));
      const meshes: Mesh[] = [];
      let top = new Vector3();
      blocks.forEach(([x, z, w, d, h], i) => {
        const geo = keep(new BoxGeometry(w, h, d));
        const mesh = new Mesh(geo, mat);
        mesh.position.set(x, h / 2, z);
        mesh.userData.departmentId = departmentId;
        const outline = new LineSegments(keep(new EdgesGeometry(geo)), edgeMat);
        outline.position.copy(mesh.position);
        campus.add(mesh, outline);
        meshes.push(mesh);
        for (let y = FLOOR; y < h - 0.05; y += FLOOR) {
          const band = new LineSegments(
            keep(new EdgesGeometry(keep(new PlaneGeometry(w * 1.002, d * 1.002)))),
            bandMat,
          );
          band.rotation.x = -Math.PI / 2;
          band.position.set(x, y, z);
          campus.add(band);
        }
        if (i === 0) top = new Vector3(x, h, z);
      });
      return { departmentId, meshes, mat, roof: top };
    });

    const allMeshes = buildings.flatMap((b) => b.meshes);
    const marker = flat(new RingGeometry(1.15, 1.32, 48), tag, 0.012);
    marker.visible = false;
    campus.add(marker);

    // Equipment routes: dashed arcs with parcels travelling along them.
    const routeMat = keep(new LineDashedMaterial({ color: signal, dashSize: 0.18, gapSize: 0.12 }));
    const parcelGeo = keep(new SphereGeometry(0.12, 16, 12));
    const parcelMat = keep(
      new MeshStandardMaterial({ color: tag, emissive: tag, emissiveIntensity: 0.35 }),
    );
    const parcels = ROUTES.map(([a, b], i) => {
      const from = buildings[a]!.roof.clone().add(new Vector3(0, 0.05, 0));
      const to = buildings[b]!.roof.clone().add(new Vector3(0, 0.05, 0));
      const mid = from.clone().lerp(to, 0.5);
      mid.y = Math.max(from.y, to.y) + 1.6;
      const curve = new QuadraticBezierCurve3(from, mid, to);
      const line = new Line(
        keep(new BufferGeometry().setFromPoints(curve.getPoints(60))),
        routeMat,
      );
      line.computeLineDistances();
      campus.add(line);
      const parcel = new Mesh(parcelGeo, parcelMat);
      campus.add(parcel);
      return { curve, parcel, offset: i / ROUTES.length };
    });

    // Floating department name tags (decorative; the accessible list is the real control).
    const labelLayer = document.createElement('div');
    labelLayer.className = 'campus-labels';
    host.appendChild(labelLayer);
    const labels = CAMPUS_BUILDINGS.map(({ label }, i) => {
      const el = document.createElement('span');
      el.className = 'campus-label';
      el.textContent = label;
      labelLayer.appendChild(el);
      return { el, anchor: buildings[i]!.roof.clone().add(new Vector3(0, 0.45, 0)) };
    });
    const projected = new Vector3();

    const controls = interactive ? new OrbitControls(camera, renderer.domElement) : null;
    if (controls) {
      controls.target.set(0, 0.6, 0);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 7;
      controls.maxDistance = 26;
      controls.maxPolarAngle = Math.PI / 2.2;
      controls.update();
      disposables.push(controls);
    }

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const placeLabels = () => {
      const { clientWidth: w, clientHeight: h } = host;
      for (const { el, anchor } of labels) {
        projected.copy(anchor).applyMatrix4(campus.matrixWorld).project(camera);
        el.style.transform = `translate(-50%, -100%) translate(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px)`;
      }
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t = 4000;
    const draw = (time: number) => {
      t = time;
      if (!interactive) campus.rotation.y = -0.35 + Math.sin(time * 0.00012) * 0.35;
      for (const p of parcels) {
        p.parcel.position.copy(p.curve.getPoint((time * 0.00012 + p.offset) % 1));
      }
      controls?.update();
      campus.updateMatrixWorld();
      renderer.render(scene, camera);
      placeLabels();
    };

    handleRef.current = {
      highlight(departmentId) {
        const chosen = buildings.find((b) => b.departmentId === departmentId);
        for (const b of buildings) b.mat.color.copy(b === chosen ? tag : face);
        labels.forEach(({ el }, i) =>
          el.classList.toggle('is-selected', buildings[i]!.departmentId === departmentId),
        );
        marker.visible = !!chosen;
        if (chosen) marker.position.set(chosen.roof.x, 0.012, chosen.roof.z);
        draw(t);
      },
    };

    // Building picking: a click (not a drag) selects the department under the pointer.
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const pick = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(allMeshes)[0]?.object.userData.departmentId as
        string | undefined;
    };
    let downAt: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      downAt = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
      const id = pick(e);
      if (id) onSelectRef.current?.(id);
    };
    const onMove = (e: PointerEvent) => {
      if (!e.buttons) renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab';
    };
    if (interactive) {
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);
      renderer.domElement.addEventListener('pointermove', onMove);
      if (reduceMotion) controls?.addEventListener('change', () => draw(t));
    }

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

    const ro = new ResizeObserver(() => {
      resize();
      draw(t);
    });
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(host);

    resize();
    draw(t);
    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      handleRef.current = null;
      disposables.forEach((d) => d.dispose());
      renderer.domElement.remove();
      labelLayer.remove();
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
