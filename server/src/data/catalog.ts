/** Static campus catalogue: departments, labs, equipment units and demo users. */
import type { Department, Lab, User } from '../../../shared/types.js';

export { equipmentSeed } from './equipment.js';

export const departments: Department[] = [
  { id: 'cse', name: 'Computer Science & Engineering' },
  { id: 'ece', name: 'Electronics & Communication' },
  { id: 'mech', name: 'Mechanical Engineering' },
  { id: 'bio', name: 'Biotechnology' },
  { id: 'des', name: 'Design' },
];

export const labs: Lab[] = [
  { id: 'cse-ai', name: 'AI & HPC Lab', departmentId: 'cse', location: 'Block A, Room 301' },
  { id: 'cse-iot', name: 'IoT Lab', departmentId: 'cse', location: 'Block A, Room 214' },
  { id: 'ece-elec', name: 'Electronics Lab 2', departmentId: 'ece', location: 'Block B, Room 105' },
  {
    id: 'ece-vlsi',
    name: 'VLSI & Embedded Lab',
    departmentId: 'ece',
    location: 'Block B, Room 210',
  },
  {
    id: 'mech-fab',
    name: 'Fabrication Lab',
    departmentId: 'mech',
    location: 'Workshop Block, Bay 2',
  },
  {
    id: 'bio-mol',
    name: 'Molecular Biology Lab',
    departmentId: 'bio',
    location: 'Block D, Room 120',
  },
  {
    id: 'des-maker',
    name: 'Maker Studio',
    departmentId: 'des',
    location: 'Design Block, Ground Floor',
  },
];

export const users: User[] = [
  {
    id: 'stu-aarav',
    name: 'Aarav Sharma',
    role: 'student',
    departmentId: 'mech',
    recentDenials: 0,
    overdueStrikes: 1,
  },
  { id: 'stu-diya', name: 'Diya Nair', role: 'student', departmentId: 'des', recentDenials: 1 },
  { id: 'stu-kabir', name: 'Kabir Rao', role: 'student', departmentId: 'cse', recentDenials: 0 },
  { id: 'stu-meera', name: 'Meera Iyer', role: 'student', departmentId: 'ece', recentDenials: 0 },
  { id: 'stu-rohan', name: 'Rohan Gupta', role: 'student', departmentId: 'cse', recentDenials: 0 },
  {
    id: 'fac-rao',
    name: 'Dr. Lakshmi Rao',
    role: 'faculty',
    departmentId: 'mech',
    recentDenials: 0,
  },
  {
    id: 'fac-menon',
    name: 'Prof. Arjun Menon',
    role: 'faculty',
    departmentId: 'ece',
    recentDenials: 0,
  },
];
