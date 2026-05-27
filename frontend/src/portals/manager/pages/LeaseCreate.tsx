import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ArrowRight, Check, Home, DollarSign, Users, Search, Plus, X
} from 'lucide-react';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { Card, CardBody, CardHeader, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { formatCents } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Unit {
  id: string;
  unitNumber: string;
  beds: number;
  baths: number;
  rentAmount: number;
  status: string;
  property?: { id: string; name: string };
}

interface Tenant {
  id: string;
  user: { firstName: string; lastName: string; email: string };
}

// ─── Step Schemas ─────────────────────────────────────────────────────────────

const step1Schema = z.object({
  unitId: z.string().min(1, 'Select a unit'),
  startDate: z.string().min(1, 'Start date required'),
  endDate: z.string().optional(),
  rentDueDay: z.coerce.number().min(1).max(28),
});

const step2Schema = z.object({
  rentAmount: z.coerce.number().min(1, 'Rent required'),
  depositAmount: z.coerce.number().min(0, 'Required'),
  gracePeriodDays: z.coerce.number().min(0).max(30),
  lateFeeType: z.enum(['FLAT', 'PERCENT']),
  lateFeeAmount: z.coerce.number().min(0),
  petsAllowed: z.boolean(),
  petDeposit: z.coerce.number().optional(),
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;

// ─── Step Indicators ─────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Unit & Dates', icon: Home },
  { label: 'Financial Terms', icon: DollarSign },
  { label: 'Tenant', icon: Users },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-600 text-white'
                  : done
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-gray-400'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                  done ? 'bg-indigo-600 text-white' : active ? 'bg-white text-indigo-600' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {done ? <Check size={10} /> : i + 1}
              </div>
              {step.label}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 ${i < current ? 'bg-indigo-300' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeaseCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedUnitId = searchParams.get('unitId') ?? '';

  // Applicant pre-fill from approved application
  const applicantFirstName = searchParams.get('applicantFirstName') ?? '';
  const applicantLastName  = searchParams.get('applicantLastName') ?? '';
  const applicantEmail     = searchParams.get('applicantEmail') ?? '';
  const applicantPhone     = searchParams.get('applicantPhone') ?? '';
  const hasApplicant = !!applicantEmail;

  const [step, setStep] = useState(0);
  const [step1Data, setStep1Data] = useState<Step1 | null>(null);
  const [step2Data, setStep2Data] = useState<Step2 | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedTenants, setSelectedTenants] = useState<Tenant[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  // Auto-open the new tenant form when arriving from an approved application
  const [showNewTenantForm, setShowNewTenantForm] = useState(false);

  // Fetch vacant units
  const { data: unitsRaw, isLoading: unitsLoading } = useQuery({
    queryKey: ['units', 'vacant'],
    queryFn: () => apiGet<Unit[] | { data: Unit[] }>('/units?status=VACANT'),
  });
  const units: Unit[] = Array.isArray(unitsRaw)
    ? unitsRaw
    : (unitsRaw as { data: Unit[] })?.data ?? [];

  // Fetch tenants for search
  const { data: tenantsRaw } = useQuery({
    queryKey: ['tenants', tenantSearch],
    queryFn: () => apiGet<Tenant[] | { data: Tenant[] }>(`/tenants?search=${encodeURIComponent(tenantSearch)}`),
    enabled: step === 2 && tenantSearch.length >= 2,
  });
  const tenants: Tenant[] = Array.isArray(tenantsRaw)
    ? tenantsRaw
    : (tenantsRaw as { data: Tenant[] })?.data ?? [];

  // Step 1 form
  const form1 = useForm<Step1>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      unitId: preselectedUnitId,
      rentDueDay: 1,
      startDate: new Date().toISOString().split('T')[0],
    },
  });
  const watchedUnitId = form1.watch('unitId');

  useEffect(() => {
    if (watchedUnitId) {
      const found = units.find((u) => u.id === watchedUnitId);
      setSelectedUnit(found ?? null);
    }
  }, [watchedUnitId, units]);

  // Step 2 form
  const form2 = useForm<Step2>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      rentAmount: selectedUnit ? selectedUnit.rentAmount / 100 : 0,
      depositAmount: selectedUnit ? selectedUnit.rentAmount / 100 : 0,
      gracePeriodDays: 5,
      lateFeeType: 'FLAT',
      lateFeeAmount: 0,
      petsAllowed: false,
      petDeposit: 0,
    },
  });
  const watchedLateFeeType = form2.watch('lateFeeType');
  const watchedPetsAllowed = form2.watch('petsAllowed');

  // Pre-fill rent when unit changes
  useEffect(() => {
    if (selectedUnit) {
      form2.setValue('rentAmount', selectedUnit.rentAmount / 100);
      form2.setValue('depositAmount', selectedUnit.rentAmount / 100);
    }
  }, [selectedUnit, form2]);

  // New tenant form — pre-fill from application params when present
  const newTenantForm = useForm({
    defaultValues: {
      firstName: applicantFirstName,
      lastName: applicantLastName,
      email: applicantEmail,
      phone: applicantPhone,
    },
  });

  const { mutate: createNewTenant, isPending: creatingTenant } = useMutation({
    mutationFn: (body: { firstName: string; lastName: string; email: string; phone: string }) =>
      apiPost<Tenant>('/tenants', body),
    onSuccess: (newTenant) => {
      setSelectedTenants((prev) => [...prev, newTenant]);
      setShowNewTenantForm(false);
      newTenantForm.reset();
      toast.success('Tenant created');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Final create lease
  const { mutate: createLease, isPending: creatingLease } = useMutation({
    mutationFn: () => {
      if (!step1Data || !step2Data) throw new Error('Missing form data');
      return apiPost('/leases', {
        unitId: step1Data.unitId,
        startDate: step1Data.startDate,
        endDate: step1Data.endDate || undefined,
        rentDueDay: step1Data.rentDueDay,
        rentAmount: Math.round(step2Data.rentAmount * 100),
        depositAmount: Math.round(step2Data.depositAmount * 100),
        gracePeriodDays: step2Data.gracePeriodDays,
        lateFeeType: step2Data.lateFeeType,
        lateFeeAmount:
          step2Data.lateFeeType === 'FLAT'
            ? Math.round(step2Data.lateFeeAmount * 100)
            : Math.round(step2Data.lateFeeAmount * 100),
        petsAllowed: step2Data.petsAllowed,
        petDeposit: step2Data.petsAllowed && step2Data.petDeposit
          ? Math.round(step2Data.petDeposit * 100)
          : 0,
        tenantIds: selectedTenants.map((t) => t.id),
      });
    },
    onSuccess: () => {
      toast.success('Lease created successfully!');
      navigate(
        selectedUnit?.property?.id
          ? `/manager/properties/${selectedUnit.property.id}`
          : '/manager/leases'
      );
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="max-w-3xl space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create New Lease</h1>
        <p className="text-gray-400 text-sm mt-1">Set up a lease agreement in 3 steps</p>
      </div>

      {/* ── Step Indicator ───────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <StepIndicator current={step} />
      </div>

      {/* ══ STEP 1 — Unit & Dates ════════════════════════════════════════════ */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Home size={14} className="text-indigo-600" />
              </div>
              <span className="font-semibold text-gray-900">Unit & Dates</span>
            </div>
          </CardHeader>
          <CardBody>
            <form
              onSubmit={form1.handleSubmit((d) => { setStep1Data(d); setStep(1); })}
              className="space-y-5"
            >
              {/* Unit selector */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Unit</label>
                {unitsLoading ? (
                  <Skeleton className="h-10" />
                ) : (
                  <select
                    className={`block w-full rounded-lg border px-3 py-2 text-sm ${
                      form1.formState.errors.unitId ? 'border-red-400 bg-red-50' : 'border-gray-300'
                    }`}
                    {...form1.register('unitId')}
                  >
                    <option value="">Select a vacant unit…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.property?.name ? `${u.property.name} — ` : ''}Unit {u.unitNumber} &nbsp;
                        ({u.beds}bd/{u.baths}ba · {formatCents(u.rentAmount)}/mo)
                      </option>
                    ))}
                  </select>
                )}
                {form1.formState.errors.unitId && (
                  <p className="text-xs text-red-600">{form1.formState.errors.unitId.message}</p>
                )}
                {units.length === 0 && !unitsLoading && (
                  <p className="text-xs text-amber-600">No vacant units available. Mark a unit as vacant first.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  type="date"
                  error={form1.formState.errors.startDate?.message}
                  {...form1.register('startDate')}
                />
                <Input
                  label="End Date (leave blank for month-to-month)"
                  type="date"
                  hint="Optional — omit for month-to-month"
                  error={form1.formState.errors.endDate?.message}
                  {...form1.register('endDate')}
                />
              </div>

              <Input
                label="Rent Due Day"
                type="number"
                min={1}
                max={28}
                hint="Day of month rent is due (1–28)"
                error={form1.formState.errors.rentDueDay?.message}
                {...form1.register('rentDueDay')}
              />

              <div className="flex justify-end">
                <Button type="submit">
                  Next <ArrowRight size={15} />
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* ══ STEP 2 — Financial Terms ══════════════════════════════════════════ */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                <DollarSign size={14} className="text-indigo-600" />
              </div>
              <span className="font-semibold text-gray-900">Financial Terms</span>
            </div>
          </CardHeader>
          <CardBody>
            <form
              onSubmit={form2.handleSubmit((d) => {
                setStep2Data(d);
                setStep(2);
                // Auto-open new tenant form when coming from an approved application
                if (hasApplicant) setShowNewTenantForm(true);
              })}
              className="space-y-5"
            >
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Monthly Rent ($)"
                  type="number"
                  min={0}
                  step="0.01"
                  hint="In dollars (e.g. 1200.00)"
                  error={form2.formState.errors.rentAmount?.message}
                  {...form2.register('rentAmount')}
                />
                <Input
                  label="Security Deposit ($)"
                  type="number"
                  min={0}
                  step="0.01"
                  error={form2.formState.errors.depositAmount?.message}
                  {...form2.register('depositAmount')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Grace Period (days)"
                  type="number"
                  min={0}
                  max={30}
                  hint="Days after due date before late fee applies"
                  error={form2.formState.errors.gracePeriodDays?.message}
                  {...form2.register('gracePeriodDays')}
                />
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Late Fee Type</label>
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                    {(['FLAT', 'PERCENT'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => form2.setValue('lateFeeType', v)}
                        className={`flex-1 py-2 text-sm font-medium transition-colors ${
                          watchedLateFeeType === v
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {v === 'FLAT' ? 'Flat ($)' : 'Percent (%)'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Input
                label={watchedLateFeeType === 'FLAT' ? 'Late Fee Amount ($)' : 'Late Fee (%)'}
                type="number"
                min={0}
                step="0.01"
                hint={watchedLateFeeType === 'FLAT' ? 'Fixed dollar amount' : 'Percentage of rent (e.g. 5 = 5%)'}
                error={form2.formState.errors.lateFeeAmount?.message}
                {...form2.register('lateFeeAmount')}
              />

              {/* Pets */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                    {...form2.register('petsAllowed')}
                  />
                  <span className="text-sm font-medium text-gray-700">Pets allowed</span>
                </label>

                {watchedPetsAllowed && (
                  <Input
                    label="Pet Deposit ($)"
                    type="number"
                    min={0}
                    step="0.01"
                    error={form2.formState.errors.petDeposit?.message}
                    {...form2.register('petDeposit')}
                  />
                )}
              </div>

              <div className="flex justify-between">
                <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                  <ArrowLeft size={15} /> Back
                </Button>
                <Button type="submit">
                  Next <ArrowRight size={15} />
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* ══ STEP 3 — Tenant & Review ══════════════════════════════════════════ */}
      {step === 2 && step1Data && step2Data && (
        <div className="space-y-4">
          {/* Applicant pre-fill banner */}
          {hasApplicant && selectedTenants.length === 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
              <Check size={16} className="text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">
                  Pre-filled from approved application
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  {applicantFirstName} {applicantLastName} ({applicantEmail}) — confirm and create to add them as a tenant.
                </p>
              </div>
            </div>
          )}

          {/* Tenant search / add */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Users size={14} className="text-indigo-600" />
                </div>
                <span className="font-semibold text-gray-900">Add Tenants</span>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {/* Selected tenants */}
              {selectedTenants.length > 0 && (
                <div className="space-y-2">
                  {selectedTenants.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-2.5 bg-indigo-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                          {t.user.firstName[0]}{t.user.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {t.user.firstName} {t.user.lastName}
                          </p>
                          <p className="text-xs text-gray-500">{t.user.email}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedTenants((prev) => prev.filter((x) => x.id !== t.id))}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Search existing tenants */}
              {!showNewTenantForm && (
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search tenants by name or email…"
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* Tenant search results */}
              {tenantSearch.length >= 2 && tenants.length > 0 && !showNewTenantForm && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {tenants
                    .filter((t) => !selectedTenants.find((s) => s.id === t.id))
                    .slice(0, 6)
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTenants((prev) => [...prev, t]);
                          setTenantSearch('');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-0"
                      >
                        <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-bold">
                          {t.user.firstName[0]}{t.user.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {t.user.firstName} {t.user.lastName}
                          </p>
                          <p className="text-xs text-gray-400">{t.user.email}</p>
                        </div>
                      </button>
                    ))}
                </div>
              )}

              {/* Create new tenant inline */}
              {showNewTenantForm ? (
                <form
                  onSubmit={newTenantForm.handleSubmit((d) => createNewTenant(d))}
                  className="space-y-3 border border-gray-200 rounded-lg p-4"
                >
                  <p className="text-sm font-medium text-gray-700 mb-2">New Tenant</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="First Name" {...newTenantForm.register('firstName')} />
                    <Input label="Last Name" {...newTenantForm.register('lastName')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Email" type="email" {...newTenantForm.register('email')} />
                    <Input label="Phone" type="tel" {...newTenantForm.register('phone')} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={creatingTenant}>
                      Add Tenant
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowNewTenantForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewTenantForm(true)}
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                >
                  <Plus size={14} /> Create a new tenant
                </button>
              )}
            </CardBody>
          </Card>

          {/* ── Summary ──────────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <span className="font-semibold text-gray-900">Lease Summary</span>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Unit</p>
                  <p className="text-gray-900">
                    {selectedUnit
                      ? `${selectedUnit.property?.name ? selectedUnit.property.name + ' — ' : ''}Unit ${selectedUnit.unitNumber}`
                      : step1Data.unitId}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Lease Dates</p>
                  <p className="text-gray-900">
                    {step1Data.startDate} → {step1Data.endDate || 'Month-to-Month'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Monthly Rent</p>
                  <p className="text-gray-900 font-semibold">${step2Data.rentAmount.toFixed(2)}/mo</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Security Deposit</p>
                  <p className="text-gray-900">${step2Data.depositAmount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Late Fee</p>
                  <p className="text-gray-900">
                    {step2Data.lateFeeType === 'FLAT'
                      ? `$${step2Data.lateFeeAmount.toFixed(2)} flat`
                      : `${step2Data.lateFeeAmount}%`}{' '}
                    after {step2Data.gracePeriodDays} grace days
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Pets</p>
                  <p className="text-gray-900">
                    {step2Data.petsAllowed
                      ? `Allowed (deposit: $${(step2Data.petDeposit ?? 0).toFixed(2)})`
                      : 'Not allowed'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Rent Due Day</p>
                  <p className="text-gray-900">{step1Data.rentDueDay}{['st','nd','rd'][step1Data.rentDueDay - 1] ?? 'th'} of the month</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Tenants</p>
                  <p className="text-gray-900">
                    {selectedTenants.length
                      ? selectedTenants.map((t) => `${t.user.firstName} ${t.user.lastName}`).join(', ')
                      : <span className="text-amber-600">No tenants added yet</span>}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={15} /> Back
            </Button>
            <Button
              loading={creatingLease}
              onClick={() => createLease()}
            >
              <Check size={15} /> Create Lease
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
