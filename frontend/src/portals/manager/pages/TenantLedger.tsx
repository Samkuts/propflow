import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  ArrowLeft, DollarSign, CreditCard, TrendingDown, ChevronDown, ChevronUp, X, Download
} from 'lucide-react';
import { apiGet, apiPost, apiDownloadBlob, getErrorMessage } from '@/lib/api';
import { Card, CardBody, CardHeader, StatCard, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { formatCents, formatDate } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaymentApplication {
  id: string;
  amount: number;
  payment?: { paidDate: string; method: string; referenceNumber?: string };
}

interface RentCharge {
  id: string;
  type: string;
  description?: string;
  amount: number;
  dueDate: string;
  status: string;
  balance: number;
  applications?: PaymentApplication[];
}

interface Payment {
  id: string;
  amount: number;
  method: string;
  status: string;
  paidDate: string;
  referenceNumber?: string;
  memo?: string;
  applications?: PaymentApplication[];
}

interface LedgerData {
  lease?: {
    id: string;
    status: string;
    startDate: string;
    endDate?: string;
    rentAmount: number;
    tenants?: { user: { firstName: string; lastName: string } }[];
    unit?: { unitNumber: string; property?: { name: string; id: string } };
  };
  charges: RentCharge[];
  payments: Payment[];
  totalCharged: number;
  totalPaid: number;
  balance: number;
}

// ─── Payment form schema ──────────────────────────────────────────────────────

const paymentSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Amount required'),
  method: z.enum(['ACH', 'CREDIT_CARD', 'CHECK', 'CASH', 'OTHER']),
  memo: z.string().optional(),
  referenceNumber: z.string().optional(),
  paidDate: z.string().min(1, 'Date required'),
});
type PaymentForm = z.infer<typeof paymentSchema>;

const methodLabels: Record<string, string> = {
  ACH: 'ACH Transfer',
  CREDIT_CARD: 'Credit Card',
  CHECK: 'Check',
  CASH: 'Cash',
  OTHER: 'Other',
};

// ─── Record Payment Slide-in ──────────────────────────────────────────────────

