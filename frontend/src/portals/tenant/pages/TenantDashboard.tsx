import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Wrench, CheckCircle, Clock, AlertCircle, ChevronRight, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiGet, apiPost, apiDownloadBlob, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { formatCents, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyLease {
  tenant: { id: string };
  lease: {
    id: string;
    status: string;
    rentAmount: number;
    startDate: string;
    unit: {
      id: string;
      unitNumber: string;
      property: { id: string; name: string; address: string };
    };
  } | null;
}

interface TenantLedger {
  leaseId: string;
  balance: number;
  totalCharged: number;
  totalPaid: number;
  charges: Array<{
    id: string; type: string; amount: number; balance: number;
    dueDate: string; status: string;
  }>;
  payments: Array<{
    id: string; amount: number; paidDate: string; method: string; status: string;
  }>;
}

interface WorkOrder {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TenantDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handleDownloadLease(leaseId: string) {
    setPdfLoading(true);
    try {
      await apiDownloadBlob(`/leases/${leaseId}/pdf`, 'my-lease.pdf');
    } catch {
      toast.error('Could not generate lease PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  // Step 1: get tenant's lease (includes leaseId)
  const { data: myLease, isLoading: leaseLoading } = useQuery({
    queryKey: ['my-lease'],
    queryFn: () => apiGet<MyLease>('/api/v1/leases/my-lease'),
    retry: false,
    enabled: !!user,
  });

  const leaseId = myLease?.lease?.id;
  const propertyId = myLease?.lease?.unit.property.id;

  // Step 2: load ledger with the real leaseId
  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ['tenant-ledger-dash', leaseId],
    queryFn: () => apiGet<TenantLedger>(`/api/v1/accounting/ledger/${leaseId}/tenant`),
    enabled: !!leaseId,
  });

  // Recent work orders for this property
  const { data: woRaw } = useQuery({
    queryKey: ['my-work-orders-dash', propertyId],
    queryFn: () =>
      apiGet<{ workOrders: WorkOrder[] }>(`/api/v1/maintenance/work-orders?propertyId=${propertyId}&limit=3`),
    enabled: !!propertyId,
  });
  const recentWOs: WorkOrder[] = woRaw?.workOrders ?? [];

  const isLoading = leaseLoading || ledgerLoading;

  const balance = ledger?.balance ?? 0;
  const hasLease = !!myLease?.lease;

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24">
      {/* Greeting */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900">
          Hi, {user?.email?.split('@')[0]} 👋
        </h1>
        <p className="text-gray-500 text-sm">
          {hasLease
            ? `Unit ${myLease!.lease!.unit.unitNumber} · ${myLease!.lease!.unit.property.name}`
            : 'No active lease'}
        </p>
      </div>

      {/* Balance card */}
      <Card className="bg-gradient-to-br from-teal-600 to-teal-700 border-0 text-white overflow-hidden">
        <CardBody>
          <p className="text-teal-100 text-sm font-medium">Account Balance</p>
          {isLoading ? (
            <div className="h-10 w-32 bg-teal-500/50 rounded-lg animate-pulse mt-1" />
          ) : (
            <>
              <p className="text-4xl font-bold mt-1">
                {balance < 0 ? '-' : ''}{formatCents(Math.abs(balance))}
              </p>
              <p className="text-teal-200 text-xs mt-1">
                {balance > 0 ? 'Amount due' : balance < 0 ? 'Credit on account' : '✓ All paid up!'}
              </p>
            </>
          )}
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => navigate('/tenant/payments')}
              className="bg-white text-teal-700 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-teal-50 transition-colors"
            >
              {balance > 0 ? 'Pay Now' : 'Payment History'}
            </button>
            <button
              onClick={() => navigate('/tenant/maintenance')}
              className="border border-teal-400 text-white text-sm px-4 py-2 rounded-lg hover:bg-teal-600 transition-colors"
            >
              Request Maintenance
            </button>
          </div>
        </CardBody>
      </Card>

      {/* Lease info */}
      {hasLease && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Lease Details</h2>
            <StatusBadge status={myLease!.lease!.status} />
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-gray-50">
              {[
                { label: 'Property', value: myLease!.lease!.unit.property.name },
                { label: 'Unit', value: myLease!.lease!.unit.unitNumber },
                { label: 'Address', value: myLease!.lease!.unit.property.address },
                {
                  label: 'Monthly Rent',
                  value: formatCents(myLease!.lease!.rentAmount),
                },
                {
                  label: 'Start Date',
                  value: formatDate(myLease!.lease!.startDate),
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between px-5 py-3 text-sm">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-900">{value}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => handleDownloadLease(myLease!.lease!.id)}
                disabled={pdfLoading}
                className="flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-800 disabled:opacity-60 transition-colors"
              >
                <Download size={14} />
                {pdfLoading ? 'Generating…' : 'Download Lease Agreement (PDF)'}
              </button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Recent charges */}
      {hasLease && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Recent Charges</h2>
            <button
              onClick={() => navigate('/tenant/payments')}
              className="text-xs text-teal-600 font-medium flex items-center gap-0.5 hover:underline"
            >
              View all <ChevronRight size={12} />
            </button>
          </CardHeader>
          <CardBody className="p-0">
            {isLoading ? (
              <div className="p-4 text-center text-gray-400 text-sm">Loading…</div>
            ) : !ledger?.charges?.length ? (
              <div className="p-6 text-center text-gray-400 text-sm">No charges yet</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {ledger.charges.slice(0, 5).map((c) => (
                  <li key={c.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {c.status === 'PAID' ? (
                        <CheckCircle size={15} className="text-green-500 shrink-0" />
                      ) : c.status === 'OUTSTANDING' ? (
                        <AlertCircle size={15} className="text-red-500 shrink-0" />
                      ) : (
                        <Clock size={15} className="text-yellow-500 shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {c.type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-gray-400">Due {formatDate(c.dueDate)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{formatCents(c.amount)}</p>
                      <StatusBadge status={c.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {/* Recent maintenance */}
      {recentWOs.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Maintenance</h2>
            <button
              onClick={() => navigate('/tenant/maintenance')}
              className="text-xs text-teal-600 font-medium flex items-center gap-0.5 hover:underline"
            >
              View all <ChevronRight size={12} />
            </button>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-gray-100">
              {recentWOs.map((wo) => (
                <li key={wo.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{wo.title}</p>
                    <p className="text-xs text-gray-400">{formatDate(wo.createdAt)}</p>
                  </div>
                  <StatusBadge status={wo.status} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* No lease state */}
      {!isLoading && !hasLease && (
        <Card>
          <CardBody>
            <div className="py-10 text-center">
              <DollarSign size={36} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-600 font-medium">No active lease found</p>
              <p className="text-gray-400 text-sm mt-1">
                Contact your property manager to get set up.
              </p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
