import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Lock, CreditCard, CheckCircle, Save, Eye, EyeOff } from 'lucide-react';
import { apiGet, apiPatch, apiPost, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import SettingsPage from '@/components/SettingsPage';

type Tab = 'profile' | 'security' | 'bank';

interface OwnerProfile {
  taxId?: string;
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
}

export default function OwnerSettings() {
  const [tab, setTab] = useState<Tab>('profile');
  const { user } = useAuthStore();
  const qc = useQueryClient();

  // ── Bank tab state ─────────────────────────────────────────────────────────
  const [bankForm, setBankForm] = useState({
    taxId: '',
    bankAccountNumber: '',
    bankRoutingNumber: '',
  });
  const [showSensitive, setShowSensitive] = useState(false);
  const [bankSaved, setBankSaved] = useState(false);
  const [bankError, setBankError] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['owner-profile'],
    queryFn: () => apiGet<OwnerProfile>('/owners/me'),
    enabled: tab === 'bank',
  });

  useEffect(() => {
    if (profile) {
      setBankForm({
        taxId: profile.taxId ?? '',
        bankAccountNumber: profile.bankAccountNumber ?? '',
        bankRoutingNumber: profile.bankRoutingNumber ?? '',
      });
    }
  }, [profile]);

  const bankMutation = useMutation({
    mutationFn: (data: typeof bankForm) => apiPatch('/owners/me/bank', data),
    onSuccess: () => {
      setBankSaved(true);
      setBankError('');
      qc.invalidateQueries({ queryKey: ['owner-profile'] });
      setTimeout(() => setBankSaved(false), 3000);
    },
    onError: (err) => setBankError(getErrorMessage(err)),
  });

  const accentClass = 'bg-green-600';
  const ringClass = 'focus:ring-green-500';
  const inputClass = `w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${ringClass} focus:border-transparent`;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-gray-500 text-sm mb-6">Manage your account profile, security, and payment information.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'profile', icon: User, label: 'Profile' },
          { key: 'security', icon: Lock, label: 'Security' },
          { key: 'bank', icon: CreditCard, label: 'Bank Account' },
        ] as { key: Tab; icon: typeof User; label: string }[]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? `${accentClass} text-white shadow-sm` : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Profile & Security use shared component */}
      {(tab === 'profile' || tab === 'security') && (
        <SettingsPage accentClass={accentClass} ringClass={ringClass} />
      )}

      {/* Bank Account Tab */}
      {tab === 'bank' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Bank account & tax information</h2>
          <p className="text-gray-500 text-sm mb-4">
            This information is encrypted and used for disbursement processing and 1099 reporting.
          </p>

          {bankSaved && (
            <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200 flex items-center gap-2">
              <CheckCircle size={16} /> Bank information updated securely
            </div>
          )}
          {bankError && (
            <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {bankError}
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); bankMutation.mutate(bankForm); }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tax ID (SSN / EIN)
              </label>
              <div className="relative">
                <input
                  type={showSensitive ? 'text' : 'password'}
                  value={bankForm.taxId}
                  onChange={(e) => setBankForm((f) => ({ ...f, taxId: e.target.value }))}
                  placeholder="XXX-XX-XXXX"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowSensitive(!showSensitive)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSensitive ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank account number
              </label>
              <input
                type={showSensitive ? 'text' : 'password'}
                value={bankForm.bankAccountNumber}
                onChange={(e) => setBankForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
                placeholder="Account number"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Routing number
              </label>
              <input
                type={showSensitive ? 'text' : 'password'}
                value={bankForm.bankRoutingNumber}
                onChange={(e) => setBankForm((f) => ({ ...f, bankRoutingNumber: e.target.value }))}
                placeholder="9-digit routing number"
                className={inputClass}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={bankMutation.isPending}
                className={`flex items-center gap-2 px-5 py-2.5 ${accentClass} text-white font-medium rounded-lg text-sm hover:opacity-90 disabled:opacity-60 transition-opacity`}
              >
                <Save size={14} />
                {bankMutation.isPending ? 'Saving…' : 'Save bank information'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
