import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Home, Wrench, TrendingUp, LucideIcon } from 'lucide-react';
import { apiPost, getErrorMessage } from '@/lib/api';
import { useAuthStore, UserRole } from '@/store/auth.store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface SharedLoginProps {
  portal: 'tenant' | 'owner' | 'vendor';
  label: string;
  dashboardPath: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

const schema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});
type Form = z.infer<typeof schema>;

export function SharedLogin({ portal, label, dashboardPath, icon: Icon, color, bgColor }: SharedLoginProps) {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: Form) {
    setLoading(true);
    try {
      const res = await apiPost<{ accessToken: string; refreshToken: string }>('/auth/login', data);
      setTokens(res.accessToken, res.refreshToken);
      navigate(dashboardPath);
    } catch (e) {
      toast.error('Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`min-h-screen ${bgColor} flex items-center justify-center p-4`}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className={`inline-flex items-center justify-center w-14 h-14 ${color} rounded-2xl mb-3`}>
            <Icon className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">PropFlow</h1>
          <p className="text-gray-500 text-sm">{label}</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-lg">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
            <Input label="Password" type="password" error={errors.password?.message} {...register('password')} />
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2 ${color} text-white font-medium py-2.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 text-sm`}
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              Sign in
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-gray-400">
            <Link to="/manager/login" className="hover:text-gray-600">Manager portal →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function TenantLogin() {
  return <SharedLogin portal="tenant" label="Tenant Portal" dashboardPath="/tenant/dashboard"
    icon={Home} color="bg-teal-600" bgColor="bg-teal-50" />;
}

export function OwnerLogin() {
  return <SharedLogin portal="owner" label="Owner Portal" dashboardPath="/owner/dashboard"
    icon={TrendingUp} color="bg-green-600" bgColor="bg-green-50" />;
}

export function VendorLogin() {
  return <SharedLogin portal="vendor" label="Vendor Portal" dashboardPath="/vendor/work-orders"
    icon={Wrench} color="bg-amber-500" bgColor="bg-amber-50" />;
}
