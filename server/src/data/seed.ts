/**
 * Demo dataset. Dates are generated relative to "today" so the demo is always current.
 */
import type {
  AccessRequest,
  Booking,
  Department,
  Equipment,
  Lab,
  User,
} from '../../../shared/types.js';
import { addDays } from '../lib/time.js';
import { departments, equipmentSeed, labs, users } from './catalog.js';

export interface Dataset {
  departments: Department[];
  labs: Lab[];
  equipment: Equipment[];
  users: User[];
  bookings: Booking[];
  requests: AccessRequest[];
}

type DayOffset = (offset: number) => string;

/** Demo bookings relative to today: a contested printer, busy GPUs and tracking states. */
function demoBookings(d: DayOffset): Booking[] {
  return [
    // Kabir already holds a lot of lab time this week -> lower fairness priority.
    {
      id: 'bk-1',
      equipmentId: 'printer-mech-1',
      userId: 'stu-kabir',
      date: d(0),
      startHour: 9,
      endHour: 13,
    },
    {
      id: 'bk-2',
      equipmentId: 'printer-des-1',
      userId: 'stu-rohan',
      date: d(0),
      startHour: 9,
      endHour: 13,
    },
    {
      id: 'bk-3',
      equipmentId: 'printer-mech-1',
      userId: 'stu-meera',
      date: d(1),
      startHour: 9,
      endHour: 12,
    },
    {
      id: 'bk-4',
      equipmentId: 'scope-1',
      userId: 'stu-rohan',
      date: d(1),
      startHour: 10,
      endHour: 12,
    },
    {
      id: 'bk-5',
      equipmentId: 'scope-1',
      userId: 'stu-aarav',
      date: d(1),
      startHour: 14,
      endHour: 16,
    },
    {
      id: 'bk-6',
      equipmentId: 'gpu-ws-1',
      userId: 'stu-rohan',
      date: d(1),
      startHour: 13,
      endHour: 17,
    },
    {
      id: 'bk-7',
      equipmentId: 'gpu-ws-1',
      userId: 'stu-kabir',
      date: d(2),
      startHour: 9,
      endHour: 17,
    },
    {
      id: 'bk-8',
      equipmentId: 'fpga-1',
      userId: 'stu-meera',
      date: d(2),
      startHour: 13,
      endHour: 16,
    },
    {
      id: 'bk-9',
      equipmentId: 'printer-mech-1',
      userId: 'stu-rohan',
      date: d(3),
      startHour: 9,
      endHour: 17,
    },
    {
      id: 'bk-10',
      equipmentId: 'printer-des-1',
      userId: 'stu-kabir',
      date: d(1),
      startHour: 9,
      endHour: 13,
    },
    {
      id: 'bk-11',
      equipmentId: 'printer-des-1',
      userId: 'stu-meera',
      date: d(1),
      startHour: 13,
      endHour: 17,
    },
    {
      id: 'bk-12',
      equipmentId: 'printer-mech-1',
      userId: 'stu-meera',
      date: d(2),
      startHour: 9,
      endHour: 13,
    },
    {
      id: 'bk-13',
      equipmentId: 'gpu-ws-1',
      userId: 'stu-rohan',
      date: d(4),
      startHour: 9,
      endHour: 13,
    },
  ];
}

/** Tracking demo: one unit still out and overdue, one returned late with an unpaid fine, one out today. */
function trackingBookings(d: DayOffset): Booking[] {
  return [
    {
      id: 'bk-14',
      equipmentId: 'solder-1',
      userId: 'stu-rohan',
      date: d(-1),
      startHour: 14,
      endHour: 16,
      status: 'checked_out',
      checkedOutAt: `${d(-1)}T08:30:00Z`,
    },
    {
      id: 'bk-15',
      equipmentId: 'spectro-1',
      userId: 'stu-aarav',
      date: d(-1),
      startHour: 9,
      endHour: 11,
      status: 'returned',
      checkedOutAt: `${d(-1)}T03:30:00Z`,
      returnedAt: `${d(-1)}T08:30:00Z`,
      fine: { amount: 150, overdueHours: 3, paid: false },
    },
    {
      id: 'bk-16',
      equipmentId: 'fpga-2',
      userId: 'stu-diya',
      date: d(0),
      startHour: 9,
      endHour: 17,
      status: 'checked_out',
      checkedOutAt: `${d(0)}T03:30:00Z`,
    },
  ];
}

/** Pending project requests that compete for the same printers (conflict demo). */
function demoRequests(d: DayOffset): AccessRequest[] {
  return [
    {
      id: 'req-1',
      studentId: 'stu-aarav',
      projectTitle: 'Drone frame prototype',
      description: 'Print and test-fit a lightweight quadcopter frame for the design review.',
      deadline: d(1),
      hoursNeeded: 6,
      equipmentId: 'printer-mech-1',
      status: 'pending',
      submittedAt: `${d(-2)}T10:00:00Z`,
    },
    {
      id: 'req-2',
      studentId: 'stu-diya',
      projectTitle: 'Assistive grip handle',
      description:
        'Iterate three versions of an ergonomic grip for an accessibility product study.',
      deadline: d(3),
      hoursNeeded: 10,
      equipmentId: 'printer-mech-1',
      status: 'pending',
      submittedAt: `${d(-1)}T09:30:00Z`,
    },
    {
      id: 'req-3',
      studentId: 'stu-kabir',
      projectTitle: 'Sensor enclosure batch',
      description: 'Print weatherproof enclosures for 10 IoT air-quality nodes.',
      deadline: d(3),
      hoursNeeded: 14,
      equipmentId: 'printer-mech-1',
      status: 'pending',
      submittedAt: `${d(-3)}T15:00:00Z`,
    },
    {
      id: 'req-4',
      studentId: 'stu-meera',
      projectTitle: 'CNN accelerator on FPGA',
      description: 'Synthesize and benchmark a small convolution accelerator in Verilog.',
      deadline: d(4),
      hoursNeeded: 12,
      equipmentId: 'fpga-1',
      status: 'pending',
      submittedAt: `${d(-1)}T11:15:00Z`,
    },
  ];
}

/** Builds the demo dataset with dates relative to `today`, so the demo is always current. */
export function createSeed(today: string): Dataset {
  const d: DayOffset = (offset) => addDays(today, offset);
  const equipment: Equipment[] = equipmentSeed.map((e) => ({
    ...e,
    status: e.status ?? 'available',
  }));
  return {
    departments,
    labs,
    equipment,
    users,
    bookings: [...demoBookings(d), ...trackingBookings(d)],
    requests: demoRequests(d),
  };
}
