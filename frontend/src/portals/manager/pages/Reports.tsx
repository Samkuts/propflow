import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  FileText, TrendingDown, Home, Wrench, Download,
  AlertCircle, DollarSign, Building2, Clock
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardHeader, CardBody, StatCard, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { formatCents, formatDate } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RentRollRow {
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  status: string;
  rentAmount: number;
  leaseId?: string;
  leaseStart?: string;
  leaseEnd?: string;
  tenants: { firstName: string; lastName: string; email: string }[];
  balanceDue: number;
}

interface DelinquencyRow {
  leaseId: string;
  propertyName: string;
  unitNumber: string;
  tenants: { firstName: string; lastName: string; email: string; phone?: string }[];
  totalBalance: number;
  daysDelinquent: number;
}

interface VacancyReport {
  totalVacant: number;
  totalLostRevenue: number;
  units: {
    unitId: string;
    unitNumber: string;
    propertyName: string;
    rentAmount: number;
    daysVacant?: number;
    estimatedLostRevenue: number;
  }[];
}

interface WorkOrderSummary {
  openCount: number;
  avgCompletionDays: number;
  totalMaintenanceCost: number;
  openOrders: {
    id: string;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
    property: { name: string };
    vendor?: { companyName: string };
  }[];
}

const TABS = [
  { key: 'rent-roll', label: 'Rent Roll', icon: Building2 },
  { key: 'delinquency', label: 'Delinquency', icon: AlertCircle },
  { key: 'vacancy', label: 'Vacancy', icon: Home },
  { key: 'work-orders', label: 'Work Orders', icon: Wrench },
] as const;

type TabKey = typeof TABS[number]['key'];

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// ─── CSV export helper ────────────────────────────────────────────────────────

