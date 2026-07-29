'use client';

import { Menu } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import type { Notification } from '@/types';

interface Props {
  title?: string;
  initialNotifications?: Notification[];
  userId?: string;
  onMenuClick?: () => void;
}

export function Header({
  title,
  initialNotifications = [],
  userId = '',
  onMenuClick,
}: Props) {
  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4 sm:px-6 shrink-0 sticky top-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — only shown on mobile */}
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        {title && (
          <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <NotificationBell initialNotifications={initialNotifications} userId={userId} />
      </div>
    </header>
  );
}
