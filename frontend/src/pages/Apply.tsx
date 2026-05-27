import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import {
  Building2, MapPin, BedDouble, Bath, Maximize2, DollarSign,
  CheckCircle, ChevronRight, ChevronLeft, User, Briefcase, FileText,
} from 'lucide-react';
import { formatCents } from '@/lib/utils';

// ─── API base (same logic as api.ts but no auth header) ──────────────────────

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

async function publicGet<T>(url: string): Promise<T> {
  const { data } = await axios.get<{ success: boolean; data: T }>(`${API_BASE}${url}`);
  return data.data;
}
async function publicPost<T>(url: string, body: object): Promise<T> {
  const { data } = await axios.post<{ success: boolean; data: T }>(`${API_BASE}${url}`, body);
  return data.data;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface UnitInfo {
  id: string;
  unitNumber: string;
  beds: number;
  baths: number;
  sqft?: number;
  rentAmount: number;
  status: string;
  property: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    managementCompanyId: string;
  };
}

// ─── Step schemas ─────────────────────────────────────────────────────────────

const step1Schema = z.object({
  firstName: z.string().min(1, 'First name required'),
  lastName: z.string().min(1, 'Last name required'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(7, 'Phone number required'),
  dateOfBirth: z.string().optional(),
});

const step2Schema = z.object({
  employer: z.string().min(1, 'Employer required'),
  monthlyIncome: z.coerce.number().positive('Monthly income required'),
  message: z.string().max(2000).optional(),
});

const step3Schema = z.object({
  consent: z.literal(true, { errorMap: () => ({ message: 'You must agree to the background check' }) }),
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;
type Step3 = z.infer<typeof step3Schema>;

// ─── Reusable field ───────────────────────────────────────────────────────────

function Field({
  label, error, children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

const inputCls = (err?: string) =>
  `w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 transition-shadow ${
    err
      ? 'border-red-300 focus:ring-red-200'
      : 'border-gray-200 focus:ring-indigo-200 focus:border-indigo-400'
  }`;

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Personal Info', icon: User },
  { label: 'Employment', icon: Briefcase },
  { label: 'Review & Submit', icon: FileText },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <div className={`flex flex-col items-center ${i < STEPS.length - 1 ? 'mr-0' : ''}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                done ? 'bg-indigo-600 text-white' :
                active ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' :
                'bg-gray-100 text-gray-400'
              }`}>
                {done ? <CheckCircle size={18} /> : <Icon size={16} />}
              </div>
              <span className={`text-xs mt-1 font-medium ${active ? 'text-indigo-600' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-16 h-0.5 mx-1 mb-5 ${i < current ? 'bg-indigo-600' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Unit header card ─────────────────────────────────────────────────────────

function UnitCard({ unit }: { unit: UnitInfo }) {
  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-6 flex items-start gap-4">
      <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
        <Building2 size={20} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">
          Unit {unit.unitNumber} — {unit.property.name}
        </p>
        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
          <MapPin size={11} />
          {unit.property.address}, {unit.property.city}, {unit.property.state} {unit.property.zip}
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-600">
          {unit.beds != null && (
            <span className="flex items-center gap-1"><BedDouble size={12} /> {unit.beds} bd</span>
          )}
          {unit.baths != null && (
            <span className="flex items-center gap-1"><Bath size={12} /> {unit.baths} ba</span>
          )}
          {unit.sqft && (
            <span className="flex items-center gap-1"><Maximize2 size={12} /> {unit.sqft.toLocaleString()} sqft</span>
          )}
          <span className="flex items-center gap-1 font-semibold text-indigo-700">
            <DollarSign size={12} /> {formatCents(unit.rentAmount)}/mo
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Apply() {
  const { unitId } = useParams<{ unitId: string }>();
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [applicationId, setApplicationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Collected form data across steps
  const [step1Data, setStep1Data] = useState<Step1 | null>(null);
  const [step2Data, setStep2Data] = useState<Step2 | null>(null);

  // Fetch unit info
  const { data: unit, isLoading, error: unitError } = useQuery<UnitInfo>({
    queryKey: ['public-unit', unitId],
    queryFn: () => publicGet(`/applications/unit/${unitId}`),
    enabled: !!unitId,
    retry: false,
  });

  // Step forms
  const form1 = useForm<Step1>({ resolver: zodResolver(step1Schema), defaultValues: step1Data ?? undefined });
  const form2 = useForm<Step2>({ resolver: zodResolver(step2Schema), defaultValues: step2Data ?? undefined });
  const form3 = useForm<Step3>({ resolver: zodResolver(step3Schema) });

  async function onStep1(data: Step1) {
    setStep1Data(data);
    setStep(1);
  }

  async function onStep2(data: Step2) {
    setStep2Data(data);
    setStep(2);
  }

  async function onStep3() {
    if (!step1Data || !step2Data || !unit) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await publicPost<{ id: string }>('/applications', {
        unitId: unit.id,
        managementCompanyId: unit.property.managementCompanyId,
        firstName: step1Data.firstName,
        lastName: step1Data.lastName,
        email: step1Data.email,
        phone: step1Data.phone,
        dateOfBirth: step1Data.dateOfBirth,
        employer: step2Data.employer,
        monthlyIncome: Math.round(step2Data.monthlyIncome * 100), // dollars → cents
        message: step2Data.message,
      });
      setApplicationId(result.id);
      setSubmitted(true);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setSubmitError(err.response?.data?.error ?? 'Submission failed. Please try again.');
      } else {
        setSubmitError('Submission failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (unitError || !unit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 size={28} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Unit not found</h1>
          <p className="text-gray-500 text-sm">
            This application link may be invalid or the unit is no longer available.
          </p>
        </div>
      </div>
    );
  }

  if (unit.status !== 'VACANT') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 size={28} className="text-yellow-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Unit not available</h1>
          <p className="text-gray-500 text-sm">
            Unit {unit.unitNumber} at {unit.property.name} is not currently accepting applications.
          </p>
        </div>
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h1>
          <p className="text-gray-500 text-sm mb-4">
            Thank you, {step1Data?.firstName}. Your application for Unit {unit.unitNumber} at{' '}
            {unit.property.name} has been received.
          </p>
          <div className="bg-gray-50 rounded-xl p-3 mb-6">
            <p className="text-xs text-gray-400">Application ID</p>
            <p className="text-sm font-mono font-semibold text-gray-700 mt-0.5">{applicationId}</p>
          </div>
          <p className="text-xs text-gray-400">
            The property manager will review your application and be in touch at{' '}
            <span className="font-medium text-gray-600">{step1Data?.email}</span>.
          </p>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        {/* Branding header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold mb-3">
            <Building2 size={16} />
            PropFlow
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Rental Application</h1>
          <p className="text-gray-500 text-sm mt-1">Complete all steps to submit your application</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <StepBar current={step} />
          <UnitCard unit={unit} />

          {/* ── Step 1: Personal Info ──────────────────────────────────── */}
          {step === 0 && (
            <form onSubmit={form1.handleSubmit(onStep1)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="First Name" error={form1.formState.errors.firstName?.message}>
                  <input
                    {...form1.register('firstName')}
                    className={inputCls(form1.formState.errors.firstName?.message)}
                    placeholder="Jane"
                  />
                </Field>
                <Field label="Last Name" error={form1.formState.errors.lastName?.message}>
                  <input
                    {...form1.register('lastName')}
                    className={inputCls(form1.formState.errors.lastName?.message)}
                    placeholder="Smith"
                  />
                </Field>
              </div>
              <Field label="Email Address" error={form1.formState.errors.email?.message}>
                <input
                  {...form1.register('email')}
                  type="email"
                  className={inputCls(form1.formState.errors.email?.message)}
                  placeholder="jane@example.com"
                />
              </Field>
              <Field label="Phone Number" error={form1.formState.errors.phone?.message}>
                <input
                  {...form1.register('phone')}
                  type="tel"
                  className={inputCls(form1.formState.errors.phone?.message)}
                  placeholder="(555) 000-0000"
                />
              </Field>
              <Field label="Date of Birth (optional)" error={form1.formState.errors.dateOfBirth?.message}>
                <input
                  {...form1.register('dateOfBirth')}
                  type="date"
                  className={inputCls()}
                />
              </Field>
              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors mt-2"
              >
                Continue <ChevronRight size={16} />
              </button>
            </form>
          )}

          {/* ── Step 2: Employment & Income ────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={form2.handleSubmit(onStep2)} className="space-y-4">
              <Field label="Current Employer" error={form2.formState.errors.employer?.message}>
                <input
                  {...form2.register('employer')}
                  className={inputCls(form2.formState.errors.employer?.message)}
                  placeholder="Acme Corp"
                />
              </Field>
              <Field label="Gross Monthly Income ($)" error={form2.formState.errors.monthlyIncome?.message}>
                <input
                  {...form2.register('monthlyIncome')}
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls(form2.formState.errors.monthlyIncome?.message)}
                  placeholder="4500.00"
                />
              </Field>
              <Field label="Message to Property Manager (optional)" error={form2.formState.errors.message?.message}>
                <textarea
                  {...form2.register('message')}
                  rows={4}
                  className={inputCls() + ' resize-none'}
                  placeholder="Tell us a bit about yourself, move-in date preference, etc."
                />
              </Field>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <ChevronLeft size={16} /> Back
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  Continue <ChevronRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* ── Step 3: Review & Submit ─────────────────────────────────── */}
          {step === 2 && step1Data && step2Data && (
            <form onSubmit={form3.handleSubmit(onStep3)} className="space-y-5">
              {/* Summary */}
              <div className="space-y-3">
                <SummarySection title="Personal Information">
                  <SummaryRow label="Name" value={`${step1Data.firstName} ${step1Data.lastName}`} />
                  <SummaryRow label="Email" value={step1Data.email} />
                  <SummaryRow label="Phone" value={step1Data.phone} />
                  {step1Data.dateOfBirth && <SummaryRow label="Date of Birth" value={step1Data.dateOfBirth} />}
                </SummarySection>
                <SummarySection title="Employment">
                  <SummaryRow label="Employer" value={step2Data.employer} />
                  <SummaryRow label="Monthly Income" value={`$${Number(step2Data.monthlyIncome).toLocaleString()}`} />
                  {step2Data.message && <SummaryRow label="Message" value={step2Data.message} />}
                </SummarySection>
              </div>

              {/* Consent checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  {...form3.register('consent')}
                  className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-600">
                  I authorize a background and credit check as part of this application process,
                  and certify that the information provided is true and accurate.
                </span>
              </label>
              {form3.formState.errors.consent && (
                <p className="text-xs text-red-500 -mt-2">{form3.formState.errors.consent.message}</p>
              )}

              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {submitError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <ChevronLeft size={16} /> Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  {submitting ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>Submit Application <CheckCircle size={16} /></>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by PropFlow · Your information is handled securely
        </p>
      </div>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}
