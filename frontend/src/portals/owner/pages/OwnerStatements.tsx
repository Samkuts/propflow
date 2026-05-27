import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { FileText, DollarSign, TrendingUp, TrendingDown, Download, Banknote, PlusCircle, X } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/Card';
import { formatCents } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PropertyStatement {
  propertyId: string;
  propertyName: string;
  income: number;
  expenses: number;
  netOwnerAmount: number;
  units: Array<{ unitNumber: string; status: string; rentAmount?: number }>;
}

interface Disbursement {
  id: string;
  amount: number;
  status: string;
  disbursementDate: string;
  notes?: string;
  property: { id: string; name: string };
}

// ─── Component ───────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Property {
  id: string;
  name: string;
}

export default function OwnerStatements() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqPropertyId, setReqPropertyId] = useState('');
  const [reqAmount, setReqAmount] = useState('');
  const [reqNotes, setReqNotes] = useState('');
  const [reqError, setReqError] = useState('');

  const { data: statements, isLoading } = useQuery({
    queryKey: ['owner-statement', user?.sub, year, month],
    queryFn: () =>
      apiGet<PropertyStatement[]>(
        `/accounting/owner-statement/${user?.sub}?year=${year}&month=${month}`
      ),
    enabled: !!user?.sub,
  });

  const { data: disbursementsRaw } = useQuery({
    queryKey: ['owner-disbursements'],
    queryFn: () => apiGet<{ data: Disbursement[]; total: number }>('/owners/disbursements?limit=10'),
    enabled: !!user?.sub,
  });
  const disbursements: Disbursement[] = disbursementsRaw?.data ?? [];

  const { data: propertiesRaw } = useQuery({
    queryKey: ['owner-properties'],
    queryFn: () => apiGet<Property[] | { data: Property[] }>('/properties?limit=50'),
  });
  const properties: Property[] = Array.isArray(propertiesRaw)
    ? propertiesRaw
    : (propertiesRaw as { data: Property[] })?.data ?? [];

  const requestMut = useMutation({
    mutationFn: (body: { propertyId: string; amount: number; notes?: string }) =>
      apiPost<Disbursement>('/owners/me/disbursement-request', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-disbursements'] });
      setShowRequestModal(false);
      setReqPropertyId('');
      setReqAmount('');
      setReqNotes('');
      setReqError('');
    },
    onError: (err: unknown) => {
      setReqError(err instanceof Error ? err.message : 'Failed to submit request');
    },
  });

  function handleRequestSubmit() {
    setReqError('');
    const cents = Math.round(parseFloat(reqAmount) * 100);
    if (!reqPropertyId) { setReqError('Please select a property'); return; }
    if (isNaN(cents) || cents <= 0) { setReqError('Please enter a valid amount'); return; }
    requestMut.mutate({ propertyId: reqPropertyId, amount: cents, notes: reqNotes || undefined });
  }

  const stmts = statements ?? [];
  const totalIncome = stmts.reduce((s, p) => s + p.income, 0);
  const totalExpenses = stmts.reduce((s, p) => s + p.expenses, 0);
  const totalNet = stmts.reduce((s, p) => s + p.netOwnerAmount, 0);

  const chartData = stmts.map((s) => ({
    name: s.propertyName.length > 14 ? s.propertyName.slice(0, 14) + '…' : s.propertyName,
    Income: +(s.income / 100).toFixed(2),
    Expenses: +(s.expenses / 100).toFixed(2),
    'Net to You': +(s.netOwnerAmount / 100).toFixed(2),
  }));

  const exportCsv = () => {
    const rows = [
      ['Property', 'Income', 'Expenses', 'Net to Owner'],
      ...stmts.map((s) => [
        s.propertyName,
        (s.income / 100).toFixed(2),
        (s.expenses / 100).toFixed(2),
        (s.netOwnerAmount / 100).toFixed(2),
      ]),
      ['TOTAL', (totalIncome / 100).toFixed(2), (totalExpenses / 100).toFixed(2), (totalNet / 100).toFixed(2)],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statements</h1>
          <p className="text-gray-500 text-sm">Monthly income & expense summary by property</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={stmts.length === 0}
          className="flex items-center gap-1.5 text-sm text-green-700 font-medium border border-green-300 bg-green-50 hover:bg-green-100 transition-colors px-3 py-2 rounded-lg disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* ── Period Picker ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Income" value={isLoading ? '…' : formatCents(totalIncome)} icon={DollarSign} color="green" />
        <StatCard label="Total Expenses" value={isLoading ? '…' : formatCents(totalExpenses)} icon={TrendingDown} color="green" />
        <StatCard label="Net to You" value={isLoading ? '…' : formatCents(totalNet)} icon={TrendingUp} color="green" />
      </div>

      {/* ── Chart ──────────────────────────────────────────────────────── */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">
              {MONTHS[month - 1]} {year} — By Property
            </h2>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                <Bar dataKey="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="#f87171" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Net to You" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      {/* ── Property Breakdown ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Property Breakdown</h2>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : stmts.length === 0 ? (
            <div className="p-12 text-center">
              <FileText size={36} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-500 font-medium">No data for this period</p>
              <p className="text-gray-400 text-sm mt-1">Try selecting a different month</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Property</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Income</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expenses</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Net to You</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stmts.map((s) => (
                  <tr key={s.propertyId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-gray-900">{s.propertyName}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-medium">{formatCents(s.income)}</td>
                    <td className="px-4 py-3 text-right text-red-500">{formatCents(s.expenses)}</td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">{formatCents(s.netOwnerAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td className="px-6 py-3 font-bold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-green-600">{formatCents(totalIncome)}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-500">{formatCents(totalExpenses)}</td>
                  <td className="px-6 py-3 text-right font-bold text-gray-900">{formatCents(totalNet)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardBody>
      </Card>
      {/* ── Disbursements ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Banknote size={16} className="text-green-600" />
            Disbursements
          </h2>
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 transition-colors px-3 py-1.5 rounded-lg"
          >
            <PlusCircle size={14} /> Request Disbursement
          </button>
        </CardHeader>
        <CardBody className="p-0">
          {disbursements.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-400 text-sm">No disbursements recorded yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Property</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {disbursements.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-700">{formatDate(d.disbursementDate)}</td>
                    <td className="px-4 py-3 text-gray-700">{d.property.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{d.notes ?? '—'}</td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">{formatCents(d.amount)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.status === 'PROCESSED' ? 'bg-green-100 text-green-700'
                        : d.status === 'FAILED' ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
      {/* ── Request Disbursement Modal ─────────────────────────────────── */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Request Disbursement</h2>
              <button onClick={() => setShowRequestModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {reqError && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 text-sm">
                  {reqError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
                <select
                  value={reqPropertyId}
                  onChange={(e) => setReqPropertyId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select a property…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 1500.00"
                  value={reqAmount}
                  onChange={(e) => setReqAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  rows={2}
                  placeholder="Any notes for your property manager…"
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowRequestModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestSubmit}
                  disabled={requestMut.isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {requestMut.isPending ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
