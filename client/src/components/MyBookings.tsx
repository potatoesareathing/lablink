import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatRange } from '../format';
import { Loading, Notice, PageHeader, errorMessage } from './ui';

type Bookings = Awaited<ReturnType<typeof api.myBookings>>['bookings'];

export function MyBookings() {
  const [bookings, setBookings] = useState<Bookings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .myBookings()
      .then((r) => setBookings(r.bookings))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <>
      <PageHeader
        title="My bookings"
        intro="Upcoming lab time, including slots allocated from approved project requests."
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {!bookings ? (
        <Loading />
      ) : bookings.length === 0 ? (
        <p>No upcoming bookings. Find equipment on the Discover page.</p>
      ) : (
        <div className="table-scroll card">
          <table className="data">
            <caption className="sr-only">Upcoming bookings</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Equipment</th>
                <th scope="col">Lab</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{formatRange(b.date, b.startHour, b.endHour)}</td>
                  <td>{b.equipment?.name}</td>
                  <td>
                    {b.equipment?.labName}
                    <span className="muted small"> · {b.equipment?.location}</span>
                  </td>
                  <td>{b.requestId ? 'Project allocation' : 'Direct booking'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
