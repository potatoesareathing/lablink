const dateFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Mon, 23 Nov" for a YYYY-MM-DD campus date. */
export const formatDate = (date: string): string => dateFmt.format(new Date(`${date}T00:00:00Z`));

export const formatHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

export const formatRange = (date: string, start: number, end: number): string =>
  `${formatDate(date)}, ${formatHour(start)}–${formatHour(end)}`;

export const percent = (ratio: number): string => `${Math.round(ratio * 100)}%`;

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  partial: 'Partially approved',
  waitlisted: 'Waitlisted',
  rejected: 'Rejected',
  allocated: 'Fully allocated',
  available: 'Available',
  maintenance: 'Under maintenance',
};

export const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info'> = {
  pending: 'info',
  approved: 'ok',
  allocated: 'ok',
  available: 'ok',
  partial: 'warn',
  waitlisted: 'warn',
  maintenance: 'bad',
  rejected: 'bad',
};
