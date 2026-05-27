import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Wrench, X, ChevronDown } from 'lucide-react';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MyLease {
  tenant: { id: string };
  lease: {
    id: string;
    unit: {
      id: string;
      unitNumber: string;
      property: { id: string; name: string; address: string };
    };
  } | null;
}

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  scheduledDate?: string;
  property: { name: string };
  unit?: { unitNumber: string };
}

// ─── Form schema ─────────────────────────────────────────────────────────────

const schema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Please describe the issue in more detail'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'EMERGENCY']),
});
type FormValues = z.infer<typeof schema>;

const PRIORITY_LABELS: Record<string, { label: string; desc: string }> = {
  LOW: { label: 'Low', desc: 'Minor issue, no rush' },
  NORMAL: { label: 'Normal', desc: 'Standard maintenance' },
  HIGH: { label: 'High', desc: 'Needs attention soon' },
  EMERGENCY: { label: 'Emergency', desc: 'Immediate danger or no heat/water' },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function TenantMaintenance() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  // Get tenant's lease (to know their propertyId / unitId)
  const { data: myLease } = useQuery({
    queryKey: ['my-lease'],
    queryFn: () => apiGet<MyLease>('/leases/my-lease'),
    retry: false,
  });

  const propertyId = myLease?.lease?.unit.property.id;
  const unitId = myLease?.lease?.unit.id;

  // List work orders for this property/unit
  const { data: raw, isLoading } = useQuery({
    queryKey: ['my-work-orders', propertyId],
    queryFn: () =>
      apiGet<{ workOrders: WorkOrder[]; total: number }>(
        `/maintenance/work-orders?propertyId=${propertyId}&limit=50`
      ),
    enabled: !!propertyId,
  });
  const workOrders: WorkOrder[] = raw?.workOrders ?? (Array.isArray(raw) ? (raw as WorkOrder[]) : []);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'NORMAL' },
  });

  const { mutate: submit, isPending } = useMutation({
    mutationFn: (data: FormValues) =>
      apiPost('/maintenance/work-orders', {
        ...data,
        propertyId,
        unitId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-work-orders'] });
      setShowForm(false);
      reset();
      toast.success('Request submitted! We\'ll be in touch soon.');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="pt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
          {myLease?.lease && (
            <p className="text-gray-500 text-sm mt-0.5">
              Unit {myLease.lease.unit.unitNumber} · {myLease.lease.unit.property.name}
            </p>
          )}
        </div>
        {myLease?.lease && (
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus size={14} /> New Request
          </Button>
        )}
      </div>

      {/* ── Submit Form ────────────────────────────────────────────────── */}
      {showForm && (
        <Card>
          <CardHeader>
            <span className="font-semibold text-gray-900">New Maintenance Request</span>
            <button onClick={() => { setShowForm(false); reset(); }} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit((d) => submit(d))} className="space-y-4">
              <Input
                label="Title"
                placeholder="e.g. Leaking faucet under kitchen sink"
                error={errors.title?.message}
                {...register('title')}
              />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe the issue in detail — when it started, how severe it is…"
                  className={`block w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 ${errors.description ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                  {...register('description')}
                />
                {errors.description && <p className="text-xs text-red-600">{errors.description.message}</p>}
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Priority</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PRIORITY_LABELS).map(([val, { label, desc }]) => (
                    <label
                      key={val}
                      className="flex items-start gap-2 border border-gray-200 rounded-lg p-3 cursor-pointer has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50 transition-colors"
                    >
                      <input type="radio" value={val} {...register('priority')} className="mt-0.5 accent-teal-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{label}</p>
                        <p className="text-xs text-gray-400">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="submit" loading={isPending} className="bg-teal-600 hover:bg-teal-700 focus:ring-teal-500">
                  Submit Request
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); reset(); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* ── No lease state ─────────────────────────────────────────────── */}
      {!myLease?.lease && !isLoading && (
        <Card>
          <CardBody>
            <div className="py-8 text-center">
              <Wrench size={36} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-600 font-medium">No active lease found</p>
              <p className="text-gray-400 text-sm mt-1">Contact your property manager for assistance</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Work Orders List ───────────────────────────────────────────── */}
      {myLease?.lease && (
        <div className="space-y-3">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardBody>
                  <div className="h-16 bg-gray-100 animate-pulse rounded" />
                </CardBody>
              </Card>
            ))
          ) : workOrders.length === 0 ? (
            <Card>
              <CardBody>
                <div className="py-10 text-center">
                  <Wrench size={36} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-gray-500 font-medium">No requests yet</p>
                  <p className="text-gray-400 text-sm mt-1">Submit a request using the button above</p>
                </div>
              </CardBody>
            </Card>
          ) : (
            workOrders.map((wo) => (
              <Card key={wo.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <StatusBadge status={wo.priority} />
                        <StatusBadge status={wo.status} />
                      </div>
                      <p className="font-semibold text-gray-900 truncate">{wo.title}</p>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{wo.description}</p>
                      <p className="text-xs text-gray-400 mt-2">Submitted {formatDate(wo.createdAt)}</p>
                      {wo.scheduledDate && (
                        <p className="text-xs text-teal-600 mt-0.5 font-medium">
                          Scheduled {formatDate(wo.scheduledDate)}
                        </p>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
