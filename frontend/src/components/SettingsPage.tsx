/**
 * Shared Settings page used by all 4 portals.
 * Accepts an `accentColor` class so each portal retains its theme.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Lock, CheckCircle, Eye, EyeOff, Save } from 'lucide-react';
import { apiPatch, apiPost, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

type Tab = 'profile' | 'security';

interface SettingsPageProps {
  /** Tailwind bg class for the active-tab indicator + save button, e.g. "bg-indigo-600" */
  accentClass?: string;
  /** Tailwind focus-ring class, e.g. "focus:ring-indigo-500" */
  ringClass?: string;
  /**
   * When true, hide the page-level <h1> and tab switcher — the parent component
   * is providing its own wrapper. Used by OwnerSettings, which has an extra
   * "Bank Account" tab and needs to own the top-level chrome.
   */
  embedded?: boolean;
  /** Which sub-tab to render. Only respected when `embedded` is true. */
  forcedTab?: Tab;
}

export default function SettingsPage({
  accentClass = 'bg-indigo-600',
  ringClass = 'focus:ring-indigo-500',
  embedded = false,
  forcedTab,
}: SettingsPageProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [internalTab, setTab] = useState<Tab>('profile');
  const tab: Tab = embedded && forcedTab ? forcedTab : internalTab;

  // ── Profile tab ────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileData>({
    firstName: '',
    lastName: '',
    email: user?.email ?? '',
    phone: '',
  });
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');

  const profileMutation = useMutation({
    mutationFn: (data: Omit<ProfileData, 'email'>) =>
      apiPatch<ProfileData>('/auth/me', data),
    onSuccess: (updated) => {
      setProfile((p) => ({ ...p, ...updated }));
      setProfileSaved(true);
      setProfileError('');
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setTimeout(() => setProfileSaved(false), 3000);
    },
    onError: (err) => setProfileError(getErrorMessage(err)),
  });

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    profileMutation.mutate({
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
    });
  }

  // ── Security tab ───────────────────────────────────────────────────────────
  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [securitySaved, setSecuritySaved] = useState(false);
  const [securityError, setSecurityError] = useState('');

  const securityMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiPost<{ message: string }>('/auth/change-password', data),
    onSuccess: () => {
      setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSecuritySaved(true);
      setSecurityError('');
      setTimeout(() => setSecuritySaved(false), 3000);
    },
    onError: (err) => setSecurityError(getErrorMessage(err)),
  });

  function handleSecuritySubmit(e: React.FormEvent) {
    e.preventDefault();
    setSecurityError('');
    if (security.newPassword !== security.confirmPassword) {
      setSecurityError('Passwords do not match');
      return;
    }
    if (security.newPassword.length < 8) {
      setSecurityError('New password must be at least 8 characters');
      return;
    }
    securityMutation.mutate({
      currentPassword: security.currentPassword,
      newPassword: security.newPassword,
    });
  }

  const inputClass = `w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${ringClass} focus:border-transparent`;
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="max-w-2xl">
      {!embedded && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
          <p className="text-gray-500 text-sm mb-6">Manage your account profile and security settings.</p>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
            {(['profile', 'security'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? `${accentClass} text-white shadow-sm` : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t === 'profile' ? <User size={14} /> : <Lock size={14} />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Profile information</h2>

          {profileSaved && (
            <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200 flex items-center gap-2">
              <CheckCircle size={16} />
              Profile updated successfully
            </div>
          )}
          {profileError && (
            <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {profileError}
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>First name</label>
                <input
                  type="text"
                  value={profile.firstName}
                  onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
                  placeholder="First name"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Last name</label>
                <input
                  type="text"
                  value={profile.lastName}
                  onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
                  placeholder="Last name"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Email address</label>
              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">Email cannot be changed. Contact support if needed.</p>
            </div>

            <div>
              <label className={labelClass}>Phone number</label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                placeholder="(555) 000-0000"
                className={inputClass}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={profileMutation.isPending}
                className={`flex items-center gap-2 px-5 py-2.5 ${accentClass} text-white font-medium rounded-lg text-sm hover:opacity-90 disabled:opacity-60 transition-opacity`}
              >
                <Save size={14} />
                {profileMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Security Tab */}
      {tab === 'security' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Change password</h2>

          {securitySaved && (
            <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200 flex items-center gap-2">
              <CheckCircle size={16} />
              Password changed successfully
            </div>
          )}
          {securityError && (
            <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {securityError}
            </div>
          )}

          <form onSubmit={handleSecuritySubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Current password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={security.currentPassword}
                  onChange={(e) => setSecurity((s) => ({ ...s, currentPassword: e.target.value }))}
                  required
                  placeholder="Your current password"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>New password</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={security.newPassword}
                onChange={(e) => setSecurity((s) => ({ ...s, newPassword: e.target.value }))}
                required
                placeholder="Min. 8 characters"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Confirm new password</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={security.confirmPassword}
                onChange={(e) => setSecurity((s) => ({ ...s, confirmPassword: e.target.value }))}
                required
                placeholder="Re-enter new password"
                className={inputClass}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={securityMutation.isPending}
                className={`flex items-center gap-2 px-5 py-2.5 ${accentClass} text-white font-medium rounded-lg text-sm hover:opacity-90 disabled:opacity-60 transition-opacity`}
              >
                <Lock size={14} />
                {securityMutation.isPending ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
