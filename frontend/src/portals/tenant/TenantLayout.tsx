import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, CreditCard, Wrench, FileText, MessageSquare, LogOut, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { apiGet } from '@/lib/api';

const nav = [
  { to: '/tenant/dashboard', icon: Home, label: 'Home' },
  { to: '/tenant/payments', icon: CreditCard, label: 'Payments' },
  { to: '/tenant/maintenance', icon: Wrench, label: 'Maintenance' },
  { to: '/tenant/documents', icon: FileText, label: 'Docs' },
  { to: '/tenant/messages', icon: MessageSquare, label: 'Messages', unreadKey: true },
  { to: '/tenant/settings', icon: Settings, label: 'Settings' },
];

export default function TenantLayout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['tenant-messages-unread'],
    queryFn: () => apiGet('/api/v1/messages/unread-count'),
    refetchInterval: 30_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-teal-600 text-white px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">PropFlow</span>
        <button onClick={() => { logout(); navigate('/tenant/login'); }}>
          <LogOut size={18} />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 p-4">
        <Outlet />
      </main>

      {/* Bottom nav (mobile-first) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex">
        {nav.map(({ to, icon: Icon, label, unreadKey }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center py-3 text-xs gap-1 transition-colors',
                isActive ? 'text-teal-600' : 'text-gray-400 hover:text-gray-600'
              )
            }
          >
            <span className="relative">
              <Icon size={20} />
              {unreadKey && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-teal-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
