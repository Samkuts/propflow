import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  BookOpen, List, DollarSign, Play, ChevronDown, ChevronRight,
  Download, RefreshCw, TrendingUp, TrendingDown, Wallet,
} from 'lucide-react';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { Card, CardHeader, CardBody, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCents, formatDate } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
  totalDebit: number;
  totalCredit: number;
}

interface JournalLine {
  id: string;
  debit: number;
  credit: number;
  description?: string;
  account: { code: string; name: string; type: string };
}

interface JournalEntry {
  id: string;
  type: string;
  description: string;
  entryDate: string;
  isReversed?: boolean;
  property?: { name: string };
  lines: JournalLine[];
}

// ─── Account type color ───────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  ASSET:     'bg-blue-50 text-blue-700',
  LIABILITY: 'bg-purple-50 text-purple-700',
  EQUITY:    'bg-indigo-50 text-indigo-700',
  INCOME:    'bg-green-50 text-green-700',
  EXPENSE:   'bg-red-50 text-red-700',
};

const ENTRY_TYPE_COLOR: Record<string, string> = {
  RENT_CHARGE:     'bg-blue-100 text-blue-700',
  PAYMENT_RECEIVED:'bg-green-100 text-green-700',
  LATE_FEE:        'bg-amber-100 text-amber-700',
  DEPOSIT:         'bg-purple-100 text-purple-700',
  REFUND:          'bg-orange-100 text-orange-700',
  EXPENSE:         'bg-red-100 text-red-700',
};

// ─── Journal Entry Row ────────────────────────────────────────────────────────