function RecordPaymentPanel({
  leaseId,
  balance,
  onClose,
  onSuccess,
}: {
  leaseId: string;
  balance: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: balance > 0 ? balance / 100 : 0,
      method: 'CHECK',
      paidDate: new Date().toISOString().split('T')[0],
    },
  });

  const { mutate: record, isPending } = useMutation({
    mutationFn: (body: PaymentForm) =>
      apiPost('/accounting/payments', {
        leaseId,
        amount: Math.round(body.amount * 100),
        method: body.method,
        memo: body.memo || undefined,
        referenceNumber: body.referenceNumber || undefined,
        paidDate: body.paidDate,
      }),
    onSuccess: () => {
      toast.success('Payment recorded');
      onSuccess();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900 text-lg">Record Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => record(d))} className="space-y-4">
          <Input
            label="Amount ($)"
            type="number"
            min={0}
            step="0.01"
            error={errors.amount?.message}
            {...register('amount')}
          />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Payment Method</label>
            <select
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              {...register('method')}
            >
              {Object.entries(methodLabels).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <Input
            label="Date"
            type="date"
            error={errors.paidDate?.message}
            {...register('paidDate')}
          />

          <Input
            label="Reference # (check number, transaction ID)"
            placeholder="Optional"
            {...register('referenceNumber')}
          />

          <Input
            label="Memo"
            placeholder="Optional note"
            {...register('memo')}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending} className="flex-1">
              Record Payment
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Charge Row (expandable) ──────────────────────────────────────────────────

function ChargeRow({ charge }: { charge: RentCharge }) {
  const [expanded, setExpanded] = useState(false);
  const hasApps = (charge.applications?.length ?? 0) > 0;

  return (
    <>
      <tr
        onClick={() => hasApps && setExpanded(!expanded)}
        className={`border-b border-gray-100 transition-colors ${hasApps ? 'cursor-pointer hover:bg-gray-50' : ''}`}
      >
        <td className="px-4 py-3 font-medium text-gray-900 capitalize">
          <div className="flex items-center gap-2">
            {hasApps && (
              expanded ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />
            )}
            {charge.type.replace(/_/g, ' ').toLowerCase()}
          </div>
        </td>
        <td className="px-4 py-3 text-gray-500 text-sm">{charge.description ?? '—'}</td>
        <td className="px-4 py-3 text-sm">{formatDate(charge.dueDate)}</td>
        <td className="px-4 py-3 text-sm">{formatCents(charge.amount)}</td>
        <td className="px-4 py-3 text-sm">{formatCents(charge.amount - charge.balance)}</td>
        <td className={`px-4 py-3 text-sm font-medium ${charge.balance > 0 ? 'text-red-600' : 'text-gray-500'}`}>
          {formatCents(charge.balance)}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={charge.status} />
        </td>
      </tr>
      {expanded && charge.applications?.map((app) => (
        <tr key={app.id} className="bg-indigo-50 border-b border-indigo-100">
          <td colSpan={3} className="px-8 py-2 text-xs text-indigo-600 font-medium">
            ↳ Applied from payment on {app.payment?.paidDate ? formatDate(app.payment.paidDate) : '—'}
            {app.payment?.referenceNumber ? ` (#${app.payment.referenceNumber})` : ''}
          </td>
          <td className="px-4 py-2 text-xs text-indigo-700 font-medium">{formatCents(app.amount)}</td>
          <td colSpan={3} className="px-4 py-2 text-xs text-indigo-500 capitalize">
            {app.payment?.method?.toLowerCase().replace(/_/g, ' ') ?? ''}
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TenantLedger() {
  const { leaseId } = useParams<{ leaseId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showPayment, setShowPayment] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handleDownloadPdf() {
    if (!leaseId) return;
    setPdfLoading(true);
    try {
      await apiDownloadBlob(`/leases/${leaseId}/pdf`, `lease-${leaseId.slice(0, 8)}.pdf`);
    } catch {
      toast.error('Could not generate PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  const { data: ledger, isLoading } = useQuery({
    queryKey: ['ledger', leaseId],
    queryFn: () => apiGet<LedgerData>(`/accounting/tenant-ledger/${leaseId}`),
    enabled: !!leaseId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className="text-center py-24 text-gray-400">
        Ledger not found.{' '}
        <button className="text-indigo-600 underline" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    );
  }

  const lease = ledger.lease;
  const tenantName = lease?.tenants?.map((t) => `${t.user.firstName} ${t.user.lastName}`).join(', ') ?? 'Tenant';
  const propertyId = lease?.unit?.property?.id;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{tenantName}</h1>
              {lease?.status && <StatusBadge status={lease.status} />}
            </div>
            {lease?.unit && (
              <p className="text-sm text-gray-400 mt-1">
                {lease.unit.property?.name && (
                  <Link
                    to={`/manager/properties/${propertyId}`}
                    className="hover:text-indigo-600 transition-colors"
                  >
                    {lease.unit.property.name}
                  </Link>
                )}{' '}
                · Unit {lease.unit.unitNumber}
              </p>
            )}
            {lease && (
              <p className="text-xs text-gray-400 mt-0.5">
                Lease: {formatDate(lease.startDate)} →{' '}
                {lease.endDate ? formatDate(lease.endDate) : 'Month-to-Month'}
                {lease.rentAmount != null && ` · ${formatCents(lease.rentAmount)}/mo`}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              className="flex items-center gap-2 px-3 py-2 border border-indigo-200 text-indigo-700 font-medium rounded-lg text-sm hover:bg-indigo-50 disabled:opacity-60 transition-colors"
            >
              <Download size={14} />
              {pdfLoading ? 'Generating…' : 'PDF'}
            </button>
            <Button onClick={() => setShowPayment(true)}>
              <CreditCard size={15} /> Record Payment
            </Button>
          </div>
        </div>
      </div>

      {/* ── Balance summary ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Total Charged"
          value={formatCents(ledger.totalCharged)}
          icon={TrendingDown}
          color="gray"
        />
        <StatCard
          label="Total Paid"
          value={formatCents(ledger.totalPaid)}
          icon={DollarSign}
          color="green"
        />
        <Card>
          <CardBody className="flex items-start gap-4">
            <div className={`p-2 rounded-lg ${ledger.balance > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              <DollarSign size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Balance Due</p>
              <p className={`text-2xl font-bold mt-0.5 ${ledger.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCents(ledger.balance)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {ledger.balance > 0 ? 'Outstanding' : ledger.balance < 0 ? 'Credit on account' : 'Fully paid'}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ── Charges Table ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <span className="font-semibold text-gray-900">Charges</span>
          <span className="text-xs text-gray-400">Click a charge to see payment applications</span>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {['Type', 'Description', 'Due Date', 'Amount', 'Paid', 'Balance', 'Status'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledger.charges.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No charges on this lease yet
                  </td>
                </tr>
              ) : (
                ledger.charges.map((charge) => (
                  <ChargeRow key={charge.id} charge={charge} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Payments Table ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <span className="font-semibold text-gray-900">Payments</span>
          <Button size="sm" onClick={() => setShowPayment(true)}>
            <CreditCard size={13} /> Record Payment
          </Button>
        </CardHeader>
        <Table<Payment>
          data={ledger.payments}
          emptyMessage="No payments recorded yet"
          columns={[
            {
              key: 'paidDate',
              header: 'Date',
              render: (row) => formatDate(row.paidDate),
            },
            {
              key: 'amount',
              header: 'Amount',
              render: (row) => (
                <span className="font-medium text-green-700">{formatCents(row.amount)}</span>
              ),
            },
            {
              key: 'method',
              header: 'Method',
              render: (row) => (
                <Badge variant="blue">
                  {methodLabels[row.method] ?? row.method}
                </Badge>
              ),
            },
            {
              key: 'referenceNumber',
              header: 'Reference #',
              render: (row) => row.referenceNumber ?? '—',
            },
            {
              key: 'memo',
              header: 'Memo',
              render: (row) => (
                <span className="text-gray-400 text-xs">{row.memo ?? '—'}</span>
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

      {/* ── Record Payment Panel ─────────────────────────────────────────────── */}
      {showPayment && leaseId && (
        <RecordPaymentPanel
          leaseId={leaseId}
          balance={ledger.balance}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            qc.invalidateQueries({ queryKey: ['ledger', leaseId] });
          }}
        />
      )}
    </div>
  );
}