function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(','),
    ...rows.map((row) =>
      keys.map((k) => JSON.stringify(row[k] ?? '')).join(',')
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}` };
}

function buildDateParams(start: string, end: string) {
  return `startDate=${start}&endDate=${end}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Reports() {
  const [activeTab, setActiveTab] = useState<TabKey>('rent-roll');

  const { start: defaultStart, end: defaultEnd } = currentMonthRange();
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const dateParams = buildDateParams(startDate, endDate);

  // Fetch all reports (lazy per tab)
  const { data: rentRoll, isLoading: rrLoading } = useQuery({
    queryKey: ['report', 'rent-roll', startDate, endDate],
    queryFn: () => apiGet<RentRollRow[]>(`/reports/rent-roll?${dateParams}`),
    enabled: activeTab === 'rent-roll',
  });

  const { data: delinquency, isLoading: delLoading } = useQuery({
    queryKey: ['report', 'delinquency'],
    queryFn: () => apiGet<DelinquencyRow[]>('/reports/delinquency'),
    enabled: activeTab === 'delinquency',
  });

  const { data: vacancy, isLoading: vacLoading } = useQuery({
    queryKey: ['report', 'vacancy', startDate, endDate],
    queryFn: () => apiGet<VacancyReport>(`/reports/vacancy?${dateParams}`),
    enabled: activeTab === 'vacancy',
  });

  const { data: woSummary, isLoading: woLoading } = useQuery({
    queryKey: ['report', 'work-orders', startDate, endDate],
    queryFn: () => apiGet<WorkOrderSummary>(`/reports/work-orders?${dateParams}`),
    enabled: activeTab === 'work-orders',
  });

  // ── Rent Roll chart data ────────────────────────────────────────────────
  const rentRollByProperty = Object.values(
    (rentRoll ?? []).reduce(
      (acc, row) => {
        if (!acc[row.propertyName]) {
          acc[row.propertyName] = { property: row.propertyName, units: 0, occupied: 0, revenue: 0 };
        }
        acc[row.propertyName].units++;
        if (row.status === 'OCCUPIED') {
          acc[row.propertyName].occupied++;
          acc[row.propertyName].revenue += row.rentAmount;
        }
        return acc;
      },
      {} as Record<string, { property: string; units: number; occupied: number; revenue: number }>
    )
  );

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Portfolio analytics and data exports</p>
      </div>

      {/* ── Date range filter (not shown for delinquency — it's always current-state) ── */}
      {activeTab !== 'delinquency' && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500 font-medium">Date range:</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { const { start, end } = currentMonthRange(); setStartDate(start); setEndDate(end); }}
          >
            This month
          </Button>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ══ RENT ROLL ════════════════════════════════════════════════════════ */}
      {activeTab === 'rent-roll' && (
        <div className="space-y-6">
          {rrLoading ? (
            <Skeleton className="h-80" />
          ) : (
            <>
              {/* Chart */}
              {rentRollByProperty.length > 0 && (
                <Card>
                  <CardHeader>
                    <span className="font-semibold text-gray-900">Occupancy & Revenue by Property</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        exportCSV('rent-roll.csv', (rentRoll ?? []).map((r) => ({
                          Property: r.propertyName,
                          Unit: r.unitNumber,
                          Status: r.status,
                          Tenants: r.tenants.map((t) => `${t.firstName} ${t.lastName}`).join('; '),
                          Rent: (r.rentAmount / 100).toFixed(2),
                          LeaseStart: r.leaseStart ?? '',
                          LeaseEnd: r.leaseEnd ?? '',
                          BalanceDue: (r.balanceDue / 100).toFixed(2),
                        })))
                      }
                    >
                      <Download size={13} /> Export CSV
                    </Button>
                  </CardHeader>
                  <CardBody>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={rentRollByProperty} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="property" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tickFormatter={(v) => `$${(v / 100).toLocaleString()}`}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip
                          formatter={(value, name) =>
                            name === 'revenue'
                              ? [`$${(Number(value) / 100).toLocaleString()}`, 'Monthly Revenue']
                              : [value, name === 'units' ? 'Total Units' : 'Occupied']
                          }
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="units" name="Total Units" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="left" dataKey="occupied" name="Occupied" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              )}

              {/* Table */}
              <Card>
                <CardHeader>
                  <span className="font-semibold text-gray-900">Rent Roll — All Units</span>
                  <span className="text-sm text-gray-400">{(rentRoll ?? []).length} units</span>
                </CardHeader>
                <Table<RentRollRow>
                  data={rentRoll ?? []}
                  emptyMessage="No units found"
                  columns={[
                    {
                      key: 'property',
                      header: 'Property',
                      render: (row) => <span className="font-medium text-gray-900">{row.propertyName}</span>,
                    },
                    {
                      key: 'unit',
                      header: 'Unit',
                      render: (row) => `Unit ${row.unitNumber}`,
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (row) => <StatusBadge status={row.status} />,
                    },
                    {
                      key: 'tenants',
                      header: 'Tenant(s)',
                      render: (row) =>
                        row.tenants.length
                          ? row.tenants.map((t) => `${t.firstName} ${t.lastName}`).join(', ')
                          : '—',
                    },
                    {
                      key: 'rentAmount',
                      header: 'Rent',
                      render: (row) => formatCents(row.rentAmount),
                    },
                    {
                      key: 'leaseEnd',
                      header: 'Lease End',
                      render: (row) => row.leaseEnd ? formatDate(row.leaseEnd) : '—',
                    },
                    {
                      key: 'balanceDue',
                      header: 'Balance Due',
                      render: (row) => (
                        <span className={row.balanceDue > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
                          {formatCents(row.balanceDue)}
                        </span>
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ DELINQUENCY ══════════════════════════════════════════════════════ */}
      {activeTab === 'delinquency' && (
        <div className="space-y-6">
          {delLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <StatCard
                  label="Delinquent Leases"
                  value={(delinquency ?? []).length}
                  icon={AlertCircle}
                  color="red"
                />
                <StatCard
                  label="Total Balance Due"
                  value={formatCents((delinquency ?? []).reduce((s, d) => s + d.totalBalance, 0))}
                  icon={DollarSign}
                  color="red"
                />
                <StatCard
                  label="Avg Days Delinquent"
                  value={
                    (delinquency ?? []).length
                      ? Math.round(
                          (delinquency ?? []).reduce((s, d) => s + d.daysDelinquent, 0) /
                            (delinquency ?? []).length
                        ) + 'd'
                      : '0d'
                  }
                  icon={Clock}
                  color="orange"
                />
              </div>

              <Card>
                <CardHeader>
                  <span className="font-semibold text-gray-900">Delinquency Report</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      exportCSV('delinquency.csv', (delinquency ?? []).map((d) => ({
                        Property: d.propertyName,
                        Unit: d.unitNumber,
                        Tenants: d.tenants.map((t) => `${t.firstName} ${t.lastName}`).join('; '),
                        Phone: d.tenants.map((t) => t.phone ?? '').join('; '),
                        TotalBalance: (d.totalBalance / 100).toFixed(2),
                        DaysDelinquent: d.daysDelinquent,
                      })))
                    }
                  >
                    <Download size={13} /> Export CSV
                  </Button>
                </CardHeader>
                <Table<DelinquencyRow>
                  data={delinquency ?? []}
                  emptyMessage="🎉 No delinquent tenants — all rents are current!"
                  columns={[
                    {
                      key: 'property',
                      header: 'Property / Unit',
                      render: (row) => (
                        <div>
                          <p className="font-medium text-gray-900">{row.propertyName}</p>
                          <p className="text-xs text-gray-400">Unit {row.unitNumber}</p>
                        </div>
                      ),
                    },
                    {
                      key: 'tenants',
                      header: 'Tenant(s)',
                      render: (row) => (
                        <div>
                          <p className="text-sm text-gray-900">
                            {row.tenants.map((t) => `${t.firstName} ${t.lastName}`).join(', ')}
                          </p>
                          {row.tenants[0]?.phone && (
                            <p className="text-xs text-gray-400">{row.tenants[0].phone}</p>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'totalBalance',
                      header: 'Balance Due',
                      render: (row) => (
                        <span className="text-red-600 font-semibold">{formatCents(row.totalBalance)}</span>
                      ),
                    },
                    {
                      key: 'daysDelinquent',
                      header: 'Days Past Due',
                      render: (row) => (
                        <span className={`font-medium ${row.daysDelinquent > 30 ? 'text-red-600' : 'text-orange-500'}`}>
                          {row.daysDelinquent}d
                        </span>
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ VACANCY ══════════════════════════════════════════════════════════ */}
      {activeTab === 'vacancy' && (
        <div className="space-y-6">
          {vacLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label="Vacant Units"
                  value={vacancy?.totalVacant ?? 0}
                  icon={Home}
                  color="orange"
                />
                <StatCard
                  label="Est. Lost Revenue"
                  value={formatCents(vacancy?.totalLostRevenue ?? 0)}
                  icon={TrendingDown}
                  color="red"
                  sub="Cumulative since vacancy"
                />
              </div>

              <Card>
                <CardHeader>
                  <span className="font-semibold text-gray-900">Vacant Units</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      exportCSV('vacancy.csv', (vacancy?.units ?? []).map((u) => ({
                        Property: u.propertyName,
                        Unit: u.unitNumber,
                        Rent: (u.rentAmount / 100).toFixed(2),
                        DaysVacant: u.daysVacant ?? 0,
                        LostRevenue: (u.estimatedLostRevenue / 100).toFixed(2),
                      })))
                    }
                  >
                    <Download size={13} /> Export CSV
                  </Button>
                </CardHeader>
                <Table
                  data={vacancy?.units ?? []}
                  emptyMessage="🎉 No vacant units!"
                  columns={[
                    {
                      key: 'property',
                      header: 'Property',
                      render: (row) => <span className="font-medium text-gray-900">{row.propertyName}</span>,
                    },
                    {
                      key: 'unit',
                      header: 'Unit',
                      render: (row) => `Unit ${row.unitNumber}`,
                    },
                    {
                      key: 'rentAmount',
                      header: 'Rent',
                      render: (row) => formatCents(row.rentAmount),
                    },
                    {
                      key: 'daysVacant',
                      header: 'Days Vacant',
                      render: (row) => (
                        <span className={`font-medium ${(row.daysVacant ?? 0) > 30 ? 'text-red-600' : 'text-orange-500'}`}>
                          {row.daysVacant ?? 0}d
                        </span>
                      ),
                    },
                    {
                      key: 'estimatedLostRevenue',
                      header: 'Est. Lost Revenue',
                      render: (row) => (
                        <span className="text-red-500 font-medium">
                          {formatCents(row.estimatedLostRevenue)}
                        </span>
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ WORK ORDERS ══════════════════════════════════════════════════════ */}
      {activeTab === 'work-orders' && (
        <div className="space-y-6">
          {woLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <StatCard
                  label="Open Work Orders"
                  value={woSummary?.openCount ?? 0}
                  icon={Wrench}
                  color="orange"
                />
                <StatCard
                  label="Avg Completion Time"
                  value={woSummary?.avgCompletionDays ? `${woSummary.avgCompletionDays}d` : '—'}
                  icon={Clock}
                  color="indigo"
                />
                <StatCard
                  label="Total Maintenance Cost"
                  value={formatCents(woSummary?.totalMaintenanceCost ?? 0)}
                  icon={DollarSign}
                  color="green"
                  sub="Approved invoices, all time"
                />
              </div>

              {/* Priority breakdown pie chart */}
              {(woSummary?.openOrders?.length ?? 0) > 0 && (() => {
                const byPriority = (woSummary!.openOrders).reduce(
                  (acc, wo) => {
                    acc[wo.priority] = (acc[wo.priority] || 0) + 1;
                    return acc;
                  },
                  {} as Record<string, number>
                );
                const pieData = Object.entries(byPriority).map(([name, value]) => ({ name, value }));
                return (
                  <Card>
                    <CardHeader>
                      <span className="font-semibold text-gray-900">Open Orders by Priority</span>
                    </CardHeader>
                    <CardBody className="flex items-center gap-8">
                      <PieChart width={200} height={180}>
                        <Pie data={pieData} cx={95} cy={85} outerRadius={75} dataKey="value" label={({ name }) => name}>
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                      <div className="space-y-2">
                        {pieData.map((d, i) => (
                          <div key={d.name} className="flex items-center gap-2 text-sm">
                            <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="text-gray-700">{d.name}</span>
                            <span className="text-gray-400 ml-1">({d.value})</span>
                          </div>
                        ))}
                      </div>
                    </CardBody>
                  </Card>
                );
              })()}

              <Card>
                <CardHeader>
                  <span className="font-semibold text-gray-900">Open Work Orders</span>
                </CardHeader>
                <Table
                  data={woSummary?.openOrders ?? []}
                  emptyMessage="No open work orders"
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
                      key: 'property',
                      header: 'Property',
                      render: (row) => row.property.name,
                    },
                    {
                      key: 'vendor',
                      header: 'Vendor',
                      render: (row) => row.vendor?.companyName ?? '—',
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (row) => <StatusBadge status={row.status} />,
                    },
                    {
                      key: 'createdAt',
                      header: 'Submitted',
                      render: (row) => formatDate(row.createdAt),
                    },
                  ]}
                />
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
