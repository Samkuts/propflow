import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, RefreshCw, XCircle, FileText, User, Building2, DollarSign, X, Download,
  Plus, Repeat, Trash2, ClipboardList, CheckSquare, PenLine
} from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiDelete, apiDownloadBlob, getErrorMessage } from '@/lib/api';
import { Card, CardHeader, CardBody, Skeleton } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCents, formatDate } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lease {
  id: string;
  status: string;
  startDate: string;
  endDate?: string;
  rentAmount: number;
  depositAmount: number;
  depositReturned: boolean;
  depositReturnedDate?: string;
  rentDueDay: number;
  gracePeriodDays: number;
  lateFeeType: string;
  lateFeeAmount: number;
  petsAllowed: boolean;
  unit: {
    id: string;
    unitNumber: string;
    property: { id: string; name: string; address: string };
  };
  tenants: Array<{
    id: string;
    user: { firstName: string; lastName: string; email: string; phone?: string };
  }>;
  rentCharges: Array<{ id: string; type: string; amount: number; balance: number; dueDate: string; status: string }>;
  payments: Array<{ id: string; amount: number; createdAt: string; method: string; status: string }>;
}

interface RecurringCharge {
  id: string;
  type: string;
  amount: number;
  description?: string;
  dayOfMonth: number;
  startDate: string;
  endDate?: string;
  active: boolean;
}

interface InspectionItem {
  room: string;
  condition: string;
  notes?: string;
}

interface Inspection {
  id: string;
  type: string;
  conductedAt: string;
  overallCondition: string;
  notes?: string;
  items: InspectionItem[];
  signedByTenant: boolean;
  signedAt?: string;
  tenantSignature?: string;
}

const CHARGE_TYPE_LABELS: Record<string, string> = {
  PET_FEE: 'Pet Fee',
  PARKING: 'Parking',
  UTILITY: 'Utility',
  OTHER: 'Other',
};

const CONDITION_COLORS: Record<string, string> = {
  EXCELLENT: 'text-green-700 bg-green-50',
  GOOD: 'text-blue-700 bg-blue-50',
  FAIR: 'text-yellow-700 bg-yellow-50',
  POOR: 'text-red-700 bg-red-50',
};

// ─── Recurring Charge Modal ───────────────────────────────────────────────────

