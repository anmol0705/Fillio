'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  Building2,
  GitBranch,
  RefreshCw,
  LogOut,
  Users,
  Inbox,
  CalendarCheck,
  ClipboardList,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Tasks', href: '/dashboard/tasks', icon: CheckSquare },
  { label: 'Open Pool', href: '/dashboard/tasks/pool', icon: Inbox },
  { label: 'Clients', href: '/dashboard/clients', icon: Building2 },
  { label: 'Compliance', href: '/dashboard/compliance', icon: CalendarCheck },
];

const ADMIN_ITEMS: NavItem[] = [
  { label: 'Users',      href: '/dashboard/admin/users',      icon: Users },
  { label: 'Roles',      href: '/dashboard/admin/roles',      icon: ShieldCheck },
  { label: 'Hierarchy',  href: '/dashboard/admin/hierarchy',  icon: GitBranch },
  { label: 'Attendance', href: '/dashboard/admin/attendance', icon: ClipboardList },
  { label: 'Recurring',  href: '/dashboard/admin/recurring',  icon: RefreshCw },
];

interface Props {
  profile: Profile;
  /** When true the sidebar is shown as a mobile overlay drawer */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AppSidebar({ profile, mobileOpen = false, onMobileClose }: Props) {
  const pathname = usePathname();

  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  const sidebarContent = (
    <aside className="flex flex-col w-64 h-full border-r bg-sidebar">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-sidebar-border flex items-center justify-between">
        <div>
          <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
            Filio
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">CA Work Management</p>
        </div>
        {/* Close button — only visible on mobile */}
        {onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onMobileClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors min-h-[44px]',
              isActive(item.href)
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </Link>
        ))}

        {/* Attendance link for non-admin attendance managers */}
        {!profile.is_org_admin && profile.can_mark_attendance && (
          <Link
            href="/dashboard/admin/attendance"
            onClick={onMobileClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors min-h-[44px]',
              isActive('/dashboard/admin/attendance')
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            Attendance
          </Link>
        )}

        {profile.is_org_admin && (
          <>
            <div className="px-3 pt-4 pb-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Admin
              </p>
            </div>
            {ADMIN_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors min-h-[44px]',
                  isActive(item.href)
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-3 px-3 py-2 rounded-md">
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarFallback className="text-xs bg-sidebar-primary text-sidebar-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-sidebar-foreground">
              {profile.full_name}
            </p>
            <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
          </div>
          <form action="/auth/logout" method="POST">
            <button
              type="submit"
              className="p-2 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-accent-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar — fixed, always visible on lg+ */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 shrink-0 z-30">
        {sidebarContent}
      </div>

      {/* Mobile sidebar — overlay drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="relative flex flex-col w-64 max-w-[80vw] h-full shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
