import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClipboardList, X, ChevronDown, Check, Ban, Eye, Building2, User, FileSignature, ShieldCheck, Loader2 } from 'lucide-react';
import { apiGet, apiPatch, apiPost, getErrorMessage } from '@/lib/api';
import { Card, CardBody, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { formatDate, formatCents } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppStatus = 'RECEIVED' | 'REVIEWING' | 'SCREENING' | 'APPROVED' | 'DENIED' | 'WITHDRAWN';

interface Application {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  employer?: string;
  monthlyIncome?: number;
  message?: string;
  status: AppStatus;
  notes?: string;
  screeningReportId?: string | null;
  createdAt: string;
  unitId: string;
  unit?: {
    id: string;
    unitNumber: string;
    property: { id: string; name: string };
  };
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────

function ApplicationDrawer({
  app,
  onClose,
}: {
  app: Application;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [notes, setNotes] = useState(app.notes ?? '');

  const updateMut = useMutation({
    mutationFn: (data: { status?: AppStatus; notes?: string }) =>
      apiPatch(`/api/v1/applications/${app.id}`, data),
    onSuccess: (_, vars) => {
      if (vars.status) toast.success(`Application ${vars.status.toLowerCase()}`);
      else toast.success('Notes saved');
      qc.invalidateQueries({ queryKey: ['applications'] });
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const screeningMut = useMutation({
    mutationFn: () =>
      apiPost<{ invitationUrl: string; candidateId: string }>(
        `/api/v1/applications/${app.id}/submit-for-screening`,
      ),
    onSuccess: (data) => {
      toast.success('Background check initiated. Invitation sent to applicant.');
      qc.invalidateQueries({ queryKey: ['applications'] });
      // Open invitation URL in new tab so manager can share it
      if (data.invitationUrl) window.open(data.invitationUrl, '_blank', 'noopener');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const ACTION_BUTTONS: { status: AppStatus; label: string; icon: React.ReactNode; style: string }[] = [
    { status: 'REVIEWING', label: 'Mark Reviewing', icon: <Eye size={14} />, style: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200' },
    { status: 'APPROVED', label: 'Approve', icon: <Check size={14} />, style: 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200' },
    { status: 'DENIED', label: 'Deny', icon: <Ban size={14} />, style: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200' },
  ];

  const availableActions = ACTION_BUTTONS.filter((a) => a.status !== app.status);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md shadow-2xl flex flex-col h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-gray-900">{app.firstName} {app.lastName}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Submitted {formatDate(app.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={app.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {/* Unit info */}
          {app.unit && (
            <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
              <Building2 size={18} className="text-indigo-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Unit {app.unit.unitNumber} — {app.unit.property.name}
                </p>
                <p className="text-xs text-gray-500">Applied unit</p>
              </div>
            </div>
          )}

          {/* Applicant info */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <User size={12} />
              Applicant
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoItem label="Full Name" value={`${app.firstName} ${app.lastName}`} />
              <InfoItem label="Email" value={app.email} />
              {app.phone && <InfoItem label="Phone" value={app.phone} />}
              {app.employer && <InfoItem label="Employer" value={app.employer} />}
              {app.monthlyIncome != null && (
                <InfoItem label="Monthly Income" value={formatCents(app.monthlyIncome)} />
              )}
            </div>
          </section>

          {/* Background Check */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <ShieldCheck size={12} />
              Background Check
            </h3>
            {app.screeningReportId ? (
              // Already screened
              <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
                app.status === 'SCREENING'
                  ? 'bg-amber-50 border border-amber-200 text-amber-700'
                  : 'bg-green-50 border border-green-200 text-green-700'
              }`}>
                {app.status === 'SCREENING' ? (
                  <><Loader2 size={14} className="animate-spin shrink-0" /> Screening in progress…</>
                ) : (
                  <><ShieldCheck size={14} className="shrink-0" /> Background check submitted</>
                )}
              </div>
            ) : (app.status === 'RECEIVED' || app.status === 'REVIEWING') ? (
              // Not yet screened — show button
              <div className="space-y-2">
                <button
                  onClick={() => screeningMut.mutate()}
                  disabled={screeningMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {screeningMut.isPending
                    ? <Loader2 size={14} className="animate-spin" />
                    : <ShieldCheck size={14} />}
                  Run Background Check
                </button>
                <p className="text-xs text-gray-400">
                  Uses Checkr. The applicant will receive an invitation link.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No background check on file</p>
            )}
          </section>

          {/* Message */}
          {app.message && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Applicant Message
              </h3>
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">
                {app.message}
              </div>
            </section>
          )}

          {/* Notes */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Manager Notes
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add internal notes about this application…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <Button
              variant="secondary"
              size="sm"
              className="mt-1.5"
              onClick={() => updateMut.mutate({ notes })}
              loading={updateMut.isPending}
            >
              Save Notes
            </Button>
          </section>

          {/* Actions */}
          {availableActions.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Update Status
              </h3>
              <div className="flex flex-wrap gap-2">
                {availableActions.map((a) => (
                  <button
                    key={a.status}
                    onClick={() => updateMut.mutate({ status: a.status })}
                    disabled={updateMut.isPending}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${a.style}`}
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Create Lease shortcut — only shown for approved applications */}
          {app.status === 'APPROVED' && app.unit && (
            <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                  <FileSignature size={15} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-indigo-900">Ready to create a lease?</p>
                  <p className="text-xs text-indigo-600 mt-0.5">
                    Unit {app.unit.unitNumber} is pre-selected and the applicant's details will be pre-filled.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  const params = new URLSearchParams({
                    unitId: app.unit!.id,
                    applicantFirstName: app.firstName,
                    applicantLastName: app.lastName,
                    applicantEmail: app.email,
                    ...(app.phone ? { applicantPhone: app.phone } : {}),
                  });
                  navigate(`/manager/leases/new?${params.toString()}`);
                  onClose();
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <FileSignature size={14} />
                Create Lease for {app.firstName} {app.lastName}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

// ─── Status filter tabs ───────────────────────────────────────────────────────

const STATUS_TABS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'RECEIVED', label: 'New' },
  { value: 'REVIEWING', label: 'Reviewing' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DENIED', label: 'Denied' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Applications() {
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Application | null>(null);

  const { data, isLoading } = useQuery<{ data: Application[]; total: number }>({
    queryKey: ['applications', statusFilter],
    queryFn: () =>
      apiGet(`/api/v1/applications${statusFilter ? `?status=${statusFilter}` : ''}`),
  });

  const apps: Application[] = data?.data ?? [];
  const total = data?.total ?? 0;

  const newCount = apps.filter((a) => a.status === 'RECEIVED').length;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              Rental Applications
              {newCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-600 text-white text-xs rounded-full">
                  {newCount > 9 ? '9+' : newCount}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {total} application{total !== 1 ? 's' : ''} total
            </p>
          </div>
        </div>

        <Card>
          {/* Status tabs */}
          <div className="border-b border-gray-100 px-1 pt-1 flex gap-0.5 overflow-x-auto">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setStatusFilter(t.value)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  statusFilter === t.value
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <CardBody>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : apps.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <ClipboardList size={40} className="text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No applications found</p>
                <p className="text-gray-400 text-sm mt-1">
                  Applications submitted via your public listing page will appear here
                </p>
              </div>
            ) : (
              <Table
                data={apps}
                onRowClick={(app) => setSelected(app)}
                columns={[
                  {
                    key: 'applicant',
                    header: 'Applicant',
                    render: (app) => (
                      <div>
                        <p className="font-medium text-gray-900">{app.firstName} {app.lastName}</p>
                        <p className="text-xs text-gray-400">{app.email}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'unit',
                    header: 'Unit / Property',
                    render: (app) =>
                      app.unit ? (
                        <div>
                          <p className="font-medium text-gray-900">Unit {app.unit.unitNumber}</p>
                          <p className="text-xs text-gray-400">{app.unit.property.name}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      ),
                  },
                  {
                    key: 'monthlyIncome',
                    header: 'Income',
                    render: (app) =>
                      app.monthlyIncome != null
                        ? <span>{formatCents(app.monthlyIncome)}/mo</span>
                        : <span className="text-gray-400">—</span>,
                  },
                  {
                    key: 'createdAt',
                    header: 'Submitted',
                    render: (app) => formatDate(app.createdAt),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (app) => <StatusBadge status={app.status} />,
                  },
                  {
                    key: 'action',
                    header: '',
                    render: () => <ChevronDown size={14} className="text-gray-400 -rotate-90" />,
                  },
                ]}
              />
            )}
          </CardBody>
        </Card>
      </div>

      {selected && (
        <ApplicationDrawer app={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
