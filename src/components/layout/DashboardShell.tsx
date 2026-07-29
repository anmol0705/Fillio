'use client';

import { useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { Header } from './Header';
import type { Profile, Notification } from '@/types';

interface Props {
  profile: Profile;
  initialNotifications: Notification[];
  userId: string;
  children: React.ReactNode;
}

/**
 * Client shell that wires the mobile sidebar toggle.
 * Data is fetched server-side in the layout and passed as props here.
 */
export function DashboardShell({
  profile,
  initialNotifications,
  userId,
  children,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — handles both desktop (fixed) and mobile (overlay) */}
      <AppSidebar
        profile={profile}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {/* Main content — offset by sidebar width on desktop */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header
          initialNotifications={initialNotifications}
          userId={userId}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
