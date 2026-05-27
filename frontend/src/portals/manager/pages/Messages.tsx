import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageSquare, Send, Inbox, Plus, X, Search, CheckCheck, Radio } from 'lucide-react';
import { apiGet, apiPost, apiPatch, getErrorMessage } from '@/lib/api';
import { Card, CardHeader, CardBody, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface Message {
  id: string;
  subject?: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  senderId: string;
  recipientId: string;
  sender?: User;
  recipient?: User;
}

// ─── Compose Modal ────────────────────────────────────────────────────────────

function ComposeModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');

  const { data: recipients = [] } = useQuery<User[]>({
    queryKey: ['message-recipients'],
    queryFn: () => apiGet('/api/v1/messages/recipients'),
  });

  const filtered = recipients.filter((r) =>
    `${r.firstName} ${r.lastName} ${r.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedRecipient = recipients.find((r) => r.id === recipientId);

  const mutation = useMutation({
    mutationFn: () => apiPost('/api/v1/messages', { recipientId, subject: subject || undefined, body }),
    onSuccess: () => {
      toast.success('Message sent');
      qc.invalidateQueries({ queryKey: ['messages-sent'] });
      qc.invalidateQueries({ queryKey: ['messages-unread'] });
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const roleColor: Record<string, string> = {
    MANAGER: 'bg-indigo-100 text-indigo-700',
    TENANT: 'bg-teal-100 text-teal-700',
    OWNER: 'bg-green-100 text-green-700',
    VENDOR: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">New Message</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Recipient selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">To</label>
            {selectedRecipient ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                  {selectedRecipient.firstName[0]}
                </div>
                <span className="text-sm font-medium text-gray-900 flex-1">
                  {selectedRecipient.firstName} {selectedRecipient.lastName}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleColor[selectedRecipient.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {selectedRecipient.role}
                </span>
                <button onClick={() => setRecipientId('')} className="text-gray-400 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                  <Search size={14} className="text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="flex-1 text-sm outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No users found</p>
                  ) : (
                    filtered.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => { setRecipientId(r.id); setSearch(''); }}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold shrink-0">
                          {r.firstName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{r.firstName} {r.lastName}</p>
                          <p className="text-xs text-gray-400 truncate">{r.email}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${roleColor[r.role] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.role}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Subject */}
          <Input
            label="Subject (optional)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Re: Maintenance request…"
          />

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Write your message…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!recipientId || !body.trim() || mutation.isPending}
            loading={mutation.isPending}
          >
            <Send size={14} />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Message Thread Panel ─────────────────────────────────────────────────────

function MessagePanel({ message, onClose }: { message: Message; onClose: () => void }) {
  const person = message.sender ?? message.recipient;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20">
      <div className="bg-white w-full max-w-md shadow-xl flex flex-col h-full">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 text-sm">
              {person ? `${person.firstName} ${person.lastName}` : 'Unknown'}
            </p>
            {message.subject && <p className="text-xs text-gray-400 truncate">{message.subject}</p>}
          </div>
          <span className="text-xs text-gray-400">{formatDate(message.createdAt)}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{message.body}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Broadcast Modal ──────────────────────────────────────────────────────────

interface Property { id: string; name: string; }

function BroadcastModal({ onClose }: { onClose: () => void }) {
  const [propertyId, setPropertyId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { data: propertiesRaw } = useQuery<Property[] | { data: Property[] }>({
    queryKey: ['properties-list'],
    queryFn: () => apiGet('/api/v1/properties?limit=100'),
  });
  const properties: Property[] = Array.isArray(propertiesRaw)
    ? propertiesRaw
    : (propertiesRaw as { data: Property[] })?.data ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ sent: number }>('/api/v1/messages/broadcast', {
        body,
        subject: subject || undefined,
        propertyId: propertyId || undefined,
      }),
    onSuccess: (data) => {
      toast.success(`Broadcast sent to ${data.sent} tenant${data.sent !== 1 ? 's' : ''}`);
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-indigo-600" />
            <h2 className="font-semibold text-gray-900">Broadcast Message</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Scope selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Send to</label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All active tenants (company-wide)</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>Tenants at {p.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Only tenants with an active or month-to-month lease will receive this message.
            </p>
          </div>

          {/* Subject */}
          <Input
            label="Subject (optional)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Important notice…"
          />

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Write your broadcast message…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <Radio size={14} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              This will send an individual in-app message to each matching tenant (up to 500). It cannot be recalled once sent.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!body.trim() || mutation.isPending}
            loading={mutation.isPending}
          >
            <Radio size={14} />
            Send Broadcast
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = ['Inbox', 'Sent'] as const;
type Tab = typeof TABS[number];

export default function Messages() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Inbox');
  const [composing, setComposing] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [selected, setSelected] = useState<Message | null>(null);

  const { data: inbox = [], isLoading: loadingInbox } = useQuery<Message[]>({
    queryKey: ['messages-inbox'],
    queryFn: () => apiGet('/api/v1/messages/inbox'),
  });

  const { data: sent = [], isLoading: loadingSent } = useQuery<Message[]>({
    queryKey: ['messages-sent'],
    queryFn: () => apiGet('/api/v1/messages/sent'),
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['messages-unread'],
    queryFn: () => apiGet('/api/v1/messages/unread-count'),
    refetchInterval: 30_000,
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/v1/messages/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages-inbox'] });
      qc.invalidateQueries({ queryKey: ['messages-unread'] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: () => apiPatch('/api/v1/messages/mark-all-read', {}),
    onSuccess: () => {
      toast.success('All messages marked as read');
      qc.invalidateQueries({ queryKey: ['messages-inbox'] });
      qc.invalidateQueries({ queryKey: ['messages-unread'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  function openMessage(msg: Message) {
    setSelected(msg);
    if (tab === 'Inbox' && !msg.isRead) {
      markReadMut.mutate(msg.id);
    }
  }

  const messages = tab === 'Inbox' ? inbox : sent;
  const isLoading = tab === 'Inbox' ? loadingInbox : loadingSent;
  const unreadCount = unreadData?.count ?? 0;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              Messages
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-600 text-white text-xs rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-1">In-app messaging with tenants, owners, and vendors</p>
          </div>
          <div className="flex gap-2">
            {tab === 'Inbox' && unreadCount > 0 && (
              <Button variant="secondary" onClick={() => markAllMut.mutate()} loading={markAllMut.isPending}>
                <CheckCheck size={14} />
                Mark all read
              </Button>
            )}
            <Button variant="secondary" onClick={() => setBroadcasting(true)}>
              <Radio size={14} />
              Broadcast
            </Button>
            <Button onClick={() => setComposing(true)}>
              <Plus size={14} />
              Compose
            </Button>
          </div>
        </div>

        <Card>
          {/* Tabs */}
          <div className="border-b border-gray-100 px-1 pt-1 flex">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === t
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'Inbox' ? <Inbox size={14} /> : <Send size={14} />}
                {t}
                {t === 'Inbox' && unreadCount > 0 && (
                  <span className="bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <CardBody>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <MessageSquare size={40} className="text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">
                  {tab === 'Inbox' ? 'Your inbox is empty' : 'No sent messages'}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {tab === 'Inbox' ? 'Messages from tenants and owners will appear here' : 'Messages you send will appear here'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {messages.map((msg) => {
                  const person = tab === 'Inbox' ? msg.sender : msg.recipient;
                  const isUnread = tab === 'Inbox' && !msg.isRead;

                  return (
                    <button
                      key={msg.id}
                      onClick={() => openMessage(msg)}
                      className={`w-full flex items-start gap-3 px-2 py-3 text-left rounded-lg hover:bg-gray-50 transition-colors ${isUnread ? 'bg-indigo-50/50' : ''}`}
                    >
                      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold shrink-0">
                        {person?.firstName?.[0] ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                            {person ? `${person.firstName} ${person.lastName}` : 'Unknown'}
                          </p>
                          <span className="text-xs text-gray-400 shrink-0">{formatDate(msg.createdAt)}</span>
                        </div>
                        {msg.subject && (
                          <p className={`text-xs ${isUnread ? 'font-medium text-gray-700' : 'text-gray-500'} truncate`}>
                            {msg.subject}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 truncate mt-0.5">{msg.body}</p>
                      </div>
                      {isUnread && (
                        <div className="w-2 h-2 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {composing && <ComposeModal onClose={() => setComposing(false)} />}
      {broadcasting && <BroadcastModal onClose={() => setBroadcasting(false)} />}
      {selected && <MessagePanel message={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
