import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Users, ChevronRight } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, Skeleton } from '@/components/ui/Card';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { formatCents } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TenantLease {
  id: string;
  status: string;
  rentAmount: number;
  unit: {
    unitNumber: string;
    property: { id: string; name: string };
  };
}

interface Tenant {
  id: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  lease?: TenantLease;
}

interface TenantsResponse {
  data: Tenant[];
  total: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Tenants() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout((window as unknown as { _searchTimer?: ReturnType<typeof setTimeout> })._searchTimer);
    (window as unknown as { _searchTimer?: ReturnType<typeof setTimeout> })._searchTimer = setTimeout(
      () => setDebouncedSearch(value),
      300
    );
  };

  const { data: raw, isLoading } = useQuery({
    queryKey: ['tenants', debouncedSearch],
    queryFn: () =>
      apiGet<TenantsResponse>(
        `/leases/tenants${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`
      ),
  });

  const tenants: Tenant[] = raw?.data ?? (Array.isArray(raw) ? (raw as Tenant[]) : []);
  const total = raw?.total ?? tenants.length;

  // Stats
  const active = tenants.filter((t) => t.lease?.status === 'ACTIVE' || t.lease?.status === 'MONTH_TO_MONTH').length;
  const noLease = tenants.filter((t) => !t.lease).length;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
        <p className="text-gray-500 text-sm mt-1">{total} tenant{total !== 1 ? 's' : ''}</p>
      </div>

      {/* ── Quick stats ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Tenants', value: total, color: 'text-gray-900' },
          { label: 'Active Leases', value: active, color: 'text-green-600' },
          { label: 'No Active Lease', value: noLease, color: 'text-amber-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4">
            <p className={`text-2xl font-bold ${s.color}`}>{isLoading ? '—' : s.value}</p>
            <p className="text-sm text-gray-500 font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <Card>
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : tenants.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={40} className="mx-auto text-gray-200 mb-4" />
            <p className="text-gray-500 font-medium">No tenants yet</p>
            <p className="text-gray-400 text-sm mt-1">Tenants are added when you create a lease</p>
          </div>
        ) : (
          <Table<Tenant>
            data={tenants}
            emptyMessage="No tenants found"
            onRowClick={(row) =>
              row.lease && navigate(`/manager/leases/${row.lease.id}/ledger`)
            }
            columns={[
              {
                key: 'name',
                header: 'Tenant',
                render: (row) => (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-bold shrink-0">
                      {row.user.firstName[0]}{row.user.lastName[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {row.user.firstName} {row.user.lastName}
                      </p>
                      <p className="text-xs text-gray-400">{row.user.email}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'phone',
                header: 'Phone',
                render: (row) => (
                  <span className="text-sm text-gray-600">{row.user.phone ?? '—'}</span>
                ),
              },
              {
                key: 'unit',
                header: 'Unit',
                render: (row) =>
                  row.lease ? (
                    <div>
                      <Link
                        to={`/manager/properties/${row.lease.unit.property.id}/units/${row.lease.unit.unitNumber}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Unit {row.lease.unit.unitNumber}
                      </Link>
                      <p className="text-xs text-gray-400">{row.lease.unit.property.name}</p>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm italic">No unit</span>
                  ),
              },
              {
                key: 'rent',
                header: 'Monthly Rent',
                render: (row) =>
                  row.lease ? (
                    <span className="text-sm font-medium text-gray-900">
                      {formatCents(row.lease.rentAmount)}/mo
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  ),
              },
              {
                key: 'leaseStatus',
                header: 'Lease Status',
                render: (row) =>
                  row.lease ? (
                    <StatusBadge status={row.lease.status} />
                  ) : (
                    <Badge variant="gray">No lease</Badge>
                  ),
              },
              {
                key: 'ledger',
                header: '',
                render: (row) =>
                  row.lease ? (
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/manager/leases/${row.lease.id}/ledger`}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Ledger
                      </Link>
                      <ChevronRight size={13} className="text-gray-300" />
                    </div>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
