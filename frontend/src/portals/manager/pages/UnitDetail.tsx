import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, BedDouble, Bath, Maximize2, DollarSign,
  AlertTriangle, Users, Wrench, FileText, X, Link2, Eye, EyeOff
} from 'lucide-react';
import { apiGet, apiPatch, apiPost, getErrorMessage } from '@/lib/api';
import { Card, CardBody, CardHeader, StatCard, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { formatCents, formatDate } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  user: { firstName: string; lastName: string; email: string; phone?: string };
}

interface Lease {
  id: string;
  status: string;
  startDate: string;
  endDate?: string;
  rentAmount: number;
  depositAmount: number;
  tenants: Tenant[];
}

interface Unit {
  id: string;
  unitNumber: string;
  beds: number;
  baths: number;
  sqft?: number;
  rentAmount: number;
  status: 'OCCUPIED' | 'VACANT' | 'UNDER_MAINTENANCE' | 'NOTICE_GIVEN';
  vacantSince?: string;
  description?: string;
  listingEnabled?: boolean;
  listingDescription?: string;
  property?: { id: string; name: string; address: string; city: string; state: string; zip: string };
  activeLease?: Lease;
  leaseHistory?: Lease[];
}

interface RentCharge {
  id: string;
  type: string;
  description?: string;
  amount: number;
  dueDate: string;
  status: string;
  balance: number;
}

interface WorkOrder {
  id: string;
  title: string;
  priority: string;
  status: string;
  createdAt: string;
}

// ─── Terminate Confirm Modal ──────────────────────────────────────────────────

