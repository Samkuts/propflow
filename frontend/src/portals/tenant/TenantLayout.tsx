import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, CreditCard, Wrench, FileText, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

const nav = [
  { to: '/tenant/dashboard', icon: Home, label: 'Home' },
  { to: '/tenant/payments', icon: CreditCard, label: 'Payments' },
  { to: '/tenant/maintenance', icon: Wrench, label: 'Maintenance' },
  { to: '/tenant/documents', icon: FileText, label: 'Documents' },
];

export default function TenantLayout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

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
        {nav.map(({ to, icon: Icon, label }) => (
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
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
