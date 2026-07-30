'use client';

import { useState, useEffect, useTransition } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { markAsRead, markAllAsRead } from '@/actions/notifications';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/types';

interface Props {
  initialNotifications: Notification[];
  userId: string;
}

const TYPE_ICONS: Record<string, string> = {
  task_assigned:     '📋',
  task_reassigned:   '🔄',
  task_under_review: '👀',
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60)   return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function NotificationBell({ initialNotifications, userId }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [open, setOpen]                   = useState(false);
  const [isPending, startTransition]      = useTransition();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Supabase Realtime — same pattern as TaskChat, real-time bell badge
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel  = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = payload.new as Notification;
          setNotifications((prev) => [incoming, ...prev].slice(0, 30));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Mark a single notification read on click
  function handleClick(n: Notification) {
    if (n.is_read) return;
    setNotifications((prev) =>
      prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x),
    );
    startTransition(async () => {
      await markAsRead(n.id);
    });
  }

  // Mark all read
  function handleMarkAll() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    startTransition(async () => {
      await markAllAsRead();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={isPending}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[360px] overflow-y-auto divide-y">
          {notifications.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="w-6 h-6 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 transition-colors hover:bg-accent/50 ${
                  !n.is_read ? 'bg-accent/20' : ''
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-base shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${!n.is_read ? 'font-medium' : ''}`}>
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {n.body}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {timeAgo(new Date(n.created_at))}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