function TerminateModal({
  leaseId,
  onClose,
  onSuccess,
}: {
  leaseId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { mutate: terminate, isPending } = useMutation({
    mutationFn: () => apiPatch(`/leases/${leaseId}/terminate`, {}),
    onSuccess: () => {
      toast.success('Lease terminated');
      onSuccess();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="text-red-600" size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Terminate Lease?</h2>
            <p className="text-sm text-gray-500 mt-1">
              This will end the lease and mark the unit as vacant. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={isPending} onClick={() => terminate()}>
            Terminate Lease
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UnitDetail() {
  const { propertyId, unitId } = useParams<{ propertyId: string; unitId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'info' | 'charges' | 'workorders'>('info');
  const [showTerminate, setShowTerminate] = useState(false);

  // Fetch unit with full details
  const { data: unit, isLoading: unitLoading } = useQuery({
    queryKey: ['unit', unitId],
    queryFn: () => apiGet<Unit>(`/units/${unitId}`),
    enabled: !!unitId,
  });

  // Fetch tenant ledger (charges) — only when tab active or unit is occupied
  const { data: ledgerRaw, isLoading: ledgerLoading } = useQuery({
    queryKey: ['ledger', unit?.activeLease?.id],
    queryFn: () =>
      apiGet<{ charges: RentCharge[]; payments: unknown[]; totalCharged: number; totalPaid: number; balance: number }>(
        `/accounting/tenant-ledger/${unit!.activeLease!.id}`
      ),
    enabled: !!unit?.activeLease?.id && activeTab === 'charges',
  });

  // Fetch work orders for this unit
  const { data: woRaw, isLoading: woLoading } = useQuery({
    queryKey: ['workorders', 'unit', unitId],
    queryFn: () => apiGet<WorkOrder[] | { data: WorkOrder[] }>(`/maintenance?unitId=${unitId}`),
    enabled: !!unitId && activeTab === 'workorders',
  });
  const workOrders: WorkOrder[] = Array.isArray(woRaw)
    ? woRaw
    : (woRaw as { data: WorkOrder[] })?.data ?? [];

  const charges: RentCharge[] = ledgerRaw?.charges ?? [];

  const tabs = [
    { key: 'info' as const, label: 'Lease & Info', icon: Users },
    { key: 'charges' as const, label: 'Charges', icon: DollarSign },
    { key: 'workorders' as const, label: 'Work Orders', icon: Wrench },
  ];

  if (unitLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="text-center py-24 text-gray-400">
        Unit not found.{' '}
        <button
          className="text-indigo-600 underline"
          onClick={() => navigate(`/manager/properties/${propertyId}`)}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => navigate(`/manager/properties/${propertyId}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
        >
          <ArrowLeft size={14} />
          {unit.property?.name ?? 'Property'}
        </button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Unit {unit.unitNumber}</h1>
              <StatusBadge status={unit.status} />
            </div>
            {unit.property && (
              <p className="text-sm text-gray-400 mt-1">
                {unit.property.address}, {unit.property.city}, {unit.property.state}
              </p>
            )}
          </div>
          {unit.status === 'VACANT' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  const enabled = !unit.listingEnabled;
                  apiPatch(`/listings/properties/${propertyId}/units/${unitId}`, { listingEnabled: enabled })
                    .then(() => {
                      qc.invalidateQueries({ queryKey: ['unit', propertyId, unitId] });
                      toast.success(enabled ? 'Unit listed publicly' : 'Listing removed');
                    })
                    .catch(() => toast.error('Could not update listing'));
                }}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-colors ${
                  unit.listingEnabled
                    ? 'text-green-700 bg-green-50 hover:bg-green-100'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {unit.listingEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
                {unit.listingEnabled ? 'Listed' : 'List Unit'}
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/apply/${unit.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Application link copied!');
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
              >
                <Link2 size={14} /> Copy Application Link
              </button>
            <Link to={`/manager/leases/new?unitId=${unit.id}`}>
              <Button>
                <FileText size={15} /> Create Lease
              </Button>
            </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Beds" value={unit.beds ?? '—'} icon={BedDouble} color="indigo" />
        <StatCard label="Baths" value={unit.baths ?? '—'} icon={Bath} color="indigo" />
        <StatCard
          label="Sqft"
          value={unit.sqft ? unit.sqft.toLocaleString() : '—'}
          icon={Maximize2}
          color="gray"
        />
        <StatCard
          label="Monthly Rent"
          value={formatCents(unit.rentAmount)}
          icon={DollarSign}
          color="green"
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Info / Lease Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'info' && (
        <div className="space-y-6">
          {/* Current lease */}
          {unit.activeLease ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">Current Lease</span>
                  <StatusBadge status={unit.activeLease.status} />
                </div>
                <div className="flex gap-2">
                  <Link to={`/manager/leases/${unit.activeLease.id}/ledger`}>
                    <Button variant="secondary" size="sm">
                      <DollarSign size={13} /> View Ledger
                    </Button>
                  </Link>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowTerminate(true)}
                  >
                    Terminate
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Start Date</p>
                    <p className="text-sm text-gray-900">{formatDate(unit.activeLease.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">End Date</p>
                    <p className="text-sm text-gray-900">
                      {unit.activeLease.endDate ? formatDate(unit.activeLease.endDate) : 'Month-to-Month'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Monthly Rent</p>
                    <p className="text-sm font-semibold text-gray-900">{formatCents(unit.activeLease.rentAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Security Deposit</p>
                    <p className="text-sm text-gray-900">{formatCents(unit.activeLease.depositAmount)}</p>
                  </div>
                </div>

                {/* Tenants */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tenants</p>
                  <div className="space-y-2">
                    {unit.activeLease.tenants.map((tenant) => (
                      <div key={tenant.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-bold">
                          {tenant.user.firstName[0]}{tenant.user.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {tenant.user.firstName} {tenant.user.lastName}
                          </p>
                          <p className="text-xs text-gray-400">{tenant.user.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <div className="text-center py-8">
                  <FileText size={32} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-gray-500 font-medium">No active lease</p>
                  <p className="text-gray-400 text-sm mt-1">
                    {unit.status === 'VACANT'
                      ? 'This unit is vacant — create a lease to place a tenant'
                      : 'No lease data available'}
                  </p>
                  {unit.status === 'VACANT' && (
                    <Link to={`/manager/leases/new?unitId=${unit.id}`}>
                      <Button className="mt-4">
                        <FileText size={14} /> Create Lease
                      </Button>
                    </Link>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Lease history */}
          {unit.leaseHistory && unit.leaseHistory.length > 0 && (
            <Card>
              <CardHeader>
                <span className="font-semibold text-gray-900">Lease History</span>
              </CardHeader>
              <Table<Lease>
                data={unit.leaseHistory}
                emptyMessage="No past leases"
                columns={[
                  {
                    key: 'tenants',
                    header: 'Tenant(s)',
                    render: (row) => row.tenants?.map((t) => `${t.user.firstName} ${t.user.lastName}`).join(', ') ?? '—',
                  },
                  {
                    key: 'startDate',
                    header: 'Start',
                    render: (row) => formatDate(row.startDate),
                  },
                  {
                    key: 'endDate',
                    header: 'End',
                    render: (row) => row.endDate ? formatDate(row.endDate) : '—',
                  },
                  {
                    key: 'rentAmount',
                    header: 'Rent',
                    render: (row) => formatCents(row.rentAmount),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (row) => <StatusBadge status={row.status} />,
                  },
                ]}
              />
            </Card>
          )}
        </div>
      )}

      {/* ── Charges Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'charges' && (
        <Card>
          <CardHeader>
            <span className="font-semibold text-gray-900">Recent Charges</span>
            {unit.activeLease && (
              <Link to={`/manager/leases/${unit.activeLease.id}/ledger`}>
                <Button variant="secondary" size="sm">Full Ledger</Button>
              </Link>
            )}
          </CardHeader>
          <Table<RentCharge>
            loading={ledgerLoading}
            data={charges.slice(0, 10)}
            emptyMessage={unit.activeLease ? 'No charges found' : 'No active lease — charges will appear here'}
            columns={[
              {
                key: 'type',
                header: 'Type',
                render: (row) => (
                  <span className="font-medium text-gray-900 capitalize">
                    {row.type.replace(/_/g, ' ').toLowerCase()}
                  </span>
                ),
              },
              {
                key: 'description',
                header: 'Description',
                render: (row) => <span className="text-gray-500 text-xs">{row.description ?? '—'}</span>,
              },
              {
                key: 'dueDate',
                header: 'Due Date',
                render: (row) => formatDate(row.dueDate),
              },
              {
                key: 'amount',
                header: 'Amount',
                render: (row) => formatCents(row.amount),
              },
              {
                key: 'balance',
                header: 'Balance',
                render: (row) => (
                  <span className={row.balance > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                    {formatCents(row.balance)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusBadge status={row.status} />,
              },
            ]}
          />
        </Card>
      )}

      {/* ── Work Orders Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'workorders' && (
        <Card>
          <CardHeader>
            <span className="font-semibold text-gray-900">Work Orders</span>
          </CardHeader>
          <Table<WorkOrder>
            loading={woLoading}
            data={workOrders}
            emptyMessage="No work orders for this unit"
            columns={[
              {
                key: 'priority',
                header: 'Priority',
                render: (row) => <StatusBadge status={row.priority} />,
              },
              {
                key: 'title',
                header: 'Title',
                render: (row) => <span className="font-medium text-gray-900">{row.title}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusBadge status={row.status} />,
              },
              {
                key: 'createdAt',
                header: 'Date',
                render: (row) => formatDate(row.createdAt),
              },
            ]}
          />
        </Card>
      )}

      {/* ── Terminate modal ───────────────────────────────────────────────────── */}
      {showTerminate && unit.activeLease && (
        <TerminateModal
          leaseId={unit.activeLease.id}
          onClose={() => setShowTerminate(false)}
          onSuccess={() => {
            setShowTerminate(false);
            qc.invalidateQueries({ queryKey: ['unit', unitId] });
            qc.invalidateQueries({ queryKey: ['units', propertyId] });
          }}
        />
      )}
    </div>
  );
}
