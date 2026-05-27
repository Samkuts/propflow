import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, MapPin } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { Card, CardBody, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

interface Property {
  id: string;
  name: string;
  type: 'RESIDENTIAL' | 'COMMERCIAL' | 'HOA';
  address: string;
  city: string;
  state: string;
  zip: string;
  _count: { units: number };
  owner?: { user: { firstName: string; lastName: string } };
}

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'HOA']),
  address: z.string().min(1, 'Address required'),
  city: z.string().min(1, 'City required'),
  state: z.string().min(2, 'State required'),
  zip: z.string().min(5, 'ZIP required'),
  description: z.string().optional(),
});
type Form = z.infer<typeof schema>;

const typeColors: Record<string, 'blue' | 'green' | 'purple'> = {
  RESIDENTIAL: 'blue',
  COMMERCIAL: 'green',
  HOA: 'purple',
};

export default function Properties() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: () => apiGet<{ data: Property[] }>('/properties'),
  });
  const properties = (data as unknown as { data: Property[] })?.data ?? (data as unknown as Property[]) ?? [];

  const { mutate: create, isPending } = useMutation({
    mutationFn: (body: Form) => apiPost('/properties', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      setShowForm(false);
      reset();
      toast.success('Property created');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'RESIDENTIAL' },
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="text-gray-500 text-sm mt-1">{Array.isArray(properties) ? properties.length : 0} properties in portfolio</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Add Property
        </Button>
      </div>

      {/* Add Property form */}
      {showForm && (
        <Card>
          <CardBody>
            <h2 className="font-semibold text-gray-900 mb-4">New Property</h2>
            <form onSubmit={handleSubmit((d) => create(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Property name" error={errors.name?.message} {...register('name')} />
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Type</label>
                  <select className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" {...register('type')}>
                    <option value="RESIDENTIAL">Residential</option>
                    <option value="COMMERCIAL">Commercial</option>
                    <option value="HOA">HOA</option>
                  </select>
                </div>
              </div>
              <Input label="Street address" error={errors.address?.message} {...register('address')} />
              <div className="grid grid-cols-3 gap-4">
                <Input label="City" error={errors.city?.message} {...register('city')} />
                <Input label="State" error={errors.state?.message} {...register('state')} />
                <Input label="ZIP" error={errors.zip?.message} {...register('zip')} />
              </div>
              <div className="flex gap-3">
                <Button type="submit" loading={isPending}>Save Property</Button>
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Property grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : !Array.isArray(properties) || properties.length === 0 ? (
        <div className="text-center py-16">
          <Building2 size={48} className="mx-auto text-gray-200 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No properties yet</h3>
          <p className="text-gray-500 text-sm mt-1">Add your first property to get started</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Add Property
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((p) => (
            <div
              key={p.id}
              className="cursor-pointer hover:shadow-md transition-shadow rounded-xl"
              onClick={() => navigate(`/manager/properties/${p.id}`)}
            >
            <Card>
              <CardBody>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <Building2 className="text-indigo-600" size={18} />
                  </div>
                  <Badge variant={typeColors[p.type]}>{p.type}</Badge>
                </div>
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <p className="flex items-center gap-1 text-gray-400 text-xs mt-1">
                  <MapPin size={11} /> {p.address}, {p.city}, {p.state} {p.zip}
                </p>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-gray-500">{p._count.units} unit{p._count.units !== 1 ? 's' : ''}</span>
                  {p.owner && (
                    <span className="text-gray-400 text-xs">
                      Owner: {p.owner.user.firstName} {p.owner.user.lastName}
                    </span>
                  )}
                </div>
              </CardBody>
            </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
