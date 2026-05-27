import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CreditCard, CheckCircle, AlertCircle, Clock, ChevronDown, ChevronUp,
  Plus, Lock, Trash2, RefreshCw,
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, CardElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';

interface AutopayStatus { autopayEnabled: boolean; hasCard: boolean; }
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/Badge';
import { formatCents, formatDate } from '@/lib/utils';

// ─── Stripe setup ─────────────────────────────────────────────────────────────

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

// ─── Types ───────────────────────────────────────────────────────────────────

interface MyLease {
  lease: { id: string; rentAmount: number } | null;
}

interface Charge {
  id: string;
  type: string;
  description?: string;
  amount: number;
  balance: number;
  dueDate: string;
  status: string;
  paymentApplications?: Array<{ amount: number; payment: { paidDate: string; method: string } }>;
}

interface Payment {
  id: string;
  amount: number;
  paidDate: string;
  method: string;
  referenceNumber?: string;
  status: string;
  memo?: string;
}

interface TenantLedger {
  leaseId: string;
  balance: number;
  totalCharged: number;
  totalPaid: number;
  charges: Charge[];
  payments: Payment[];
}

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
}

const METHOD_COLORS: Record<string, string> = {
  ACH: 'bg-blue-100 text-blue-700',
  CHECK: 'bg-purple-100 text-purple-700',
  CASH: 'bg-green-100 text-green-700',
  CREDIT_CARD: 'bg-orange-100 text-orange-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

// ─── Card Setup Form (Stripe Elements) ────────────────────────────────────────

function AddCardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!stripe || !elements) return;
    setSaving(true);
    try {
      // Get a SetupIntent client_secret from backend
      const { clientSecret } = await apiPost<{ clientSecret: string }>('/payments/setup-intent');

      const cardEl = elements.getElement(CardElement);
      if (!cardEl) throw new Error('Card element not found');

      const { error } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardEl },
      });

      if (error) throw new Error(error.message ?? 'Card setup failed');

      toast.success('Card saved successfully!');
      onSuccess();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="p-3 border border-gray-200 rounded-xl bg-white">
        <CardElement
          options={{
            style: {
              base: { fontSize: '15px', color: '#1f2937', '::placeholder': { color: '#9ca3af' } },
              invalid: { color: '#ef4444' },
            },
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} loading={saving} className="bg-teal-600 hover:bg-teal-700 focus:ring-teal-500">
          <Lock size={14} /> Save Card
        </Button>
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Lock size={11} /> Secured by Stripe. Your card details are never stored on our servers.
      </p>
    </div>
  );
}

// ─── Stripe Pay Button ────────────────────────────────────────────────────────

function StripePayButton({
  leaseId,
  amountCents,
  savedCard,
  onSuccess,
}: {
  leaseId: string;
  amountCents: number;
  savedCard: SavedCard;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const [paying, setPaying] = useState(false);

  async function handlePay() {
    if (!stripe) return;
    setPaying(true);
    try {
      // Create PaymentIntent on backend
      const { clientSecret, paymentIntentId } = await apiPost<{
        clientSecret: string;
        paymentIntentId: string;
      }>('/payments/create-intent', { leaseId, amountCents });

      // Confirm with saved card
      const { error } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: savedCard.id,
      });
      if (error) throw new Error(error.message ?? 'Payment failed');

      // Tell backend to verify and record in ledger
      await apiPost('/payments/confirm', { paymentIntentId, leaseId });

      toast.success('Payment successful!');
      onSuccess();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPaying(false);
    }
  }

  return (
    <Button
      onClick={handlePay}
      loading={paying}
      className="w-full bg-teal-600 hover:bg-teal-700 focus:ring-teal-500 text-base py-3"
    >
      <Lock size={15} />
      Pay {formatCents(amountCents)} with {savedCard.brand.toUpperCase()} ···· {savedCard.last4}
    </Button>
  );
}

// ─── Payment Method Section ───────────────────────────────────────────────────

