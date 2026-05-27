import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, FileText, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { Card, CardHeader, CardBody, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { formatCents, formatDate } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  user: { firstName: string; lastName: string; email: string };
}

interface Lease {
  id: string;
  status: string;
  startDate: string;
  endDate?: string;
  rentAmount: number;
  balanceDue: number;
  unit: {
    id: string;
    unitNumber: string;
    property: { id: string; name: string };
  };
  tenants: Tenant[];
}

interface LeasesResponse {
  data: Lease[];
  total: number;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'MONTH_TO_MONTH', label: 'Month-to-Month' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'TERMINATED', label: 'Terminated' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function Leases() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['leases', statusFilter, search],
    queryFn: () =>
      apiGet<LeasesResponse>(
        `/leases?${statusFilter ? `status=${statusFilter}&` : ''}${search ? `search=${encodeURIComponent(search)}&` : ''}`
      ),
  });

  const leases: Lease[] = raw?.data ?? (Array.isArray(raw) ? (raw as Lease[]) : []);
  const total = raw?.total ?? leases.length;

  const { mutate: activate } = useMutation({
    mutationFn: (id: string) => apiPost(`/leases/${id}/activate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leases'] });
      toast.success('Lease activated — unit marked occupied');
      setActivatingId(null);
    },
    onError: (e) => { toast.error(getErrorMessage(e)); setActivatingId(null); },
  });

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leases</h1>
          <p className="text-gray-500 text-sm mt-1">{total} lease{total !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/manager/leases/new">
          <Button>
            <Plus size={15} /> New Lease
          </Button>
        </Link>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tenant or property…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <Card>
        <Table<Lease>
          loading={isLoading}
          data={leases}
          emptyMessage="No leases found"
          onRowClick={(row) => navigate(`/manager/leases/${row.id}`)}
          columns={[
            {
              key: 'tenant',
              header: 'Tenant(s)',
              render: (row) => (
                <div>
                  <p className="font-medium text-gray-900">
                    {row.tenants.length
                      ? row.tenants.map((t) => `${t.user.firstName} ${t.user.lastName}`).join(', ')
                      : <span className="text-gray-400 italic">No tenant</span>}
                  </p>
                  {row.tenants[0] && (
                    <p className="text-xs text-gray-400">{row.tenants[0].user.email}</p>
                  )}
                </div>
              ),
            },
            {
              key: 'unit',
              header: 'Unit',
              render: (row) => (
                <div>
                  <Link
                    to={`/manager/properties/${row.unit.property.id}/units/${row.unit.id}`}
                    className="font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Unit {row.unit.unitNumber}
                  </Link>
                  <p className="text-xs text-gray-400">{row.unit.property.name}</p>
                </div>
              ),
            },
            {
              key: 'dates',
              header: 'Term',
              render: (row) => {
                const daysLeft = row.endDate
                  ? Math.ceil((new Date(row.endDate).getTime() - Date.now()) / 86_400_000)
                  : null;
                const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 60
                  && ['ACTIVE', 'MONTH_TO_MONTH'].includes(row.status);
                return (
                  <div>
                    <span className="text-sm">
                      {formatDate(row.startDate)} →{' '}
                      {row.endDate ? formatDate(row.endDate) : 'MTM'}
                    </span>
                    {expiringSoon && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                        {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              key: 'rentAmount',
              header: 'Rent',
              render: (row) => (
                <span className="font-medium">{formatCents(row.rentAmount)}/mo</span>
              ),
            },
            {
              key: 'balanceDue',
              header: 'Balance Due',
              render: (row) => (
                <span className={row.balanceDue > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                  {formatCents(row.balanceDue)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <div className="flex items-center gap-2">
                  <StatusBadge status={row.status} />
                  {row.status === 'PENDING' && (
                    <button
                      className="text-xs text-indigo-600 font-medium hover:text-indigo-800 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivatingId(row.id);
                        activate(row.id);
                      }}
                    >
                      {activatingId === row.id ? 'Activating…' : 'Activate'}
                    </button>
                  )}
                </div>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (row) => (
                <ChevronRight size={15} className="text-gray-400" />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
