import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, DollarSign, Wrench, TrendingUp, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { formatCents } from '@/lib/utils';
import { StatCard, Card, CardHeader, CardBody, Skeleton } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';

interface VacantUnit {
  unitId: string;
  unitNumber: string;
  property: { name: string };
  daysVacant: number | null;
  rentAmount: number;
}

interface WorkOrder {
  id: string;
  title: string;
  status: string;
  priority: string;
  property: { name: string };
}

interface DelinquencyEntry {
  leaseId: string;
  propertyName: string;
  unitNumber: string;
  tenants: { firstName: string; lastName: string }[];
  totalBalance: number;
  daysDelinquent: number;
}

interface ExpiringLease {
  id: string;
  endDate: string;
  status: string;
  unit: {
    id: string;
    unitNumber: string;
    property: { id: string; name: string };
  };
  tenants: { id: string; firstName: string; lastName: string }[];
}

export default function Dashboard() {
  const [expiryExpanded, setExpiryExpanded] = useState(false);

  const { data: vacancy, isLoading: vacLoading } = useQuery({
    queryKey: ['vacancy'],
    queryFn: () => apiGet<VacantUnit[]>('/properties/vacancy'),
  });

  const { data: workOrderSummary, isLoading: woLoading } = useQuery({
    queryKey: ['work-order-summary'],
    queryFn: () => apiGet<{ openCount: number; avgCompletionDays: number; totalMaintenanceCost: number; openOrders: WorkOrder[] }>('/reports/work-orders'),
  });

  const { data: delinquency, isLoading: delLoading } = useQuery({
    queryKey: ['delinquency'],
    queryFn: () => apiGet<DelinquencyEntry[]>('/reports/delinquency'),
  });

  const { data: expiringLeases, isLoading: expiryLoading } = useQuery({
    queryKey: ['expiring-leases'],
    queryFn: () => apiGet<ExpiringLease[]>('/leases/expiring?days=30'),
  });

  const totalDelinquent = delinquency?.reduce((s, d) => s + d.totalBalance, 0) ?? 0;

  function daysUntil(dateStr: string) {
    return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000));
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Overview of your portfolio</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {vacLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatCard label="Vacant Units" value={vacancy?.length ?? 0} icon={Building2} color="indigo"
              sub={vacancy?.length ? `${vacancy.length} unit${vacancy.length !== 1 ? 's' : ''} need tenants` : 'All units occupied'} />
            <StatCard label="Open Work Orders" value={workOrderSummary?.openCount ?? 0} icon={Wrench} color="orange"
              sub={`Avg ${workOrderSummary?.avgCompletionDays ?? 0}d to complete`} />
            <StatCard label="Delinquent Balance" value={formatCents(totalDelinquent)} icon={AlertCircle} color="red"
              sub={`${delinquency?.length ?? 0} tenant${delinquency?.length !== 1 ? 's' : ''} past due`} />
            <StatCard label="Maintenance Cost" value={formatCents(workOrderSummary?.totalMaintenanceCost ?? 0)} icon={DollarSign} color="green"
              sub="Closed work orders, all time" />
            <StatCard label="Expiring Soon" value={expiringLeases?.length ?? 0} icon={Clock} color="orange"
              sub="Leases ending in 30 days" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vacant Units */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Vacant Units</h2>
            <span className="text-xs text-gray-400">{vacancy?.length ?? 0} total</span>
          </CardHeader>
          <CardBody className="p-0">
            {vacLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : vacancy?.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                All units are occupied
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {vacancy?.slice(0, 6).map((u) => (
                  <li key={u.unitId} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-gray-900">Unit {u.unitNumber}</p>
                      <p className="text-xs text-gray-400">{u.property.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-700">{formatCents(u.rentAmount)}/mo</p>
                      <p className="text-xs text-red-500">{u.daysVacant ?? 0}d vacant</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Delinquency */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Delinquent Tenants</h2>
            <span className="text-xs text-gray-400">{formatCents(totalDelinquent)} total</span>
          </CardHeader>
          <CardBody className="p-0">
            {delLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : delinquency?.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
                All tenants are current
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {delinquency?.slice(0, 6).map((d) => (
                  <li key={d.leaseId} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-gray-900">
                        {d.tenants[0]?.firstName} {d.tenants[0]?.lastName}
                      </p>
                      <p className="text-xs text-gray-400">{d.propertyName} · Unit {d.unitNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">{formatCents(d.totalBalance)}</p>
                      <p className="text-xs text-gray-400">{d.daysDelinquent}d past due</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Expiring Leases */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Expiring Soon (30 days)</h2>
            <button
              onClick={() => setExpiryExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
            >
              {expiryExpanded ? <><ChevronUp size={14} /> Collapse</> : <><ChevronDown size={14} /> {expiringLeases?.length ?? 0} lease{expiringLeases?.length !== 1 ? 's' : ''}</>}
            </button>
          </CardHeader>
          <CardBody className="p-0">
            {expiryLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : expiringLeases?.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                <Clock size={32} className="mx-auto mb-2 opacity-30" />
                No leases expiring in the next 30 days
              </div>
            ) : expiryExpanded ? (
              <ul className="divide-y divide-gray-100">
                {expiringLeases?.map((l) => {
                  const days = daysUntil(l.endDate);
                  return (
                    <li key={l.id} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm text-gray-900">
                          {l.tenants[0]?.firstName} {l.tenants[0]?.lastName}
                        </p>
                        <p className="text-xs text-gray-400">{l.unit.property.name} · Unit {l.unit.unitNumber}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${days <= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {days === 0 ? 'Today' : `${days}d left`}
                        </span>
                        <Link to={`/manager/leases/${l.id}`} className="text-xs text-indigo-600 hover:underline">
                          View
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-6 py-4">
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-amber-600">{expiringLeases?.length}</span> lease{expiringLeases?.length !== 1 ? 's' : ''} expiring — click to expand.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {expiringLeases?.slice(0, 3).map((l) => {
                    const days = daysUntil(l.endDate);
                    return (
                      <span key={l.id} className={`text-xs font-medium px-2 py-0.5 rounded-full ${days <= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        Unit {l.unit.unitNumber} · {days}d
                      </span>
                    );
                  })}
                  {(expiringLeases?.length ?? 0) > 3 && (
                    <span className="text-xs text-gray-400">+{(expiringLeases?.length ?? 0) - 3} more</span>
                  )}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Open Work Orders */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Open Work Orders</h2>
          </CardHeader>
          <CardBody className="p-0">
            {woLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : workOrderSummary?.openOrders?.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                <Wrench size={32} className="mx-auto mb-2 opacity-30" />
                No open work orders
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {workOrderSummary?.openOrders?.slice(0, 8).map((wo) => (
                  <li key={wo.id} className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={wo.priority} />
                      <div>
                        <p className="font-medium text-sm text-gray-900">{wo.title}</p>
                        <p className="text-xs text-gray-400">{wo.property.name}</p>
                      </div>
                    </div>
                    <StatusBadge status={wo.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
