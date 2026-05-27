import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Wrench, ChevronDown, FileText } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { apiGet, apiPatch, getErrorMessage } from '@/lib/api';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDate, formatCents } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  scheduledDate: string | null;
  property: { name: string; address: string };
  unit: { unitNumber: string } | null;
  invoices: { id: string; status: string; amount: number }[];
}

// ─── Status action map ────────────────────────────────────────────────────────

const VENDOR_NEXT: Record<string, { value: string; label: string; color: string }> = {
  ASSIGNED: { value: 'IN_PROGRESS', label: 'Start Work', color: 'bg-blue-600 hover:bg-blue-700' },
  IN_PROGRESS: { value: 'COMPLETED', label: 'Mark Complete', color: 'bg-green-600 hover:bg-green-700' },
};

// ─── Invoice Form ─────────────────────────────────────────────────────────────

function InvoicePanel({
  workOrderId,
  onClose,
}: {
  workOrderId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiPatch(`/maintenance/invoices`, {
        workOrderId,
        amount: Math.round(parseFloat(amount) * 100),
        description,
        invoiceDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-work-orders'] });
      toast.success('Invoice submitted');
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
      <p className="text-sm font-semibold text-gray-800">Submit Invoice</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Amount ($)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Invoice Date</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">Description (optional)</label>
        <textarea
          rows={2}
          placeholder="Work performed, materials used…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={isPending || !amount}
          onClick={() => {
            if (!amount || parseFloat(amount) <= 0) { toast.error('Enter a valid amount'); return; }
            mutate();
          }}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Submitting…' : 'Submit Invoice'}
        </button>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VendorWorkOrders() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showInvoiceFor, setShowInvoiceFor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: workOrders, isLoading } = useQuery({
    queryKey: ['vendor-work-orders', user?.sub],
    queryFn: () => apiGet<WorkOrder[]>(`/maintenance/vendor/${user?.sub}/work-orders`),
    enabled: !!user?.sub,
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch(`/maintenance/work-orders/${id}/vendor-action`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-work-orders'] });
      toast.success('Status updated');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const filtered = statusFilter
    ? (workOrders ?? []).filter((wo) => wo.status === statusFilter)
    : (workOrders ?? []);

  const open = (workOrders ?? []).filter((wo) => !['COMPLETED', 'INVOICED', 'CLOSED', 'DENIED'].includes(wo.status)).length;

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Orders</h1>
          <p className="text-gray-500 text-sm">
            {workOrders?.length ?? 0} total · {open} open
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="">All Statuses</option>
          {['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'CLOSED'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* ── List ───────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardBody>
                <div className="h-20 bg-gray-100 animate-pulse rounded" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Wrench size={48} className="mx-auto text-gray-200 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No work orders</h3>
          <p className="text-gray-400 text-sm mt-1">
            {statusFilter ? 'Try changing the filter' : "You'll see jobs here once assigned by a manager"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((wo) => {
            const nextAction = VENDOR_NEXT[wo.status];
            const isExpanded = expandedId === wo.id;

            return (
              <Card key={wo.id}>
                <CardBody>
                  {/* ── Top row ─────────────────────────────────────── */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <StatusBadge status={wo.priority} />
                        <StatusBadge status={wo.status} />
                      </div>
                      <h3 className="font-semibold text-gray-900">{wo.title}</h3>
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : wo.id)}
                      className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
                    >
                      <ChevronDown
                        size={18}
                        className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>

                  {/* ── Action buttons ──────────────────────────────── */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {nextAction && (
                      <button
                        onClick={() => updateStatus({ id: wo.id, status: nextAction.value })}
                        className={`text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-colors ${nextAction.color}`}
                      >
                        {nextAction.label}
                      </button>
                    )}
                    {wo.status === 'COMPLETED' && wo.invoices.length === 0 && (
                      <button
                        onClick={() => setShowInvoiceFor(showInvoiceFor === wo.id ? null : wo.id)}
                        className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                      >
                        <FileText size={12} /> Submit Invoice
                      </button>
                    )}
                    {wo.invoices.length > 0 && (
                      <span className="text-xs text-gray-500">
                        Invoice: <StatusBadge status={wo.invoices[0].status} /> {formatCents(wo.invoices[0].amount)}
                      </span>
                    )}
                  </div>

                  {/* ── Expanded details ────────────────────────────── */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-sm text-gray-600">
                      <p>{wo.description}</p>
                      <div className="text-xs text-gray-400 space-y-0.5 mt-2">
                        <p className="font-medium text-gray-600">{wo.property.name}{wo.unit ? ` · Unit ${wo.unit.unitNumber}` : ''}</p>
                        <p>{wo.property.address}</p>
                        <p>Submitted {formatDate(wo.createdAt)}</p>
                        {wo.scheduledDate && (
                          <p className="text-amber-600 font-medium">Scheduled {formatDate(wo.scheduledDate)}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Invoice form ────────────────────────────────── */}
                  {showInvoiceFor === wo.id && (
                    <InvoicePanel
                      workOrderId={wo.id}
                      onClose={() => setShowInvoiceFor(null)}
                    />
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
