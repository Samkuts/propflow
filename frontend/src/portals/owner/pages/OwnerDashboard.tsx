import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import toast from 'react-hot-toast';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { formatCents, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Building2, Home, DollarSign, TrendingUp, AlertOctagon, CheckCircle2, XCircle, X } from 'lucide-react';

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

interface PendingWorkOrder {
  id: string;
  title: string;
  description: string;
  priority: string;
  estimatedCost?: number;
  createdAt: string;
  property: { name: string; address: string };
  unit?: { unitNumber: string };
}

// ─── Rejection Modal ──────────────────────────────────────────────────────────

function RejectModal({ wo, onClose }: { wo: PendingWorkOrder; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  const rejectMutation = useMutation({
    mutationFn: () => apiPost(`/maintenance/work-orders/${wo.id}/owner-reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
      toast.success('Work order rejected');
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Reject Work Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-600">Please provide a reason for rejection. This will be visible to the property manager.</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Please get additional quotes before proceeding."
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending || !reason.trim()}
            className="flex-1 py-2.5 bg-red-600 text-white font-medium rounded-lg text-sm hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {rejectMutation.isPending ? 'Rejecting…' : 'Reject Work Order'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function OwnerDashboard() {
  const qc = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<PendingWorkOrder | undefined>();

  const { data: propertiesRaw, isLoading } = useQuery({
    queryKey: ['owner-properties'],
    queryFn: () => apiGet<{ data: Property[] }>('/properties'),
  });

  const properties: Property[] =
    (propertiesRaw as unknown as { data: Property[] })?.data ??
    (propertiesRaw as unknown as Property[]) ??
    [];

  const { data: pendingApprovals = [] } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () => apiGet<PendingWorkOrder[]>('/maintenance/work-orders/pending-owner-approval'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/maintenance/work-orders/${id}/owner-approve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
      toast.success('Work order approved');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const now = new Date();
  const { data: statements } = useQuery({
    queryKey: ['owner-statements', now.getFullYear(), now.getMonth() + 1],
    queryFn: () =>
      apiGet<OwnerStatement[]>(
        `/accounting/owner-statement/me?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
      ),
    enabled: false,
  });

  const totalIncome = statements?.reduce((s, st) => s + st.income, 0) ?? 0;
  const totalExpenses = statements?.reduce((s, st) => s + st.expenses, 0) ?? 0;
  const netOwner = statements?.reduce((s, st) => s + st.netOwnerAmount, 0) ?? 0;

  const chartData =
    statements?.map((s) => ({
      name: s.propertyName.substring(0, 12),
      Income: s.income / 100,
      Expenses: s.expenses / 100,
      Net: s.netOwnerAmount / 100,
    })) ?? [];

  const totalUnits = properties.reduce((s, p) => s + (p._count?.units ?? 0), 0);

  const PRIORITY_COLORS: Record<string, string> = {
    EMERGENCY: 'text-red-700 bg-red-50',
    HIGH: 'text-orange-700 bg-orange-50',
    NORMAL: 'text-blue-700 bg-blue-50',
    LOW: 'text-gray-600 bg-gray-100',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portfolio Overview</h1>
        <p className="text-gray-500 text-sm">
          {now.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Properties" value={properties.length} icon={Building2} color="green" />
        <StatCard label="Total Units" value={totalUnits} icon={Home} color="green" />
        <StatCard label="Monthly Income" value={formatCents(totalIncome)} icon={DollarSign} color="green" />
        <StatCard label="Net to Owner" value={formatCents(netOwner)} icon={TrendingUp} color="green" />
      </div>

      {/* ── Pending Approval Banner ───────────────────────────────────────────── */}
      {pendingApprovals.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <span className="font-semibold text-amber-900 flex items-center gap-2">
              <AlertOctagon size={16} className="text-amber-600" />
              Maintenance Approval Required ({pendingApprovals.length})
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-amber-100">
              {pendingApprovals.map((wo) => (
                <div key={wo.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{wo.title}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLORS[wo.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                          {wo.priority}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {wo.property.name}{wo.unit ? ` · Unit ${wo.unit.unitNumber}` : ''} · {formatDate(wo.createdAt)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{wo.description}</p>
                      {wo.estimatedCost != null && (
                        <p className="text-xs font-semibold text-amber-800 mt-1">
                          Estimated Cost: {formatCents(wo.estimatedCost)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => approveMutation.mutate(wo.id)}
                        disabled={approveMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
                      >
                        <CheckCircle2 size={13} /> Approve
                      </button>
                      <button
                        onClick={() => setRejectTarget(wo)}
                        className="flex items-center gap-1.5 px-3 py-2 border border-red-300 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <XCircle size={13} /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

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
                    <p className="text-xs text-gray-400">
                      {p.type} · {p._count?.units ?? 0} units
                    </p>
                  </div>
                  <StatusBadge status={p.type} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {rejectTarget && (
        <RejectModal wo={rejectTarget} onClose={() => setRejectTarget(undefined)} />
      )}
    </div>
  );
}
