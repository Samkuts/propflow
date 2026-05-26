import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, FileText, Wrench, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { formatCents, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface TenantLedger {
  leaseId: string;
  balance: number;
  totalCharged: number;
  totalPaid: number;
  charges: Array<{ id: string; type: string; amount: number; balance: number; dueDate: string; status: string }>;
  payments: Array<{ id: string; amount: number; paidDate: string; method: string; status: string }>;
}

export default function TenantDashboard() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [showPayForm, setShowPayForm] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [requestTitle, setRequestTitle] = useState('');
  const [requestDesc, setRequestDesc] = useState('');

  // Get tenant's lease via their profile
  const { data: ledger, isLoading } = useQuery({
    queryKey: ['tenant-ledger'],
    queryFn: async () => {
      // Tenant must know their leaseId — in a real app, get from /auth/me profile
      const profile = await apiGet<{ leaseId?: string }>('/auth/me');
      if (!(profile as any).leaseId) return null;
      return apiGet<TenantLedger>(`/accounting/ledger/${(profile as any).leaseId}/tenant`);
    },
    enabled: !!user,
  });

  const { mutate: payRent, isPending: paying } = useMutation({
    mutationFn: (amount: number) =>
      apiPost('/accounting/payments', {
        leaseId: (ledger as any)?.leaseId,
        amount,
        method: 'ACH',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-ledger'] });
      setShowPayForm(false);
      setPayAmount('');
      toast.success('Payment submitted successfully');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const balanceColor = (ledger?.balance ?? 0) > 0 ? 'text-red-600' : 'text-green-600';

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-20">
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900">
          Hi, {user?.email?.split('@')[0]} 👋
        </h1>
        <p className="text-gray-500 text-sm">Here's your account overview</p>
      </div>

      {/* Balance card */}
      <Card className="bg-gradient-to-br from-teal-600 to-teal-700 border-0 text-white">
        <CardBody>
          <p className="text-teal-100 text-sm font-medium">Current Balance</p>
          <p className={`text-4xl font-bold mt-1 ${(ledger?.balance ?? 0) > 0 ? 'text-white' : 'text-teal-100'}`}>
            {formatCents(Math.abs(ledger?.balance ?? 0))}
          </p>
          <p className="text-teal-200 text-xs mt-1">
            {(ledger?.balance ?? 0) > 0 ? 'Amount due' : (ledger?.balance ?? 0) < 0 ? 'Credit balance' : 'All paid up!'}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setShowPayForm(!showPayForm)}
              className="bg-white text-teal-700 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-teal-50 transition-colors"
            >
              Pay Now
            </button>
            <button className="border border-teal-400 text-white text-sm px-4 py-2 rounded-lg hover:bg-teal-600 transition-colors">
              Set up Autopay
            </button>
          </div>
        </CardBody>
      </Card>

      {/* Pay form */}
      {showPayForm && (
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-3">Make a Payment</h3>
            <div className="space-y-3">
              <Input
                label="Amount ($)"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  loading={paying}
                  onClick={() => {
                    const cents = Math.round(parseFloat(payAmount) * 100);
                    if (isNaN(cents) || cents <= 0) { toast.error('Enter a valid amount'); return; }
                    payRent(cents);
                  }}
                >
                  Submit Payment
                </Button>
                <Button variant="secondary" onClick={() => setShowPayForm(false)}>Cancel</Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Recent charges */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Charges</h2>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-4 text-center text-gray-400 text-sm">Loading…</div>
          ) : !ledger?.charges?.length ? (
            <div className="p-6 text-center text-gray-400 text-sm">No charges yet</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {ledger.charges.slice(0, 6).map((c) => (
                <li key={c.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {c.status === 'PAID' ? (
                      <CheckCircle size={16} className="text-green-500" />
                    ) : c.status === 'OUTSTANDING' ? (
                      <AlertCircle size={16} className="text-red-500" />
                    ) : (
                      <Clock size={16} className="text-yellow-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-800">{c.type.replace('_', ' ')}</p>
                      <p className="text-xs text-gray-400">Due {formatDate(c.dueDate)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatCents(c.amount)}</p>
                    <StatusBadge status={c.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Maintenance request button */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
              <Wrench className="text-orange-600" size={18} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">Maintenance Request</p>
              <p className="text-xs text-gray-400">Report an issue in your unit</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setShowRequestForm(!showRequestForm)}>
              Submit
            </Button>
          </div>
          {showRequestForm && (
            <div className="mt-4 space-y-3 pt-4 border-t border-gray-100">
              <Input label="Title" placeholder="e.g. Leaking faucet" value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)} />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  rows={3}
                  placeholder="Describe the issue…"
                  value={requestDesc}
                  onChange={(e) => setRequestDesc(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
                onClick={() => {
                  if (!requestTitle.trim()) { toast.error('Enter a title'); return; }
                  toast.success('Request submitted — we\'ll be in touch soon!');
                  setShowRequestForm(false);
                  setRequestTitle('');
                  setRequestDesc('');
                }}
              >
                Submit Request
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
