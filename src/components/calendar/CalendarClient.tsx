'use client';

import { useState, useTransition, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
} from '@/actions/calendar';
import type { CalendarEventWithNames } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  initialEvents: CalendarEventWithNames[];
  currentUserId: string;
  isAdmin:       boolean;
  members:       { id: string; full_name: string }[];
  tasks:         { id: string; title: string }[];
}

type FormValues = {
  title:       string;
  description: string;
  event_type:  'meeting' | 'deadline' | 'other';
  start_at:    string;
  end_at:      string;
  is_all_day:  boolean;
  assigned_to: string;
  task_id:     string;
};

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const EVENT_COLOURS: Record<string, string> = {
  meeting:  'bg-blue-100 text-blue-800 border-blue-200',
  deadline: 'bg-red-100 text-red-800 border-red-200',
  other:    'bg-slate-100 text-slate-700 border-slate-200',
};

const EVENT_DOT: Record<string, string> = {
  meeting:  'bg-blue-500',
  deadline: 'bg-red-500',
  other:    'bg-slate-400',
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function toLocalDatetimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalendarClient({ initialEvents, currentUserId, isAdmin, members, tasks }: Props) {
  const now = new Date();

  const [events, setEvents]               = useState<CalendarEventWithNames[]>(initialEvents);
  const [viewYear, setViewYear]           = useState(now.getFullYear());
  const [viewMonth, setViewMonth]         = useState(now.getMonth()); // 0-indexed
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventWithNames | null>(null);
  const [formOpen, setFormOpen]           = useState(false);
  const [detailOpen, setDetailOpen]       = useState(false);
  const [editing, setEditing]             = useState<CalendarEventWithNames | null>(null);
  const [prefillDate, setPrefillDate]     = useState<Date | null>(null);
  const [formError, setFormError]         = useState('');
  const [isPending, startTransition]      = useTransition();

  const [form, setForm] = useState<FormValues>({
    title: '', description: '', event_type: 'meeting',
    start_at: '', end_at: '', is_all_day: false,
    assigned_to: '', task_id: '',
  });

  // ── Calendar grid ──────────────────────────────────────────────────────────

  const firstDay  = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Map date string → events for that day
  const eventsByDate = new Map<string, CalendarEventWithNames[]>();
  for (const ev of events) {
    const d = new Date(ev.start_at);
    if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
      const key = d.getDate().toString();
      if (!eventsByDate.has(key)) eventsByDate.set(key, []);
      eventsByDate.get(key)!.push(ev);
    }
  }

  // ── Month navigation ────────────────────────────────────────────────────

  function navigate(delta: number) {
    const newMonth = viewMonth + delta;
    let y = viewYear;
    let m = newMonth;
    if (m < 0)  { y -= 1; m = 11; }
    if (m > 11) { y += 1; m = 0;  }
    setViewYear(y);
    setViewMonth(m);

    startTransition(async () => {
      const res = await getCalendarEvents(y, m + 1);
      if (res.error === null) setEvents(res.data);
    });
  }

  // ── Open create form ────────────────────────────────────────────────────

  function openCreate(date?: Date) {
    const base = date ?? new Date();
    base.setSeconds(0, 0);
    const endBase = new Date(base.getTime() + 60 * 60 * 1000); // +1 hour
    setEditing(null);
    setForm({
      title: '', description: '', event_type: 'meeting',
      start_at: toLocalDatetimeInput(base),
      end_at:   toLocalDatetimeInput(endBase),
      is_all_day: false, assigned_to: '', task_id: '',
    });
    setFormError('');
    setPrefillDate(date ?? null);
    setDetailOpen(false);
    setFormOpen(true);
  }

  // ── Open edit form ──────────────────────────────────────────────────────

  function openEdit(ev: CalendarEventWithNames) {
    setEditing(ev);
    setForm({
      title:       ev.title,
      description: ev.description ?? '',
      event_type:  ev.event_type,
      start_at:    toLocalDatetimeInput(new Date(ev.start_at)),
      end_at:      toLocalDatetimeInput(new Date(ev.end_at)),
      is_all_day:  ev.is_all_day,
      assigned_to: ev.assignee?.id ?? '',
      task_id:     ev.task?.id ?? '',
    });
    setFormError('');
    setDetailOpen(false);
    setFormOpen(true);
  }

  // ── Submit form ─────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (!form.start_at)     { setFormError('Start time is required.'); return; }
    if (!form.end_at)       { setFormError('End time is required.'); return; }

    const payload = {
      title:       form.title.trim(),
      description: form.description.trim() || undefined,
      event_type:  form.event_type,
      start_at:    new Date(form.start_at).toISOString(),
      end_at:      new Date(form.end_at).toISOString(),
      is_all_day:  form.is_all_day,
      assigned_to: form.assigned_to || null,
      task_id:     form.task_id || null,
    };

    startTransition(async () => {
      if (editing) {
        const res = await updateCalendarEvent(editing.id, payload);
        if (res.error !== null) { setFormError(res.error); return; }
        setEvents((prev) => prev.map((ev) => ev.id === editing.id ? res.data : ev));
      } else {
        const res = await createCalendarEvent(payload);
        if (res.error !== null) { setFormError(res.error); return; }
        setEvents((prev) => [...prev, res.data]);
      }
      setFormOpen(false);
    });
  }

  // ── Delete event ────────────────────────────────────────────────────────

  function handleDelete(ev: CalendarEventWithNames) {
    if (!confirm(`Delete "${ev.title}"?`)) return;
    setDetailOpen(false);
    setEvents((prev) => prev.filter((e) => e.id !== ev.id));
    startTransition(async () => {
      const res = await deleteCalendarEvent(ev.id);
      if (res.error) {
        setEvents((prev) => [...prev, ev]);
      }
    });
  }

  // ── Field helper ────────────────────────────────────────────────────────

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Click on day cell ────────────────────────────────────────────────────

  function handleDayClick(day: number) {
    const date = new Date(viewYear, viewMonth, day, 9, 0);
    openCreate(date);
  }

  // ── Click on event chip ──────────────────────────────────────────────────

  function handleEventClick(ev: CalendarEventWithNames, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedEvent(ev);
    setDetailOpen(true);
  }

  const canEditEvent = useCallback((ev: CalendarEventWithNames) => {
    return isAdmin || ev.created_by === currentUserId;
  }, [isAdmin, currentUserId]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>‹</Button>
          <span className="text-sm font-semibold min-w-[140px] text-center">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigate(1)}>›</Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); }}
          >
            Today
          </Button>
        </div>
        <Button size="sm" onClick={() => openCreate()}>
          + New event
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {/* Empty cells before 1st */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[100px] border-r border-b bg-muted/20" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day       = i + 1;
            const isToday   = day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
            const dayEvents = eventsByDate.get(day.toString()) ?? [];

            return (
              <div
                key={day}
                className="min-h-[100px] border-r border-b p-1.5 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => handleDayClick(day)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {day}
                  </span>
                </div>

                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      onClick={(e) => handleEventClick(ev, e)}
                      className={`text-xs px-1.5 py-0.5 rounded truncate border cursor-pointer hover:opacity-80 ${EVENT_COLOURS[ev.event_type]}`}
                    >
                      {ev.is_all_day ? '' : `${formatTime(new Date(ev.start_at))} `}
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-xs text-muted-foreground pl-1">
                      +{dayEvents.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-sm">
          {selectedEvent && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${EVENT_DOT[selectedEvent.event_type]}`} />
                  <DialogTitle className="leading-snug">{selectedEvent.title}</DialogTitle>
                </div>
              </DialogHeader>

              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">When</span>
                  <span>
                    {new Date(selectedEvent.start_at).toLocaleDateString('en-IN', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    })}
                    {!selectedEvent.is_all_day && (
                      <> · {formatTime(new Date(selectedEvent.start_at))} – {formatTime(new Date(selectedEvent.end_at))}</>
                    )}
                    {selectedEvent.is_all_day && <> · All day</>}
                  </span>
                </div>

                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Type</span>
                  <Badge variant="outline" className="text-xs capitalize">{selectedEvent.event_type}</Badge>
                </div>

                {selectedEvent.assignee && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-20 shrink-0">Assigned to</span>
                    <span>{selectedEvent.assignee.full_name}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Created by</span>
                  <span>{selectedEvent.creator.full_name}</span>
                </div>

                {selectedEvent.task && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-20 shrink-0">Task</span>
                    <span className="truncate">{selectedEvent.task.title}</span>
                  </div>
                )}

                {selectedEvent.description && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-20 shrink-0">Notes</span>
                    <span className="whitespace-pre-wrap">{selectedEvent.description}</span>
                  </div>
                )}
              </div>

              {canEditEvent(selectedEvent) && (
                <DialogFooter className="gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(selectedEvent)}
                  >
                    Delete
                  </Button>
                  <Button size="sm" onClick={() => openEdit(selectedEvent)}>
                    Edit
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit event' : 'New event'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="ev-title">Title</Label>
              <Input
                id="ev-title"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="e.g. Client meeting — ABC Pvt Ltd"
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>Event type</Label>
              <Select
                value={form.event_type}
                onValueChange={(v) => setField('event_type', (v ?? 'other') as FormValues['event_type'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="deadline">Deadline</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* All day toggle */}
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_all_day}
                onCheckedChange={(v) => setField('is_all_day', v)}
                id="ev-allday"
              />
              <Label htmlFor="ev-allday" className="cursor-pointer">All day</Label>
            </div>

            {/* Start + End */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ev-start">Start</Label>
                <Input
                  id="ev-start"
                  type={form.is_all_day ? 'date' : 'datetime-local'}
                  value={form.is_all_day ? form.start_at.slice(0, 10) : form.start_at}
                  onChange={(e) => setField('start_at', form.is_all_day ? `${e.target.value}T00:00` : e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-end">End</Label>
                <Input
                  id="ev-end"
                  type={form.is_all_day ? 'date' : 'datetime-local'}
                  value={form.is_all_day ? form.end_at.slice(0, 10) : form.end_at}
                  onChange={(e) => setField('end_at', form.is_all_day ? `${e.target.value}T23:59` : e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Assign to (admins + managers only) */}
            {(isAdmin || members.length > 1) && (
              <div className="space-y-1.5">
                <Label>Assign to</Label>
                <Select
                  value={form.assigned_to || '_self'}
                  onValueChange={(v) => setField('assigned_to', (v == null || v === '_self') ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_self">Myself (personal event)</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Task link */}
            <div className="space-y-1.5">
              <Label>Link to task (optional)</Label>
              <Select
                value={form.task_id || '_none'}
                onValueChange={(v) => setField('task_id', (v == null || v === '_none') ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No task" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No task</SelectItem>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="ev-desc">Notes (optional)</Label>
              <Textarea
                id="ev-desc"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Any additional notes…"
                rows={3}
              />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : editing ? 'Save changes' : 'Create event'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
