import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { apiGet } from '@/lib/api';
import { formatCents, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Building2, Home, DollarSign, TrendingUp } from 'lucide-react';

interface Property {
  id: string;
  name: string;
  type: string;
  _count: { units: number };
}

interface OwnerStatement {
  propertyId: string;
  propertyName: string;
  income: number;
  expenses: number;
  netOwnerAmount: number;
  units: Array<{ unitNumber: string; status: string }>;
}

export default function OwnerDashboard() {
  const { data: propertiesRaw, isLoading } = useQuery({
    queryKey: ['owner-properties'],
    queryFn: () => apiGet<{ data: Property[] }>('/properties'),
  });

  const properties: Property[] = (propertiesRaw as any)?.data ?? propertiesRaw ?? [];

  const now = new Date();
  const { data: statements } = useQuery({
    queryKey: ['owner-statements', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => apiGet<OwnerStatement[]>(`/accounting/owner-statement/me?year=${now.getFullYear()}&month=${now.getMonth() + 1}`),
    enabled: false, // enabled when ownerId is known
  });

  const totalIncome = statements?.reduce((s, st) => s + st.income, 0) ?? 0;
  const totalExpenses = statements?.reduce((s, st) => s + st.expenses, 0) ?? 0;
  const netOwner = statements?.reduce((s, st) => s + st.netOwnerAmount, 0) ?? 0;

  const chartData = statements?.map((s) => ({
    name: s.propertyName.substring(0, 12),
    Income: s.income / 100,
    Expenses: s.expenses / 100,
    Net: s.netOwnerAmount / 100,
  })) ?? [];

  const totalUnits = properties.reduce((s, p) => s + (p._count?.units ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portfolio Overview</h1>
        <p className="text-gray-500 text-sm">{now.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Properties" value={properties.length} icon={Building2} color="green" />
        <StatCard label="Total Units" value={totalUnits} icon={Home} color="green" />
        <StatCard label="Monthly Income" value={formatCents(totalIncome)} icon={DollarSign} color="green" />
        <StatCard label="Net to Owner" value={formatCents(netOwner)} icon={TrendingUp} color="green" />
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Income vs Expenses by Property</h2>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                <Bar dataKey="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="#f87171" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Net" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">My Properties</h2>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : properties.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              <Building2 size={32} className="mx-auto mb-2 opacity-30" />
              No properties assigned yet
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {properties.map((p) => (
                <li key={p.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.type} · {p._count?.units ?? 0} units</p>
                  </div>
                  <StatusBadge status={p.type} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
