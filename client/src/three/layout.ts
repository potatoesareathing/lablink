/** Static campus layout for the 3D model (world units; y is up, the slab is 12 x 10.5). */

/** One building volume: centre x/z, footprint width/depth, height. */
export type Block = [x: number, z: number, w: number, d: number, h: number];

export interface CampusBuilding {
  departmentId: string;
  /** Short name shown on the floating tag. */
  label: string;
  /** Main block first; its roof anchors routes and labels. */
  blocks: Block[];
}

export const CAMPUS_BUILDINGS: CampusBuilding[] = [
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
export const ROUTES: [from: number, to: number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 0],
  [0, 2],
  [1, 3],
];

/** Trees: x, z, scale. */
export const TREES: [x: number, z: number, scale: number][] = [
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

/** Footpath directions (radians) radiating from the ring road. */
export const PATH_ANGLES = [0.35, 1.6, 2.75, 3.95, 5.2];

/** Storey height used to draw floor bands on buildings. */
export const FLOOR_HEIGHT = 0.32;
