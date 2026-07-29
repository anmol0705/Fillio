'use client';

import { useMemo } from 'react';
import {
  Calendar,
  dateFnsLocalizer,
  type Event as CalendarEventBase,
} from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enIN } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useRouter } from 'next/navigation';
import type { UpcomingDeadline } from '@/actions/dashboard';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales: { 'en-IN': enIN },
});

interface CalendarEvent extends CalendarEventBase {
  id: string;
  resource: { taskId: string };
}

interface Props {
  deadlines: UpcomingDeadline[];
}

export function DeadlineCalendar({ deadlines }: Props) {
  const router = useRouter();

  const events: CalendarEvent[] = useMemo(
    () =>
      deadlines.map((d) => ({
        id: d.id,
        title: `${d.title}${d.client ? ` — ${d.client.name}` : ''}`,
        start: new Date(d.due_at),
        end: new Date(d.due_at),
        allDay: true,
        resource: { taskId: d.id },
      })),
    [deadlines],
  );

  function handleSelectEvent(event: CalendarEvent) {
    router.push(`/dashboard/tasks/${event.resource.taskId}`);
  }

  if (deadlines.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No upcoming deadlines to display
      </div>
    );
  }

  return (
    <div className="h-96">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        onSelectEvent={handleSelectEvent}
        views={['month', 'agenda']}
        defaultView="month"
        culture="en-IN"
        style={{ height: '100%', fontSize: 13 }}
        eventPropGetter={() => ({
          style: {
            backgroundColor: '#6366f1',
            borderRadius: '4px',
            border: 'none',
            fontSize: '11px',
            padding: '1px 4px',
            cursor: 'pointer',
          },
        })}
      />
    </div>
  );
}