function RecurringChargeModal({
  leaseId,
  existing,
  onClose,
}: {
  leaseId: string;
  existing?: RecurringCharge;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState(existing?.type ?? 'PARKING');
  const [amount, setAmount] = useState(String(existing?.amount ?? ''));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [dayOfMonth, setDayOfMonth] = useState(String(existing?.dayOfMonth ?? 1));
  const [startDate, setStartDate] = useState(existing?.startDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(existing?.endDate?.slice(0, 10) ?? '');

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        type,
        amount: parseInt(amount, 10),
        description: description || undefined,
        dayOfMonth: parseInt(dayOfMonth, 10),
        startDate,
        endDate: endDate || undefined,
      };
      if (existing) return apiPatch(`/leases/${leaseId}/recurring-charges/${existing.id}`, body);
      return apiPost(`/leases/${leaseId}/recurring-charges`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-charges', leaseId] });
      toast.success(existing ? 'Charge updated' : 'Recurring charge added');
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{existing ? 'Edit' : 'Add'} Recurring Charge</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Charge Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {Object.entries(CHARGE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (cents)</label>
            <input
              type="number" min={1} value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 7500 = $75.00"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              type="text" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Covered Parking Spot 12"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Day</label>
              <input
                type="number" min={1} max={28} value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input
                type="date" value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End (opt.)</label>
              <input
                type="date" value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !amount || !dayOfMonth}
            className="flex-1 py-2.5 bg-indigo-600 text-white font-medium rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {saveMutation.isPending ? 'Saving…' : existing ? 'Save Changes' : 'Add Charge'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inspection Modal ─────────────────────────────────────────────────────────

const DEFAULT_ROOMS = ['Living Room', 'Kitchen', 'Bathroom', 'Bedroom 1', 'Bedroom 2', 'Hallway', 'Exterior'];

function InspectionModal({ leaseId, onClose }: { leaseId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState('MOVE_IN');
  const [conductedAt, setConductedAt] = useState(new Date().toISOString().slice(0, 16));
  const [overallCondition, setOverallCondition] = useState('GOOD');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InspectionItem[]>(
    DEFAULT_ROOMS.map((room) => ({ room, condition: 'GOOD', notes: '' }))
  );

  const updateItem = (i: number, field: keyof InspectionItem, value: string) => {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPost(`/leases/${leaseId}/inspections`, {
        type,
        conductedAt: new Date(conductedAt).toISOString(),
        overallCondition,
        notes: notes || undefined,
        items: items.filter((it) => it.room),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspections', leaseId] });
      toast.success('Inspection report created');
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">New Inspection Report</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="MOVE_IN">Move-In</option>
                <option value="MOVE_OUT">Move-Out</option>
                <option value="ROUTINE">Routine</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date &amp; Time</label>
              <input type="datetime-local" value={conductedAt} onChange={(e) => setConductedAt(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Overall</label>
              <select value={overallCondition} onChange={(e) => setOverallCondition(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="EXCELLENT">Excellent</option>
                <option value="GOOD">Good</option>
                <option value="FAIR">Fair</option>
                <option value="POOR">Poor</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">General Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Any overall observations…"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Room-by-Room Checklist</p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 items-center text-sm">
                  <input value={item.room} onChange={(e) => updateItem(i, 'room', e.target.value)}
                    className="col-span-2 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  <select value={item.condition} onChange={(e) => updateItem(i, 'condition', e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
                    <option value="EXCELLENT">Excellent</option>
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                    <option value="POOR">Poor</option>
                  </select>
                  <input value={item.notes ?? ''} onChange={(e) => updateItem(i, 'notes', e.target.value)}
                    placeholder="Notes…"
                    className="col-span-2 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                </div>
              ))}
            </div>
            <button
              onClick={() => setItems((prev) => [...prev, { room: '', condition: 'GOOD', notes: '' }])}
              className="mt-2 text-sm text-indigo-600 hover:underline flex items-center gap-1"
            >
              <Plus size={13} /> Add room
            </button>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex-1 py-2.5 bg-indigo-600 text-white font-medium rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Inspection'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Renew Modal ──────────────────────────────────────────────────────────────

function RenewModal({ lease, onClose }: { lease: Lease; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Default new end date: 1 year from current end or today
  const defaultEnd = lease.endDate
    ? new Date(new Date(lease.endDate).getTime() + 365 * 86_400_000).toISOString().split('T')[0]
    : new Date(Date.now() + 365 * 86_400_000).toISOString().split('T')[0];

  const [newEndDate, setNewEndDate] = useState(defaultEnd);
  const [newRent, setNewRent] = useState(String(lease.rentAmount));

  const renewMutation = useMutation({
    mutationFn: () =>
      apiPost(`/leases/${lease.id}/renew`, {
        newEndDate,
        newRentAmount: parseInt(newRent, 10),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lease', lease.id] });
      qc.invalidateQueries({ queryKey: ['leases'] });
      toast.success('Lease renewed successfully');
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">Renew Lease</h2>
            <p className="text-sm text-gray-500">Unit {lease.unit.unitNumber} · {lease.unit.property.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New end date</label>
            <input
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monthly rent (cents)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">¢</span>
              <input
                type="number"
                value={newRent}
                onChange={(e) => setNewRent(e.target.value)}
                min={1}
                className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Current: {formatCents(lease.rentAmount)}/mo → New: {formatCents(parseInt(newRent) || 0)}/mo
            </p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={() => renewMutation.mutate()}
            disabled={renewMutation.isPending || !newEndDate}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white font-medium rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            <RefreshCw size={14} />
            {renewMutation.isPending ? 'Renewing…' : 'Confirm Renewal'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Terminate Modal ──────────────────────────────────────────────────────────

function TerminateModal({ lease, onClose }: { lease: Lease; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [moveOutDate, setMoveOutDate] = useState(new Date().toISOString().split('T')[0]);
  const [depositReturn, setDepositReturn] = useState('0');
  const [confirm, setConfirm] = useState('');

  const terminateMutation = useMutation({
    mutationFn: () =>
      apiPost(`/leases/${lease.id}/terminate`, {
        moveOutDate,
        depositReturnAmount: parseInt(depositReturn, 10) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lease', lease.id] });
      qc.invalidateQueries({ queryKey: ['leases'] });
      toast.success('Lease terminated — unit marked vacant');
      onClose();
      navigate('/manager/leases');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const canSubmit = confirm.toLowerCase() === 'terminate';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900 text-red-700">Terminate Lease</h2>
            <p className="text-sm text-gray-500">Unit {lease.unit.unitNumber} · {lease.unit.property.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            ⚠️ This will terminate the lease and mark the unit as <strong>VACANT</strong>. This action cannot be undone.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Move-out date</label>
            <input
              type="date"
              value={moveOutDate}
              onChange={(e) => setMoveOutDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deposit return amount (cents)
            </label>
            <input
              type="number"
              value={depositReturn}
              onChange={(e) => setDepositReturn(e.target.value)}
              min={0}
              max={lease.depositAmount}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Original deposit: {formatCents(lease.depositAmount)}. Enter 0 to forfeit.
              A reversal journal entry will be posted automatically.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type <strong>terminate</strong> to confirm
            </label>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="terminate"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={() => terminateMutation.mutate()}
            disabled={terminateMutation.isPending || !canSubmit}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white font-medium rounded-lg text-sm hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            <XCircle size={14} />
            {terminateMutation.isPending ? 'Terminating…' : 'Terminate Lease'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeaseDetail() {
  const { leaseId } = useParams<{ leaseId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showRenew, setShowRenew] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [editCharge, setEditCharge] = useState<RecurringCharge | undefined>();
  const [showInspection, setShowInspection] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: recurringCharges = [] } = useQuery({
    queryKey: ['recurring-charges', leaseId],
    queryFn: () => apiGet<RecurringCharge[]>(`/leases/${leaseId}/recurring-charges`),
    enabled: !!leaseId,
  });

  const { data: inspections = [] } = useQuery({
    queryKey: ['inspections', leaseId],
    queryFn: () => apiGet<Inspection[]>(`/leases/${leaseId}/inspections`),
    enabled: !!leaseId,
  });

  const deleteChargeMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/leases/${leaseId}/recurring-charges/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-charges', leaseId] }); toast.success('Charge removed'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  async function handleDownloadPdf() {
    if (!lease) return;
    setPdfLoading(true);
    try {
      await apiDownloadBlob(`/leases/${lease.id}/pdf`, `lease-${lease.id.slice(0, 8)}.pdf`);
    } catch {
      toast.error('Could not generate PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  const { data: lease, isLoading } = useQuery({
    queryKey: ['lease', leaseId],
    queryFn: () => apiGet<Lease>(`/leases/${leaseId}`),
    enabled: !!leaseId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="text-center py-24">
        <p className="text-gray-500">Lease not found.</p>
        <button onClick={() => navigate('/manager/leases')} className="mt-4 text-indigo-600 text-sm hover:underline">
          Back to leases
        </button>
      </div>
    );
  }

  const canRenew = ['ACTIVE', 'MONTH_TO_MONTH'].includes(lease.status);
  const canTerminate = ['ACTIVE', 'MONTH_TO_MONTH'].includes(lease.status);
  const daysLeft = lease.endDate
    ? Math.ceil((new Date(lease.endDate).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate('/manager/leases')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            <ArrowLeft size={14} /> Back to Leases
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            Unit {lease.unit.unitNumber} · {lease.unit.property.name}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={lease.status} />
            {daysLeft !== null && daysLeft >= 0 && daysLeft <= 60 && canRenew && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                {daysLeft === 0 ? 'Expires today' : `Expires in ${daysLeft} days`}
              </span>
            )}
          </div>
        </div>
        {(canRenew || canTerminate) && (
          <div className="flex gap-2">
            {canRenew && (
              <button
                onClick={() => setShowRenew(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg text-sm hover:bg-indigo-700 transition-colors"
              >
                <RefreshCw size={14} /> Renew
              </button>
            )}
            {canTerminate && (
              <button
                onClick={() => setShowTerminate(true)}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 font-medium rounded-lg text-sm hover:bg-red-50 transition-colors"
              >
                <XCircle size={14} /> Terminate
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Details Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Lease Terms */}
        <Card className="md:col-span-2">
          <CardHeader><span className="font-semibold text-gray-900 flex items-center gap-2"><FileText size={15} /> Lease Terms</span></CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-400">Start Date</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{formatDate(lease.startDate)}</dd>
              </div>
              <div>
                <dt className="text-gray-400">End Date</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{lease.endDate ? formatDate(lease.endDate) : 'Month-to-Month'}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Monthly Rent</dt>
                <dd className="font-semibold text-gray-900 mt-0.5">{formatCents(lease.rentAmount)}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Security Deposit</dt>
                <dd className="font-medium text-gray-900 mt-0.5">
                  {formatCents(lease.depositAmount)}
                  {lease.depositReturned && <span className="ml-2 text-green-600 text-xs">Returned</span>}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Rent Due Day</dt>
                <dd className="font-medium text-gray-900 mt-0.5">Day {lease.rentDueDay}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Grace Period</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{lease.gracePeriodDays} days</dd>
              </div>
              <div>
                <dt className="text-gray-400">Late Fee</dt>
                <dd className="font-medium text-gray-900 mt-0.5">
                  {lease.lateFeeType === 'FLAT'
                    ? formatCents(lease.lateFeeAmount)
                    : `${(lease.lateFeeAmount / 100).toFixed(1)}%`}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Pets</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{lease.petsAllowed ? 'Allowed' : 'Not allowed'}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        {/* Tenants */}
        <Card>
          <CardHeader><span className="font-semibold text-gray-900 flex items-center gap-2"><User size={15} /> Tenants</span></CardHeader>
          <CardBody>
            {lease.tenants.length === 0 ? (
              <p className="text-gray-400 text-sm">No tenants assigned</p>
            ) : (
              <div className="space-y-3">
                {lease.tenants.map((t) => (
                  <div key={t.id}>
                    <p className="font-medium text-gray-900 text-sm">{t.user.firstName} {t.user.lastName}</p>
                    <p className="text-gray-400 text-xs">{t.user.email}</p>
                    {t.user.phone && <p className="text-gray-400 text-xs">{t.user.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Quick Links ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Link
          to={`/manager/leases/${lease.id}/ledger`}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          <DollarSign size={14} /> View Ledger
        </Link>
        <Link
          to={`/manager/properties/${lease.unit.property.id}`}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          <Building2 size={14} /> View Property
        </Link>
        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-indigo-200 text-indigo-700 font-medium rounded-lg text-sm hover:bg-indigo-50 disabled:opacity-60 transition-colors"
        >
          <Download size={14} />
          {pdfLoading ? 'Generating…' : 'Download Lease PDF'}
        </button>
      </div>

      {/* ── Recent Charges ──────────────────────────────────────────────────── */}
      {lease.rentCharges.length > 0 && (
        <Card>
          <CardHeader>
            <span className="font-semibold text-gray-900">Recent Charges</span>
            <Link to={`/manager/leases/${lease.id}/ledger`} className="text-sm text-indigo-600 hover:underline">
              Full ledger →
            </Link>
          </CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-xs font-medium text-gray-400">Due Date</th>
                  <th className="text-left pb-2 text-xs font-medium text-gray-400">Type</th>
                  <th className="text-right pb-2 text-xs font-medium text-gray-400">Amount</th>
                  <th className="text-right pb-2 text-xs font-medium text-gray-400">Balance</th>
                  <th className="text-right pb-2 text-xs font-medium text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lease.rentCharges.slice(0, 5).map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 text-gray-700">{formatDate(c.dueDate)}</td>
                    <td className="py-2 text-gray-500">{c.type}</td>
                    <td className="py-2 text-right text-gray-700">{formatCents(c.amount)}</td>
                    <td className={`py-2 text-right font-medium ${c.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {formatCents(c.balance)}
                    </td>
                    <td className="py-2 text-right">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* ── Recurring Charges ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <span className="font-semibold text-gray-900 flex items-center gap-2">
            <Repeat size={15} /> Recurring Charges
          </span>
          <button
            onClick={() => setShowAddCharge(true)}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <Plus size={14} /> Add
          </button>
        </CardHeader>
        <CardBody className={recurringCharges.length === 0 ? undefined : 'p-0'}>
          {recurringCharges.length === 0 ? (
            <p className="text-gray-400 text-sm">No recurring charges — parking, pet fees, storage, etc. will appear here.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Type</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Description</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-400">Due Day</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Amount</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-400">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recurringCharges.map((rc) => (
                  <tr key={rc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{CHARGE_TYPE_LABELS[rc.type] ?? rc.type}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{rc.description ?? '—'}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">Day {rc.dayOfMonth}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">{formatCents(rc.amount)}/mo</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${rc.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {rc.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setEditCharge(rc)} className="text-gray-400 hover:text-indigo-600"><PenLine size={13} /></button>
                        <button
                          onClick={() => { if (confirm('Remove this recurring charge?')) deleteChargeMutation.mutate(rc.id); }}
                          className="text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* ── Inspection Reports ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <span className="font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList size={15} /> Inspection Reports
          </span>
          <button
            onClick={() => setShowInspection(true)}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <Plus size={14} /> New Inspection
          </button>
        </CardHeader>
        <CardBody className={inspections.length === 0 ? undefined : 'p-0'}>
          {inspections.length === 0 ? (
            <p className="text-gray-400 text-sm">No inspections yet. Create a move-in report to get started.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Type</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Date</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Overall</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Rooms</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-400">Signed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {inspections.map((insp) => (
                  <tr key={insp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      {insp.type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDate(insp.conductedAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${CONDITION_COLORS[insp.overallCondition] ?? 'bg-gray-100 text-gray-600'}`}>
                        {insp.overallCondition}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{Array.isArray(insp.items) ? insp.items.length : 0} rooms</td>
                    <td className="px-4 py-2.5 text-center">
                      {insp.signedByTenant
                        ? <CheckSquare size={15} className="text-green-500 mx-auto" />
                        : <span className="text-xs text-gray-400">Pending</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showRenew && <RenewModal lease={lease} onClose={() => setShowRenew(false)} />}
      {showTerminate && <TerminateModal lease={lease} onClose={() => setShowTerminate(false)} />}
      {(showAddCharge || editCharge) && (
        <RecurringChargeModal
          leaseId={lease.id}
          existing={editCharge}
          onClose={() => { setShowAddCharge(false); setEditCharge(undefined); }}
        />
      )}
      {showInspection && (
        <InspectionModal leaseId={lease.id} onClose={() => setShowInspection(false)} />
      )}
    </div>
  );
}
