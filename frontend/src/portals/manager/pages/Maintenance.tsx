import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Search, Wrench, ChevronDown, X, Receipt, CheckCircle, XCircle } from 'lucide-react';
import { apiGet, apiPost, apiPatch, getErrorMessage } from '@/lib/api';
import { Card, CardHeader, CardBody, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { formatDate, formatCents } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  scheduledDate?: string;
  completedDate?: string;
  property: { name: string };
  unit?: { unitNumber: string };
  vendor?: { companyName: string; contactName: string };
  _count?: { invoices: number };
}

interface Property {
  id: string;
  name: string;
}

// ─── Create Work Order Form ───────────────────────────────────────────────────

const createSchema = z.object({
  propertyId: z.string().min(1, 'Select a property'),
  title: z.string().min(3, 'Title required'),
  description: z.string().min(10, 'Description required (min 10 chars)'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'EMERGENCY']),
});
type CreateForm = z.infer<typeof createSchema>;

// ─── Status Update Modal ──────────────────────────────────────────────────────

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  SUBMITTED: [{ value: 'APPROVED', label: 'Approve' }, { value: 'DENIED', label: 'Deny' }],
  APPROVED:  [{ value: 'ASSIGNED', label: 'Mark Assigned' }],
  ASSIGNED:  [{ value: 'IN_PROGRESS', label: 'Mark In Progress' }],
  IN_PROGRESS: [{ value: 'COMPLETED', label: 'Mark Completed' }],
  COMPLETED: [],
  INVOICED:  [],
  CLOSED:    [],
  DENIED:    [],
};

