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

const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  companyName: z.string().min(1),
  companyEmail: z.string().email(),
  companyPhone: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export default function ManagerRegister() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: Form) {
    setLoading(true);
    try {
      const res = await apiPost<{ accessToken: string; refreshToken: string }>('/auth/register/manager', data);
      setTokens(res.accessToken, res.refreshToken);
      toast.success('Account created!');
      navigate('/manager/dashboard');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4">
            <Building2 className="text-white" size={28} />
          </div>
          <h1 className="text-3xl font-bold text-white">PropFlow</h1>
          <p className="text-slate-400 mt-2">Create your management company account</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
              <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
            </div>
            <Input label="Your email" type="email" error={errors.email?.message} {...register('email')} />
            <Input label="Password" type="password" error={errors.password?.message} {...register('password')} />

            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-3">Company details</p>
              <div className="space-y-3">
                <Input label="Company name" error={errors.companyName?.message} {...register('companyName')} />
                <Input label="Company email" type="email" error={errors.companyEmail?.message} {...register('companyEmail')} />
                <Input label="Company phone" type="tel" error={errors.companyPhone?.message} {...register('companyPhone')} />
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Create account
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/manager/login" className="text-indigo-600 hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
