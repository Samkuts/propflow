import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart2, Building2, FileText, LogOut, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

const nav = [
  { to: '/owner/dashboard', icon: BarChart2, label: 'Overview' },
  { to: '/owner/properties', icon: Building2, label: 'Properties' },
  { to: '/owner/statements', icon: FileText, label: 'Statements' },
  { to: '/owner/settings', icon: Settings, label: 'Settings' },
];

export default function OwnerLayout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-gray-900 text-lg">PropFlow</span>
          <nav className="flex gap-1">
            {nav.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-500 hover:bg-gray-50'
                  )
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <button
          onClick={() => { logout(); navigate('/owner/login'); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <LogOut size={15} /> Sign out
        </button>
      </header>
      <main className="max-w-6xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
