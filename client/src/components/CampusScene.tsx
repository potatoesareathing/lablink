import { useEffect, useRef } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  Line,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  QuadraticBezierCurve3,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';

/** Department blocks laid out on the campus grid: [x, z, width, depth, height]. */
const BUILDINGS: [number, number, number, number, number][] = [
  [-3.2, -1.6, 1.6, 1.2, 1.4], // Computer Science
  [0.2, -2.6, 1.4, 1.4, 2.2], // Electronics
  [3.1, -0.9, 1.8, 1.1, 1.0], // Mechanical
  [1.6, 2.2, 1.3, 1.3, 1.7], // Biotechnology
  [-2.0, 2.3, 1.5, 1.0, 1.2], // Design
];

/** Equipment routes between departments (indexes into BUILDINGS). */
const ROUTES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 0],
  [0, 2],
  [1, 3],
];

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

/**
 * Decorative 3D campus: department buildings on a blueprint grid with equipment
 * travelling between them - the cross-department sharing LabLink enables.
 * Hidden from assistive tech; static under prefers-reduced-motion; paused off-screen.
 */
export default function CampusScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasWebGL()) return;

    const ink = cssColor(host, '--scene-ink', '#14213d');
    const grid = cssColor(host, '--scene-grid', '#c9d6de');
    const signal = cssColor(host, '--scene-signal', '#0f6e6c');
    const tag = cssColor(host, '--scene-tag', '#f2c230');

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(7.5, 6.5, 8.5);
    camera.lookAt(0, 0.4, 0);

    const campus = new Group();
    scene.add(campus);

    const gridHelper = new GridHelper(14, 28, grid, grid);
    campus.add(gridHelper);

    const disposables: { dispose(): void }[] = [gridHelper.geometry, renderer];
    const faceMat = new MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.08 });
    const edgeMat = new LineBasicMaterial({ color: ink });
    const routeMat = new LineBasicMaterial({ color: signal, transparent: true, opacity: 0.85 });
    const parcelMat = new MeshBasicMaterial({ color: tag });
    disposables.push(faceMat, edgeMat, routeMat, parcelMat);

    const roofs = BUILDINGS.map(([x, z, w, d, h]) => {
      const geo = new BoxGeometry(w, h, d);
      const edges = new EdgesGeometry(geo);
      disposables.push(geo, edges);
      const block = new Mesh(geo, faceMat);
      const outline = new LineSegments(edges, edgeMat);
      block.position.set(x, h / 2, z);
      outline.position.copy(block.position);
      campus.add(block, outline);
      return new Vector3(x, h, z);
    });

    const parcelGeo = new SphereGeometry(0.11, 16, 12);
    disposables.push(parcelGeo);
    const parcels = ROUTES.map(([a, b], i) => {
      const from = roofs[a]!;
      const to = roofs[b]!;
      const mid = from.clone().lerp(to, 0.5);
      mid.y = Math.max(from.y, to.y) + 1.4;
      const curve = new QuadraticBezierCurve3(from, mid, to);
      const geo = new BufferGeometry().setFromPoints(curve.getPoints(48));
      disposables.push(geo);
      campus.add(new Line(geo, routeMat));
      const parcel = new Mesh(parcelGeo, parcelMat);
      campus.add(parcel);
      return { curve, parcel, offset: i / ROUTES.length };
    });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const draw = (t: number) => {
      campus.rotation.y = t * 0.00006;
      for (const p of parcels) {
        p.parcel.position.copy(p.curve.getPoint((t * 0.00012 + p.offset) % 1));
      }
      renderer.render(scene, camera);
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let visible = true;
    const loop = (t: number) => {
      draw(t);
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
      if (reduceMotion) draw(4000);
    });
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(host);

    resize();
    draw(4000);
    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="campus-scene" aria-hidden="true" />;
}
