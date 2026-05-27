import { useNavigate } from 'react-router-dom';
import { Building2, Home, UserCheck, Wrench, LucideIcon } from 'lucide-react';

interface RoleCard {
  role: string;
  label: string;
  description: string;
  icon: LucideIcon;
  iconBg: string;
  loginPath: string;
  registerPath?: string;
}

const roles: RoleCard[] = [
  {
    role: 'Manager',
    label: 'Property Manager',
    description: 'Manage properties, tenants, leases, and accounting.',
    icon: Building2,
    iconBg: 'bg-indigo-600',
    loginPath: '/manager/login',
    registerPath: '/manager/register',
  },
  {
    role: 'Owner',
    label: 'Property Owner',
    description: 'View your properties, financials, and owner statements.',
    icon: UserCheck,
    iconBg: 'bg-green-600',
    loginPath: '/owner/login',
  },
  {
    role: 'Tenant',
    label: 'Tenant',
    description: 'Pay rent, submit maintenance requests, and view your lease.',
    icon: Home,
    iconBg: 'bg-teal-600',
    loginPath: '/tenant/login',
  },
  {
    role: 'Vendor',
    label: 'Vendor / Contractor',
    description: 'View and manage your assigned work orders.',
    icon: Wrench,
    iconBg: 'bg-amber-500',
    loginPath: '/vendor/login',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-5 shadow-lg shadow-indigo-900/50">
          <Building2 className="text-white" size={30} />
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">PropFlow</h1>
        <p className="text-slate-400 mt-2 text-lg">Property management, simplified.</p>
      </div>

      {/* Listings CTA */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/listings')}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-medium rounded-xl text-sm transition-colors"
        >
          <Home size={15} /> View Available Rentals
        </button>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        {roles.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.role}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`${card.iconBg} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon className="text-white" size={20} />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-base leading-tight">{card.label}</h2>
                  <p className="text-slate-400 text-xs mt-0.5">{card.description}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => navigate(card.loginPath)}
                  className={`w-full ${card.iconBg} text-white text-sm font-medium py-2 rounded-lg hover:opacity-90 transition-opacity`}
                >
                  Sign In
                </button>

                {card.registerPath ? (
                  <button
                    onClick={() => navigate(card.registerPath!)}
                    className="w-full bg-slate-800 text-slate-300 text-sm font-medium py-2 rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    Create Account
                  </button>
                ) : (
                  <p className="text-center text-xs text-slate-600">
                    Your manager will set up your account.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
