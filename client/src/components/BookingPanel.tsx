import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_BOOKING_HOURS } from '../../../shared/constants';
import { ApiError, api } from '../api';
import type { Alternatives, TimeWindow } from '../api';
import { formatDate, formatHour, formatRange } from '../format';
import { Loading, Notice, errorMessage } from './ui';

type Availability = Awaited<ReturnType<typeof api.availability>>;

/** Availability grid with conflict-aware booking and one-click alternatives. */
export function BookingPanel({
  equipmentId,
  onClose,
}: {
  equipmentId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Availability | null>(null);
  const [pick, setPick] = useState<{ date: string; hour: number } | null>(null);
  const [hours, setHours] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [alternatives, setAlternatives] = useState<Alternatives | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(() => {
    api
      .availability(equipmentId)
      .then(setData)
      .catch((err) => setMessage({ tone: 'bad', text: errorMessage(err) }));
  }, [equipmentId]);

  useEffect(() => {
    setData(null);
    setPick(null);
    setAlternatives(null);
    setMessage(null);
    load();
  }, [load]);

  useEffect(() => {
    if (data) headingRef.current?.focus();
  }, [data]);

  async function book(equipment: string, date: string, startHour: number, length: number) {
    setBusy(true);
    setMessage(null);
    setAlternatives(null);
    try {
      await api.book({ equipmentId: equipment, date, startHour, hours: length });
      setMessage({
        tone: 'ok',
        text: `Booked ${formatRange(date, startHour, startHour + length)}.`,
      });
      setPick(null);
      load();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        (err.body as { alternatives?: Alternatives }).alternatives
      ) {
        setAlternatives((err.body as { alternatives: Alternatives }).alternatives);
        setMessage({ tone: 'bad', text: 'That time is taken. Here are the closest alternatives.' });
      } else {
        setMessage({ tone: 'bad', text: errorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <section className="card">
        <Loading label="Loading availability" />
      </section>
    );
  const { equipment, now } = data;

  return (
    <section className="card booking" aria-labelledby="booking-title">
      <div className="booking-head">
        <div>
          <h2 id="booking-title" ref={headingRef} tabIndex={-1}>
            {equipment.name}
          </h2>
          <p className="muted small">
            {equipment.labName} · {equipment.location} · {equipment.specs}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close <span className="sr-only">booking panel</span>
        </button>
      </div>

      <SlotGrid
        days={data.days}
        now={now}
        pick={pick}
        busy={busy}
        onPick={setPick}
        onBooked={(date, hour) => void book(equipment.id, date, hour, hours)}
      />

      <div className="booking-actions">
        <label>
          Duration
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {Array.from({ length: MAX_BOOKING_HOURS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} hour{n > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!pick || busy}
          onClick={() => pick && void book(equipment.id, pick.date, pick.hour, hours)}
        >
          {pick
            ? `Book ${formatRange(pick.date, pick.hour, pick.hour + hours)}`
            : 'Select a free slot'}
        </button>
      </div>

      <div aria-live="polite">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {alternatives && (
          <AlternativesList
            equipmentId={equipment.id}
            alternatives={alternatives}
            busy={busy}
            onBook={(unitId, w) => void book(unitId, w.date, w.startHour, w.endHour - w.startHour)}
          />
        )}
      </div>
    </section>
  );
}

type Day = Availability['days'][number];
type Pick = { date: string; hour: number } | null;

interface SlotGridProps {
  days: Day[];
  now: Availability['now'];
  pick: Pick;
  busy: boolean;
  onPick: (pick: Pick) => void;
  /** A booked hour was chosen: try it so the server suggests alternatives. */
  onBooked: (date: string, hour: number) => void;
}

/** Hour-by-day timetable. Past hours are inert; free and booked hours are buttons. */
function SlotGrid({ days, now, pick, busy, onPick, onBooked }: SlotGridProps) {
  return (
    <div className="table-scroll">
      <table className="slots">
        <caption className="sr-only">
          Hourly availability for the next 7 days. Choose a free hour to start a booking, or a
          booked hour to see alternatives.
        </caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {days[0]?.hours.map((h) => (
              <th scope="col" key={h.hour}>
                {formatHour(h.hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{formatDate(day.date)}</th>
              {day.hours.map((h) => (
                <td key={h.hour}>
                  <SlotCell
                    date={day.date}
                    hour={h.hour}
                    booked={h.booked}
                    past={day.date === now.date && h.hour <= now.hour}
                    chosen={pick?.date === day.date && pick.hour === h.hour}
                    busy={busy}
                    onPick={onPick}
                    onBooked={onBooked}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SlotCellProps {
  date: string;
  hour: number;
  booked: boolean;
  past: boolean;
  chosen: boolean;
  busy: boolean;
  onPick: (pick: Pick) => void;
  onBooked: (date: string, hour: number) => void;
}

function SlotCell({ date, hour, booked, past, chosen, busy, onPick, onBooked }: SlotCellProps) {
  const label = `${formatDate(date)} ${formatHour(hour)}`;
  if (past) {
    return (
      <span className="slot slot-past">
        —<span className="sr-only"> past</span>
      </span>
    );
  }
  if (booked) {
    return (
      <button
        type="button"
        className="slot slot-booked"
        disabled={busy}
        aria-label={`${label} booked - show alternatives`}
        onClick={() => onBooked(date, hour)}
      >
        Booked
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`slot slot-free${chosen ? ' slot-chosen' : ''}`}
      aria-pressed={chosen}
      aria-label={`${label} free`}
      onClick={() => onPick({ date, hour })}
    >
      Free
    </button>
  );
}

interface AlternativesListProps {
  /** The unit the student originally tried to book. */
  equipmentId: string;
  alternatives: Alternatives;
  busy: boolean;
  onBook: (equipmentId: string, window: TimeWindow) => void;
}

/** Suggestions after a clash: later times on this unit, or the same time elsewhere. */
function AlternativesList({ equipmentId, alternatives, busy, onBook }: AlternativesListProps) {
  const { sameEquipment, equivalents } = alternatives;
  if (sameEquipment.length === 0 && equivalents.length === 0) {
    return (
      <p>
        No alternatives in the next 3 weeks. Submit a project request so faculty can allocate time
        fairly.
      </p>
    );
  }
  return (
    <div className="alternatives">
      {sameEquipment.length > 0 && (
        <>
          <h3 className="h4">Next free times on this unit</h3>
          <ul className="inline-list">
            {sameEquipment.map((w) => (
              <li key={`${w.date}-${w.startHour}`}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => onBook(equipmentId, w)}
                >
                  Book {formatRange(w.date, w.startHour, w.endHour)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {equivalents.length > 0 && (
        <>
          <h3 className="h4">Same time, equivalent unit in another lab</h3>
          <ul className="inline-list">
            {equivalents.map((w) => (
              <li key={w.equipment.id}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => onBook(w.equipment.id, w)}
                >
                  {w.equipment.name} · {w.equipment.labName}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
