import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import {
  Building2, Home, FileText, DollarSign, Wrench,
  BarChart2, LogOut, Bell, Users, MessageSquare, ClipboardList, Settings
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { initials } from '@/lib/utils';
import { apiGet } from '@/lib/api';

const nav = [
  { to: '/manager/dashboard', icon: Home, label: 'Dashboard' },
  { to: '/manager/properties', icon: Building2, label: 'Properties' },
  { to: '/manager/leases', icon: FileText, label: 'Leases' },
  { to: '/manager/accounting', icon: DollarSign, label: 'Accounting' },
  { to: '/manager/maintenance', icon: Wrench, label: 'Maintenance' },
  { to: '/manager/tenants', icon: Users, label: 'Tenants' },
  { to: '/manager/applications', icon: ClipboardList, label: 'Applications' },
  { to: '/manager/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/manager/reports', icon: BarChart2, label: 'Reports' },
  { to: '/manager/settings', icon: Settings, label: 'Settings' },
];

export default function ManagerLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['messages-unread'],
    queryFn: () => apiGet('/api/v1/messages/unread-count'),
    refetchInterval: 30_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  function handleLogout() {
    logout();
    navigate('/manager/login');
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 flex flex-col shrink-0">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Building2 className="text-white" size={16} />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">PropFlow</p>
            <p className="text-slate-400 text-xs">Manager</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )
              }
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {label === 'Messages' && unreadCount > 0 && (
                <span className="w-4 h-4 bg-indigo-400 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
              {user ? initials(user.email[0], user.email[1]) : '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.email}</p>
              <p className="text-slate-400 text-xs">Manager</p>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-end gap-3 shrink-0">
          <Link to="/manager/messages" className="text-gray-400 hover:text-gray-600 relative">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