function StatusUpdateMenu({
  workOrder,
  onUpdate,
}: {
  workOrder: WorkOrder;
  onUpdate: (id: string, status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const next = NEXT_STATUS[workOrder.status] ?? [];
  if (next.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
      >
        Update <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[140px]">
            {next.map((n) => (
              <button
                key={n.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(workOrder.id, n.value);
                  setOpen(false);
                }}
                className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
              >
                {n.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Invoice Types ────────────────────────────────────────────────────────────

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Invoice {
  id: string;
  amount: number;
  status: string;
  description?: string;
  invoiceDate: string;
  dueDate?: string;
  createdAt: string;
  lineItems: InvoiceLineItem[];
  vendor: { companyName: string; contactName: string };
  workOrder: {
    id: string;
    title: string;
    status: string;
    property: { name: string };
    unit?: { unitNumber: string };
  };
}

// ─── Invoice Drawer ───────────────────────────────────────────────────────────

function InvoiceDrawer({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');

  const approveMutation = useMutation({
    mutationFn: () => apiPost(`/maintenance/invoices/${invoice.id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice approved — work order closed');
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const rejectMutation = useMutation({
    mutationFn: () => apiPost(`/maintenance/invoices/${invoice.id}/reject`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice rejected');
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const isPending = invoice.status === 'SUBMITTED';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">Invoice Review</h2>
            <p className="text-sm text-gray-500 mt-0.5">{invoice.workOrder.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Vendor</p>
              <p className="font-medium text-gray-900">{invoice.vendor.companyName}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Property</p>
              <p className="font-medium text-gray-900">
                {invoice.workOrder.property.name}
                {invoice.workOrder.unit && ` · Unit ${invoice.workOrder.unit.unitNumber}`}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Invoice Date</p>
              <p className="text-gray-900">{formatDate(invoice.invoiceDate)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Status</p>
              <StatusBadge status={invoice.status} />
            </div>
          </div>

          {/* Line Items */}
          {invoice.lineItems.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Line Items</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Description</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Qty</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Unit Price</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoice.lineItems.map((li) => (
                      <tr key={li.id}>
                        <td className="px-3 py-2 text-gray-700">{li.description}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{li.quantity}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{formatCents(li.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCents(li.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-gray-700 text-right">Total</td>
                      <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCents(invoice.amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Total (no line items) */}
          {invoice.lineItems.length === 0 && (
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
              <span className="text-sm font-medium text-gray-700">Total Amount</span>
              <span className="font-bold text-gray-900">{formatCents(invoice.amount)}</span>
            </div>
          )}

          {/* Notes (for reject) */}
          {isPending && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rejection notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for rejection…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        {isPending && (
          <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white font-medium rounded-lg text-sm hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              <CheckCircle size={15} />
              {approveMutation.isPending ? 'Approving…' : 'Approve & Close Work Order'}
            </button>
            <button
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-red-300 text-red-600 font-medium rounded-lg text-sm hover:bg-red-50 disabled:opacity-60 transition-colors"
            >
              <XCircle size={15} />
              {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Invoices Tab ─────────────────────────────────────────────────────────────

function InvoicesTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: () =>
      apiGet<{ invoices: Invoice[]; total: number }>(
        `/maintenance/invoices?${statusFilter ? `status=${statusFilter}&` : ''}limit=100`
      ),
  });
  const invoices: Invoice[] = raw?.invoices ?? [];
  const total = raw?.total ?? invoices.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} invoice{total !== 1 ? 's' : ''}</p>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          {['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <Card>
        <Table<Invoice>
          loading={isLoading}
          data={invoices}
          emptyMessage="No invoices yet"
          onRowClick={(row) => setSelectedInvoice(row)}
          columns={[
            {
              key: 'vendor',
              header: 'Vendor',
              render: (row) => (
                <div>
                  <p className="font-medium text-gray-900">{row.vendor.companyName}</p>
                  <p className="text-xs text-gray-400">{row.vendor.contactName}</p>
                </div>
              ),
            },
            {
              key: 'workOrder',
              header: 'Work Order',
              render: (row) => (
                <div>
                  <p className="text-sm text-gray-700">{row.workOrder.title}</p>
                  <p className="text-xs text-gray-400">
                    {row.workOrder.property.name}
                    {row.workOrder.unit && ` · Unit ${row.workOrder.unit.unitNumber}`}
                  </p>
                </div>
              ),
            },
            {
              key: 'amount',
              header: 'Amount',
              render: (row) => (
                <span className="font-semibold text-gray-900">{formatCents(row.amount)}</span>
              ),
            },
            {
              key: 'invoiceDate',
              header: 'Date',
              render: (row) => formatDate(row.invoiceDate),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge status={row.status} />,
            },
          ]}
        />
      </Card>

      {selectedInvoice && (
        <InvoiceDrawer invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Maintenance() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'work-orders' | 'invoices'>('work-orders');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Work orders
  const { data: raw, isLoading } = useQuery({
    queryKey: ['workorders', statusFilter, priorityFilter],
    queryFn: () =>
      apiGet<{ workOrders: WorkOrder[]; total: number }>(
        `/maintenance/work-orders?${statusFilter ? `status=${statusFilter}&` : ''}${priorityFilter ? `priority=${priorityFilter}&` : ''}limit=100`
      ),
  });
  const workOrders: WorkOrder[] = raw?.workOrders ?? (Array.isArray(raw) ? (raw as WorkOrder[]) : []);
  const total = raw?.total ?? workOrders.length;

  // Properties for the create form
  const { data: propsRaw } = useQuery({
    queryKey: ['properties'],
    queryFn: () => apiGet<Property[] | { data: Property[] }>('/properties'),
    enabled: showForm,
  });
  const properties: Property[] = Array.isArray(propsRaw)
    ? propsRaw
    : (propsRaw as { data: Property[] })?.data ?? [];

  // Create work order
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { priority: 'NORMAL' },
  });

  const { mutate: createWO, isPending: creating } = useMutation({
    mutationFn: (body: CreateForm) => apiPost('/maintenance/work-orders', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workorders'] });
      setShowForm(false);
      reset();
      toast.success('Work order created');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Update status
  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch(`/maintenance/work-orders/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workorders'] });
      toast.success('Status updated');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Filtered locally for search
  const filtered = search
    ? workOrders.filter(
        (wo) =>
          wo.title.toLowerCase().includes(search.toLowerCase()) ||
          wo.property.name.toLowerCase().includes(search.toLowerCase())
      )
    : workOrders;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
        </div>
        {tab === 'work-orders' && (
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus size={15} /> New Work Order
          </Button>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('work-orders')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'work-orders' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <Wrench size={14} /> Work Orders
        </button>
        <button
          onClick={() => setTab('invoices')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'invoices' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <Receipt size={14} /> Invoices
        </button>
      </div>

      {/* ── Invoices Tab ───────────────────────────────────────────────────── */}
      {tab === 'invoices' && <InvoicesTab />}

      {tab === 'work-orders' && (<>

      {/* ── Create Form ────────────────────────────────────────────────────── */}
      {showForm && (
        <Card>
          <CardHeader>
            <span className="font-semibold text-gray-900">New Work Order</span>
            <button onClick={() => { setShowForm(false); reset(); }} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit((d) => createWO(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Property</label>
                  <select
                    className={`block w-full rounded-lg border px-3 py-2 text-sm ${errors.propertyId ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                    {...register('propertyId')}
                  >
                    <option value="">Select property…</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {errors.propertyId && <p className="text-xs text-red-600">{errors.propertyId.message}</p>}
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Priority</label>
                  <select
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    {...register('priority')}
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="EMERGENCY">Emergency</option>
                  </select>
                </div>
              </div>
              <Input
                label="Title"
                placeholder="e.g. Leaking faucet in Unit 101 kitchen"
                error={errors.title?.message}
                {...register('title')}
              />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe the issue in detail…"
                  className={`block w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.description ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                  {...register('description')}
                />
                {errors.description && <p className="text-xs text-red-600">{errors.description.message}</p>}
              </div>
              <div className="flex gap-3">
                <Button type="submit" loading={creating}>Create Work Order</Button>
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search title or property…"
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
          <option value="">All Statuses</option>
          {['SUBMITTED','APPROVED','ASSIGNED','IN_PROGRESS','COMPLETED','INVOICED','CLOSED','DENIED'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Priorities</option>
          {['EMERGENCY','HIGH','NORMAL','LOW'].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <Card>
        <Table<WorkOrder>
          loading={isLoading}
          data={filtered}
          emptyMessage="No work orders found"
          columns={[
            {
              key: 'priority',
              header: 'Priority',
              render: (row) => <StatusBadge status={row.priority} />,
            },
            {
              key: 'title',
              header: 'Work Order',
              render: (row) => (
                <div>
                  <p className="font-medium text-gray-900">{row.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{row.description}</p>
                </div>
              ),
            },
            {
              key: 'location',
              header: 'Location',
              render: (row) => (
                <div>
                  <p className="text-sm text-gray-700">{row.property.name}</p>
                  {row.unit && <p className="text-xs text-gray-400">Unit {row.unit.unitNumber}</p>}
                </div>
              ),
            },
            {
              key: 'vendor',
              header: 'Vendor',
              render: (row) => row.vendor
                ? <span className="text-sm text-gray-700">{row.vendor.companyName}</span>
                : <span className="text-gray-400 text-sm">—</span>,
            },
            {
              key: 'createdAt',
              header: 'Submitted',
              render: (row) => formatDate(row.createdAt),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <div className="flex items-center gap-3">
                  <StatusBadge status={row.status} />
                  <StatusUpdateMenu
                    workOrder={row}
                    onUpdate={(id, status) => updateStatus({ id, status })}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
      </>)}
    </div>
  );
}
