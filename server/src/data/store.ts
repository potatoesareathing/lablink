import { randomUUID } from 'node:crypto';
import type {
  AccessRequest,
  Booking,
  Department,
  Equipment,
  EquipmentView,
  Lab,
  User,
} from '../../../shared/types.js';
import type { Dataset } from './seed.js';

/**
 * In-memory data store with id-indexed maps for O(1) lookups.
 * Swap for Firestore/Postgres by implementing the same methods.
 */
export class Store {
  readonly departments = new Map<string, Department>();
  readonly labs = new Map<string, Lab>();
  readonly equipment = new Map<string, Equipment>();
  readonly users = new Map<string, User>();
  readonly requests = new Map<string, AccessRequest>();
  private readonly bookingsByEquipment = new Map<string, Booking[]>();

  constructor(data: Dataset) {
    data.departments.forEach((d) => this.departments.set(d.id, d));
    data.labs.forEach((l) => this.labs.set(l.id, l));
    data.equipment.forEach((e) => this.equipment.set(e.id, e));
    data.users.forEach((u) => this.users.set(u.id, { ...u }));
    data.requests.forEach((r) => this.requests.set(r.id, { ...r }));
    data.bookings.forEach((b) => this.addBooking(b));
  }

  static newId(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

  allBookings(): Booking[] {
    return [...this.bookingsByEquipment.values()].flat();
  }

  bookingsFor(equipmentId: string): Booking[] {
    return this.bookingsByEquipment.get(equipmentId) ?? [];
  }

  addBooking(booking: Booking): Booking {
    const list = this.bookingsByEquipment.get(booking.equipmentId) ?? [];
    list.push(booking);
    this.bookingsByEquipment.set(booking.equipmentId, list);
    return booking;
  }

  equipmentView(e: Equipment): EquipmentView {
    const lab = this.labs.get(e.labId);
    const dept = lab ? this.departments.get(lab.departmentId) : undefined;
    return {
      ...e,
      departmentId: lab?.departmentId ?? '',
      labName: lab?.name ?? 'Unknown lab',
      departmentName: dept?.name ?? 'Unknown department',
      location: lab?.location ?? '',
    };
  }

  catalog(): EquipmentView[] {
    return [...this.equipment.values()].map((e) => this.equipmentView(e));
  }
}
