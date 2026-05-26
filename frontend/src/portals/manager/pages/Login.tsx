import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Building2 } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function ManagerLogin() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginForm) {
    setLoading(true);
    try {
      const res = await apiPost<{ accessToken: string; refreshToken: string }>('/auth/login', data);
      setTokens(res.accessToken, res.refreshToken);
      navigate('/manager/dashboard');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      toast.error(msg.includes('401') ? 'Invalid email or password' : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4">
            <Building2 className="text-white" size={28} />
          </div>
          <h1 className="text-3xl font-bold text-white">PropFlow</h1>
          <p className="text-slate-400 mt-2">Manager Portal</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign in</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Sign in
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center space-y-2">
            <p className="text-sm text-gray-500">
              New company?{' '}
              <Link to="/manager/register" className="text-indigo-600 hover:underline font-medium">
                Create account
              </Link>
            </p>
            <div className="text-xs text-gray-400 space-y-1">
              <p><Link to="/tenant/login" className="hover:text-gray-600">Tenant portal →</Link></p>
              <p><Link to="/owner/login" className="hover:text-gray-600">Owner portal →</Link></p>
              <p><Link to="/vendor/login" className="hover:text-gray-600">Vendor portal →</Link></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
