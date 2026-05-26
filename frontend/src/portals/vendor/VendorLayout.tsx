import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Wrench } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

export default function VendorLayout() {
  const { logout, user } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-amber-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <Wrench className="text-white" size={15} />
          </div>
          <span className="font-bold text-gray-900">PropFlow · Vendor</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={() => { logout(); navigate('/vendor/login'); }}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