function JournalRow({ entry }: { entry: JournalEntry }) {
  const [expanded, setExpanded] = useState(false);
  const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
  const colorCls = ENTRY_TYPE_COLOR[entry.type] ?? 'bg-gray-100 text-gray-600';

  return (
    <>
      <tr
        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 text-sm text-gray-500">{formatDate(entry.entryDate)}</td>
        <td className="px-4 py-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorCls}`}>
            {entry.type.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-800">{entry.description}</td>
        <td className="px-4 py-3 text-sm text-gray-500">{entry.property?.name ?? '—'}</td>
        <td className="px-4 py-3 text-sm font-medium text-right">{formatCents(totalDebit)}</td>
        <td className="px-4 py-3 w-8">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={6} className="px-6 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left pb-1 pr-4">Account</th>
                  <th className="text-left pb-1 pr-4">Code</th>
                  <th className="text-right pb-1 pr-4">Debit</th>
                  <th className="text-right pb-1">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line) => (
                  <tr key={line.id} className="text-gray-600">
                    <td className="pr-4 py-0.5">{line.account.name}</td>
                    <td className="pr-4 py-0.5 font-mono text-gray-400">{line.account.code}</td>
                    <td className="text-right pr-4 py-0.5">
                      {line.debit > 0 ? formatCents(line.debit) : '—'}
                    </td>
                    <td className="text-right py-0.5">
                      {line.credit > 0 ? formatCents(line.credit) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'ledger' | 'accounts' | 'actions';

export default function Accounting() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('ledger');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  // ── Journal ledger ────────────────────────────────────────────────────────
  const { data: ledgerRaw, isLoading: ledgerLoading } = useQuery({
    queryKey: ['journal-ledger', startDate, endDate, page],
    queryFn: () =>
      apiGet<{ data: JournalEntry[]; total: number; meta: { page: number; limit: number } }>(
        `/accounting/ledger?${startDate ? `startDate=${startDate}&` : ''}${endDate ? `endDate=${endDate}&` : ''}page=${page}&limit=50`
      ),
    enabled: tab === 'ledger',
  });
  const entries: JournalEntry[] = (ledgerRaw as any)?.data ?? (Array.isArray(ledgerRaw) ? ledgerRaw : []);
  const ledgerTotal = (ledgerRaw as any)?.total ?? 0;
  const totalPages = Math.ceil(ledgerTotal / 50);

  // ── Chart of accounts ─────────────────────────────────────────────────────
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => apiGet<Account[]>('/accounting/accounts'),
    enabled: tab === 'accounts',
  });

  const byType = (accounts ?? []).reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {});

  // ── Actions / manual triggers ─────────────────────────────────────────────
  const { mutate: postRent, isPending: postingRent } = useMutation({
    mutationFn: () => apiPost('/accounting/rent-charges/post', {}),
    onSuccess: (data: any) => {
      const count = data?.posted ?? 0;
      toast.success(`Posted ${count} rent charge${count !== 1 ? 's' : ''}`);
      qc.invalidateQueries({ queryKey: ['journal-ledger'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const { mutate: postFees, isPending: postingFees } = useMutation({
    mutationFn: () => apiPost('/accounting/late-fees/post', {}),
    onSuccess: (data: any) => {
      const count = data?.posted ?? 0;
      toast.success(`Posted ${count} late fee${count !== 1 ? 's' : ''}`);
      qc.invalidateQueries({ queryKey: ['journal-ledger'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const exportCsv = () => {
    if (!entries.length) return;
    const rows = [
      ['Date', 'Type', 'Description', 'Property', 'Amount'],
      ...entries.map((e) => [
        formatDate(e.entryDate),
        e.type,
        e.description,
        e.property?.name ?? '',
        String(e.lines.reduce((s, l) => s + l.debit, 0) / 100),
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'journal-entries.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Income / Expense totals from CoA ─────────────────────────────────────
  const totalIncome = (accounts ?? []).filter((a) => a.type === 'INCOME').reduce((s, a) => s + a.balance, 0);
  const totalExpenses = (accounts ?? []).filter((a) => a.type === 'EXPENSE').reduce((s, a) => s + a.balance, 0);
  const totalAssets = (accounts ?? []).filter((a) => a.type === 'ASSET').reduce((s, a) => s + a.balance, 0);

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'ledger',   label: 'Journal Ledger', icon: List },
    { key: 'accounts', label: 'Chart of Accounts', icon: BookOpen },
    { key: 'actions',  label: 'Manual Actions', icon: Play },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
        <p className="text-gray-500 text-sm">Double-entry ledger, chart of accounts, and manual triggers</p>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Journal Ledger
      ══════════════════════════════════════════════════════════════════ */}
      {tab === 'ledger' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
            <div className="ml-auto">
              <button
                onClick={exportCsv}
                disabled={entries.length === 0}
                className="flex items-center gap-1.5 text-sm text-indigo-600 font-medium border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors px-3 py-2 rounded-lg disabled:opacity-40 disabled:pointer-events-none"
              >
                <Download size={13} /> Export CSV
              </button>
            </div>
          </div>

          <Card>
            {ledgerLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
              </div>
            ) : entries.length === 0 ? (
              <div className="py-16 text-center">
                <List size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-gray-500 font-medium">No journal entries found</p>
                <p className="text-gray-400 text-sm mt-1">Entries are created automatically when payments and charges are posted</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Property</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => <JournalRow key={e.id} entry={e} />)}
                  </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                    <p className="text-sm text-gray-500">
                      Page {page} of {totalPages} · {ledgerTotal} entries
                    </p>
                    <div className="flex gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Chart of Accounts
      ══════════════════════════════════════════════════════════════════ */}
      {tab === 'accounts' && (
        <div className="space-y-5">
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Assets', value: totalAssets, icon: Wallet, color: 'text-blue-600' },
              { label: 'Total Income (YTD)', value: totalIncome, icon: TrendingUp, color: 'text-green-600' },
              { label: 'Total Expenses (YTD)', value: totalExpenses, icon: TrendingDown, color: 'text-red-500' },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon size={16} className={s.color} />
                  <p className="text-sm text-gray-500">{s.label}</p>
                </div>
                <p className={`text-2xl font-bold ${s.color}`}>
                  {accountsLoading ? '—' : formatCents(s.value)}
                </p>
              </div>
            ))}
          </div>

          {accountsLoading ? (
            <Card>
              <div className="p-4 space-y-2">
                {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map((type) => {
                const accts = byType[type] ?? [];
                if (accts.length === 0) return null;
                return (
                  <Card key={type}>
                    <CardHeader>
                      <h3 className="font-semibold text-gray-900">{type}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOR[type]}`}>
                        {accts.length} account{accts.length !== 1 ? 's' : ''}
                      </span>
                    </CardHeader>
                    <CardBody className="p-0">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-50">
                          <tr>
                            <th className="text-left px-5 py-2 text-xs text-gray-400 font-medium">Code</th>
                            <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">Account</th>
                            <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Total Debit</th>
                            <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Total Credit</th>
                            <th className="text-right px-5 py-2 text-xs text-gray-400 font-medium">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {accts.map((acc) => (
                            <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-2.5 font-mono text-xs text-gray-400">{acc.code}</td>
                              <td className="px-3 py-2.5 font-medium text-gray-800">{acc.name}</td>
                              <td className="px-4 py-2.5 text-right text-gray-500">{formatCents(acc.totalDebit)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-500">{formatCents(acc.totalCredit)}</td>
                              <td className={`px-5 py-2.5 text-right font-semibold ${
                                acc.balance > 0 ? 'text-gray-900' : 'text-gray-400'
                              }`}>
                                {formatCents(acc.balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Manual Actions
      ══════════════════════════════════════════════════════════════════ */}
      {tab === 'actions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign size={16} className="text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Post Monthly Rent</h3>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-500 mb-4">
                Creates rent charges for all active leases whose rent due day matches today.
                This runs automatically at midnight — use this to trigger manually.
              </p>
              <Button loading={postingRent} onClick={() => postRent()}>
                <RefreshCw size={14} /> Run Now
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingDown size={16} className="text-amber-600" />
                <h3 className="font-semibold text-gray-900">Post Late Fees</h3>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-500 mb-4">
                Posts late fees for all active leases with outstanding charges past their grace period.
                This runs automatically daily at 1:00 AM.
              </p>
              <Button
                loading={postingFees}
                variant="secondary"
                onClick={() => postFees()}
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <RefreshCw size={14} /> Run Now
              </Button>
            </CardBody>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Background Job Schedule</h3>
            </CardHeader>
            <CardBody className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Job</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Schedule</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    { name: 'Rent Charge Posting', schedule: 'Daily at 00:05', desc: 'Posts monthly rent charges for due leases', status: 'Active' },
                    { name: 'Late Fee Posting', schedule: 'Daily at 01:00', desc: 'Posts late fees for overdue charges past grace period', status: 'Active' },
                  ].map((job) => (
                    <tr key={job.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-800">{job.name}</td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">{job.schedule}</td>
                      <td className="px-5 py-3 text-gray-500">{job.desc}</td>
                      <td className="px-5 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          {job.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
