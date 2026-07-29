'use client';

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/types';

interface Props {
  initialNotifications: Notification[];
  /** Used to scope the Realtime channel to the authenticated user. */
  userId: string;
}

export function NotificationBell({ initialNotifications, userId }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Subscribe to Supabase Realtime directly in the browser.
  // This avoids the Vercel serverless function duration limit that made SSE unreliable.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications((prev) =>
            // Prepend and cap at 50 to prevent unbounded memory growth
            [newNotification, ...prev].slice(0, 50),
          );
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(JSON.stringify({ level: 'error', component: 'NotificationBell', status, err: err?.message }));
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // Re-subscribe only when the authenticated userId changes (e.g. impersonation)
  }, [userId]);

  async function markAllRead() {
    // Optimistic update — flip local state immediately so the UI responds at once
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

    try {
      await fetch('/api/notifications/mark-read', { method: 'POST' });
    } catch (err) {
      console.error('[NotificationBell] markAllRead failed:', err);
      // Don't revert — the optimistic update is good UX and will reconcile on next load
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="relative min-h-[44px] min-w-[44px]" aria-label="Notifications" />
        }
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(320px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto divide-y">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No notifications
            </p>
          ) : (
            notifications.slice(0, 10).map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 ${!n.is_read ? 'bg-accent/30' : ''}`}
              >
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {n.body}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(n.created_at), 'dd MMM, h:mm a')}
                </p>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
