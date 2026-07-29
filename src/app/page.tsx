import { redirect } from 'next/navigation';

// Root path is protected — middleware redirects unauthenticated users to /login.
// Authenticated users landing on / are sent to /dashboard.
export default function RootPage() {
  redirect('/dashboard');
}
