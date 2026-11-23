/**
 * Builders for the 3D campus model. Each function adds one concern to the scene and
 * registers GPU resources with a shared disposer so the component can clean up fully.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Camera } from 'three';
import { CAMPUS_BUILDINGS, FLOOR_HEIGHT, PATH_ANGLES, ROUTES, TREES } from './layout';

/** Theme colours read from CSS custom properties, so the model follows light/dark mode. */
export interface Palette {
  ink: Color;
  face: Color;
  ground: Color;
  path: Color;
  lawn: Color;
  signal: Color;
  tag: Color;
  backdrop: Color;
}

export function readPalette(el: Element): Palette {
  const style = getComputedStyle(el);
  const color = (name: string, fallback: string) =>
    new Color(style.getPropertyValue(name).trim() || fallback);
  return {
    ink: color('--scene-ink', '#14213d'),
    face: color('--scene-face', '#fbfcfd'),
    ground: color('--scene-ground', '#e4ebef'),
    path: color('--scene-path', '#c3d0d8'),
    lawn: color('--scene-lawn', '#cfe6e4'),
    signal: color('--scene-signal', '#0f6e6c'),
    tag: color('--scene-tag', '#f2c230'),
    backdrop: color('--scene-backdrop', '#ffffff'),
  };
}

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Collects disposable GPU resources; `track` returns its argument for inline use. */
export class Disposer {
  private readonly items: { dispose(): void }[] = [];
  track<T extends { dispose(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }
  disposeAll(): void {
    this.items.forEach((item) => item.dispose());
    this.items.length = 0;
  }
}

export interface BuildingModel {
  departmentId: string;
  meshes: Mesh[];
  material: MeshStandardMaterial;
  /** Top centre of the main block. */
  roof: Vector3;
}

export interface Parcel {
  curve: QuadraticBezierCurve3;
  mesh: Mesh;
  /** Phase offset (0..1) so parcels are spread along their routes. */
  offset: number;
}

/** A flat shape lying on the ground plane at height `y`. */
function groundShape(geo: BufferGeometry, color: Color, y: number, d: Disposer): Mesh {
  const mesh = new Mesh(d.track(geo), d.track(new MeshBasicMaterial({ color })));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/** Base slab, ring road, radiating footpaths and the central quad. */
export function addGround(campus: Group, p: Palette, d: Disposer): void {
  const slab = new Mesh(
    d.track(new BoxGeometry(12, 0.24, 10.5)),
    d.track(new MeshStandardMaterial({ color: p.ground, roughness: 1 })),
  );
  slab.position.y = -0.12;
  const edge = new LineSegments(
    d.track(new EdgesGeometry(slab.geometry)),
    d.track(new LineBasicMaterial({ color: p.ink, transparent: true, opacity: 0.35 })),
  );
  edge.position.copy(slab.position);
  campus.add(slab, edge);

  campus.add(groundShape(new RingGeometry(3.05, 3.45, 64), p.path, 0.005, d));
  campus.add(groundShape(new CircleGeometry(2.2, 48), p.lawn, 0.006, d));
  campus.add(groundShape(new CircleGeometry(0.55, 32), p.path, 0.008, d));
  for (const angle of PATH_ANGLES) {
    const strip = groundShape(new PlaneGeometry(0.28, 2.4), p.path, 0.007, d);
    strip.rotation.z = angle;
    strip.position.set(Math.cos(angle) * 3.6, 0.007, -Math.sin(angle) * 3.6);
    campus.add(strip);
  }
}

/** Low-poly trees sharing one trunk and one crown geometry. */
export function addTrees(campus: Group, p: Palette, d: Disposer): void {
  const trunkGeo = d.track(new CylinderGeometry(0.04, 0.05, 0.25, 6));
  const crownGeo = d.track(new ConeGeometry(0.28, 0.65, 7));
  const trunkMat = d.track(new MeshStandardMaterial({ color: p.ink, roughness: 1 }));
  const crownMat = d.track(
    new MeshStandardMaterial({ color: p.signal, roughness: 0.9, flatShading: true }),
  );
  for (const [x, z, scale] of TREES) {
    const trunk = new Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 0.12 * scale, z);
    trunk.scale.setScalar(scale);
    const crown = new Mesh(crownGeo, crownMat);
    crown.position.set(x, 0.55 * scale, z);
    crown.scale.setScalar(scale);
    campus.add(trunk, crown);
  }
}

/** Department buildings: outlined blocks with a floor band at every storey. */
export function addBuildings(campus: Group, p: Palette, d: Disposer): BuildingModel[] {
  const edgeMat = d.track(new LineBasicMaterial({ color: p.ink }));
  const bandMat = d.track(
    new LineBasicMaterial({ color: p.ink, transparent: true, opacity: 0.35 }),
  );

  return CAMPUS_BUILDINGS.map(({ departmentId, blocks }) => {
    const material = d.track(new MeshStandardMaterial({ color: p.face, roughness: 0.85 }));
    const meshes = blocks.map(([x, z, w, depth, h]) => {
      const geo = d.track(new BoxGeometry(w, h, depth));
      const mesh = new Mesh(geo, material);
      mesh.position.set(x, h / 2, z);
      mesh.userData.departmentId = departmentId;
      const outline = new LineSegments(d.track(new EdgesGeometry(geo)), edgeMat);
      outline.position.copy(mesh.position);
      campus.add(mesh, outline);

      const bandGeo = d.track(new EdgesGeometry(d.track(new PlaneGeometry(w, depth))));
      for (let y = FLOOR_HEIGHT; y < h - 0.05; y += FLOOR_HEIGHT) {
        const band = new LineSegments(bandGeo, bandMat);
        band.rotation.x = -Math.PI / 2;
        band.position.set(x, y, z);
        campus.add(band);
      }
      return mesh;
    });
    const [x, z, , , h] = blocks[0]!;
    return { departmentId, meshes, material, roof: new Vector3(x, h, z) };
  });
}

/** Dashed arcs between department roofs, each carrying one equipment parcel. */
export function addRoutes(
  campus: Group,
  buildings: BuildingModel[],
  p: Palette,
  d: Disposer,
): Parcel[] {
  const lineMat = d.track(
    new LineDashedMaterial({ color: p.signal, dashSize: 0.18, gapSize: 0.12 }),
  );
  const parcelGeo = d.track(new SphereGeometry(0.12, 16, 12));
  const parcelMat = d.track(
    new MeshStandardMaterial({ color: p.tag, emissive: p.tag, emissiveIntensity: 0.35 }),
  );
  const lift = new Vector3(0, 0.05, 0);

  return ROUTES.map(([a, b], i) => {
    const from = buildings[a]!.roof.clone().add(lift);
    const to = buildings[b]!.roof.clone().add(lift);
    const mid = from.clone().lerp(to, 0.5);
    mid.y = Math.max(from.y, to.y) + 1.6;
    const curve = new QuadraticBezierCurve3(from, mid, to);
    const line = new Line(
      d.track(new BufferGeometry().setFromPoints(curve.getPoints(60))),
      lineMat,
    );
    line.computeLineDistances();
    const mesh = new Mesh(parcelGeo, parcelMat);
    campus.add(line, mesh);
    return { curve, mesh, offset: i / ROUTES.length };
  });
}

/** Ground ring marking the selected building. Hidden until something is selected. */
export function addSelectionMarker(campus: Group, p: Palette, d: Disposer): Mesh {
  const marker = groundShape(new RingGeometry(1.15, 1.32, 48), p.tag, 0.012, d);
  marker.visible = false;
  campus.add(marker);
  return marker;
}

/** Moves parcels along their routes for animation time `t` (ms). */
export function animateParcels(parcels: Parcel[], t: number): void {
  for (const { curve, mesh, offset } of parcels) {
    mesh.position.copy(curve.getPoint((t * 0.00012 + offset) % 1));
  }
}

/**
 * Floating HTML name tags positioned over each building's roof. Decorative and
 * aria-hidden with the canvas; the interactive map provides an accessible list.
 */
export function createLabels(host: HTMLElement, buildings: BuildingModel[]) {
  const layer = document.createElement('div');
  layer.className = 'campus-labels';
  host.appendChild(layer);
  const projected = new Vector3();
  const labels = CAMPUS_BUILDINGS.map(({ label }, i) => {
    const el = document.createElement('span');
    el.className = 'campus-label';
    el.textContent = label;
    layer.appendChild(el);
    return { el, anchor: buildings[i]!.roof.clone().add(new Vector3(0, 0.45, 0)) };
  });

  return {
    place(camera: Camera, campus: Group) {
      const { clientWidth: w, clientHeight: h } = host;
      for (const { el, anchor } of labels) {
        projected.copy(anchor).applyMatrix4(campus.matrixWorld).project(camera);
        const x = ((projected.x + 1) / 2) * w;
        const y = ((1 - projected.y) / 2) * h;
        el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      }
    },
    select(departmentId: string | null) {
      labels.forEach(({ el }, i) =>
        el.classList.toggle('is-selected', buildings[i]!.departmentId === departmentId),
      );
    },
    remove() {
      layer.remove();
    },
  };
}