function PaymentMethodSection({ onCardSaved }: { onCardSaved: () => void }) {
  const [showAddCard, setShowAddCard] = useState(false);

  const { data: card, isLoading, refetch } = useQuery<SavedCard | null>({
    queryKey: ['saved-card'],
    queryFn: () => apiGet<SavedCard | null>('/payments/payment-method'),
    retry: false,
  });

  if (!stripePromise) return null; // no Stripe key — skip the section

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <span className="font-semibold text-gray-900 flex items-center gap-2">
          <CreditCard size={16} className="text-teal-600" /> Payment Method
        </span>
      </CardHeader>
      <CardBody>
        {card ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 bg-gray-100 rounded flex items-center justify-center text-xs font-bold text-gray-600">
                {card.brand.toUpperCase().slice(0, 4)}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">···· ···· ···· {card.last4}</p>
                {card.expMonth && card.expYear && (
                  <p className="text-xs text-gray-400">Expires {card.expMonth}/{card.expYear}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowAddCard(true)}
              className="text-xs text-teal-600 hover:underline flex items-center gap-1"
            >
              <Trash2 size={12} /> Replace
            </button>
          </div>
        ) : (
          <>
            {showAddCard ? (
              <AddCardForm onSuccess={() => { setShowAddCard(false); refetch(); onCardSaved(); }} />
            ) : (
              <button
                onClick={() => setShowAddCard(true)}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-5 flex items-center justify-center gap-2 text-gray-400 hover:border-teal-400 hover:text-teal-500 transition-colors"
              >
                <Plus size={16} />
                <span className="text-sm">Add a payment card</span>
              </button>
            )}
          </>
        )}
        {card && showAddCard && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-600 mb-3">Enter new card</p>
            <AddCardForm onSuccess={() => { setShowAddCard(false); refetch(); onCardSaved(); }} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function TenantPaymentsInner() {
  const qc = useQueryClient();
  const [showManualForm, setShowManualForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [expandedCharge, setExpandedCharge] = useState<string | null>(null);
  const [cardRefreshKey, setCardRefreshKey] = useState(0);

  // Get tenant lease
  const { data: myLease } = useQuery({
    queryKey: ['my-lease'],
    queryFn: () => apiGet<MyLease>('/leases/my-lease'),
    retry: false,
  });

  const leaseId = myLease?.lease?.id;

  // Ledger data
  const { data: ledger, isLoading } = useQuery({
    queryKey: ['tenant-ledger-full', leaseId],
    queryFn: () => apiGet<TenantLedger>(`/accounting/ledger/${leaseId}/tenant`),
    enabled: !!leaseId,
  });

  // Autopay status
  const { data: autopay } = useQuery<AutopayStatus>({
    queryKey: ['autopay-status'],
    queryFn: () => apiGet<AutopayStatus>('/payments/autopay-status'),
    retry: false,
  });

  // Saved card (re-queried when cardRefreshKey changes)
  const { data: savedCard } = useQuery<SavedCard | null>({
    queryKey: ['saved-card', cardRefreshKey],
    queryFn: () => stripePromise
      ? apiGet<SavedCard | null>('/payments/payment-method')
      : Promise.resolve(null),
    retry: false,
  });

  // Manual ACH payment fallback
  const { mutate: payManual, isPending: payingManual } = useMutation({
    mutationFn: (amount: number) =>
      apiPost('/accounting/payments', { leaseId, amount, method: 'ACH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-ledger-full'] });
      qc.invalidateQueries({ queryKey: ['tenant-ledger'] });
      setShowManualForm(false);
      setPayAmount('');
      toast.success('Payment recorded!');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  function onPaymentSuccess() {
    qc.invalidateQueries({ queryKey: ['tenant-ledger-full'] });
    qc.invalidateQueries({ queryKey: ['tenant-ledger'] });
  }

  if (!myLease?.lease && !isLoading) {
    return (
      <div className="max-w-2xl mx-auto pb-24 pt-2">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Payments</h1>
        <Card>
          <CardBody>
            <div className="py-10 text-center">
              <CreditCard size={36} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-500 font-medium">No active lease found</p>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const balancePos = (ledger?.balance ?? 0) > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <p className="text-gray-500 text-sm">Your charges and payment history</p>
      </div>

      {/* ── Balance Summary ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Charged', value: ledger?.totalCharged ?? 0, color: 'text-gray-900' },
          { label: 'Total Paid', value: ledger?.totalPaid ?? 0, color: 'text-green-600' },
          { label: 'Balance Due', value: Math.max(0, ledger?.balance ?? 0), color: balancePos ? 'text-red-600' : 'text-green-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>
              {isLoading ? '—' : formatCents(s.value)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Autopay Banner ─────────────────────────────────────────────── */}
      {autopay?.autopayEnabled ? (
        <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-sm text-teal-700">
          <RefreshCw size={14} className="shrink-0" />
          <span>
            <strong>Autopay is ON</strong> — your balance is charged automatically each month.
          </span>
        </div>
      ) : autopay?.hasCard ? (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500">
          <RefreshCw size={14} className="shrink-0 text-gray-400" />
          <span>
            Autopay is off.{' '}
            <a href="/tenant/settings" className="text-teal-600 hover:underline font-medium">
              Enable autopay in Settings →
            </a>
          </span>
        </div>
      ) : null}

      {/* ── Payment Method ─────────────────────────────────────────────── */}
      {stripePromise && (
        <PaymentMethodSection onCardSaved={() => setCardRefreshKey((k) => k + 1)} />
      )}

      {/* ── Pay Now ────────────────────────────────────────────────────── */}
      {balancePos && leaseId && (
        <div>
          {stripePromise && savedCard ? (
            // Stripe pay button
            <StripePayButton
              leaseId={leaseId}
              amountCents={ledger!.balance}
              savedCard={savedCard}
              onSuccess={onPaymentSuccess}
            />
          ) : stripePromise && !savedCard ? (
            // Has Stripe but no card saved yet — prompt to add
            <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-sm text-teal-700">
              Add a payment card above to pay online.
            </div>
          ) : (
            // No Stripe configured — manual entry
            <>
              {!showManualForm && (
                <button
                  onClick={() => setShowManualForm(true)}
                  className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Pay {formatCents(ledger!.balance)} Now
                </button>
              )}
              {showManualForm && (
                <Card>
                  <CardHeader>
                    <span className="font-semibold text-gray-900">Record a Payment</span>
                  </CardHeader>
                  <CardBody>
                    <div className="space-y-3">
                      <Input
                        label="Amount ($)"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder={myLease?.lease ? String(myLease.lease.rentAmount / 100) : '0.00'}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          loading={payingManual}
                          className="bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
                          onClick={() => {
                            const cents = Math.round(parseFloat(payAmount) * 100);
                            if (isNaN(cents) || cents <= 0) { toast.error('Enter a valid amount'); return; }
                            payManual(cents);
                          }}
                        >
                          Submit Payment
                        </Button>
                        <Button variant="secondary" onClick={() => setShowManualForm(false)}>Cancel</Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Charges ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Charges</h2>
          <span className="text-xs text-gray-400">{ledger?.charges.length ?? 0} total</span>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : !ledger?.charges.length ? (
            <div className="p-8 text-center text-gray-400 text-sm">No charges yet</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {ledger.charges.map((c) => (
                <li key={c.id}>
                  <button
                    className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                    onClick={() => setExpandedCharge(expandedCharge === c.id ? null : c.id)}
                  >
                    <div className="flex items-center gap-3">
                      {c.status === 'PAID' ? (
                        <CheckCircle size={16} className="text-green-500 shrink-0" />
                      ) : c.status === 'OUTSTANDING' ? (
                        <AlertCircle size={16} className="text-red-500 shrink-0" />
                      ) : (
                        <Clock size={16} className="text-yellow-500 shrink-0" />
                      )}
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-800">
                          {c.type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-gray-400">Due {formatDate(c.dueDate)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatCents(c.amount)}</p>
                        {c.balance > 0 && (
                          <p className="text-xs text-red-500">{formatCents(c.balance)} due</p>
                        )}
                      </div>
                      <StatusBadge status={c.status} />
                      {expandedCharge === c.id
                        ? <ChevronUp size={14} className="text-gray-400" />
                        : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>
                  {expandedCharge === c.id && c.paymentApplications?.length ? (
                    <div className="px-5 pb-3 bg-gray-50 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 mb-2 mt-2">Payment Applications</p>
                      {c.paymentApplications.map((pa, i) => (
                        <div key={i} className="flex justify-between text-xs text-gray-600 py-1">
                          <span>{formatDate(pa.payment.paidDate)} · {pa.payment.method}</span>
                          <span className="font-medium text-green-600">−{formatCents(pa.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ── Payments ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Payment History</h2>
          <span className="text-xs text-gray-400">{ledger?.payments.length ?? 0} total</span>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : !ledger?.payments.length ? (
            <div className="p-8 text-center text-gray-400 text-sm">No payments recorded</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {ledger.payments.map((p) => (
                <li key={p.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${METHOD_COLORS[p.method] ?? METHOD_COLORS.OTHER}`}>
                        {p.method.replace('_', ' ')}
                      </span>
                      {p.referenceNumber && (
                        <span className="text-xs text-gray-400 font-mono">#{p.referenceNumber.slice(0, 12)}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{formatDate(p.paidDate)}</p>
                    {p.memo && <p className="text-xs text-gray-500 mt-0.5">{p.memo}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-600">+{formatCents(p.amount)}</p>
                    <StatusBadge status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ─── Wrap with Stripe Elements provider ──────────────────────────────────────

export default function TenantPayments() {
  if (!stripePromise) {
    // No Stripe key — render without Elements provider (manual form fallback still works)
    return <TenantPaymentsInner />;
  }
  return (
    <Elements stripe={stripePromise}>
      <TenantPaymentsInner />
    </Elements>
  );
}
