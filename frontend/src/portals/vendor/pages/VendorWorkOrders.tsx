import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Wrench } from 'lucide-react';

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  scheduledDate: string | null;
  property: { name: string; address: string };
  unit: { unitNumber: string } | null;
  invoices: { id: string; status: string; amount: number }[];
}

export default function VendorWorkOrders() {
  const user = useAuthStore((s) => s.user);

  const { data: workOrders, isLoading } = useQuery({
    queryKey: ['vendor-work-orders', user?.sub],
    queryFn: () => apiGet<WorkOrder[]>(`/maintenance/vendor/${user?.sub}/work-orders`),
    enabled: !!user?.sub,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Work Orders</h1>
        <p className="text-gray-500 text-sm">{workOrders?.length ?? 0} assigned to you</p>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Loading…</div>
      ) : !workOrders?.length ? (
        <div className="text-center py-16">
          <Wrench size={48} className="mx-auto text-gray-200 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No work orders yet</h3>
          <p className="text-gray-400 text-sm mt-1">You'll see jobs here once assigned by a property manager</p>
        </div>
      ) : (
        <div className="space-y-4">
          {workOrders.map((wo) => (
            <Card key={wo.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={wo.priority} />
                      <StatusBadge status={wo.status} />
                    </div>
                    <h3 className="font-semibold text-gray-900">{wo.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{wo.description}</p>
                    <div className="mt-3 text-xs text-gray-400 space-y-0.5">
                      <p>{wo.property.name} {wo.unit ? `· Unit ${wo.unit.unitNumber}` : ''}</p>
                      <p>{wo.property.address}</p>
                      <p>Submitted {formatDate(wo.createdAt)}</p>
                      {wo.scheduledDate && <p>Scheduled {formatDate(wo.scheduledDate)}</p>}
                    </div>
                  </div>
                  {wo.invoices.length > 0 && (
                    <div className="text-right text-xs">
                      <p className="text-gray-500">Invoice</p>
                      <StatusBadge status={wo.invoices[0].status} />
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
