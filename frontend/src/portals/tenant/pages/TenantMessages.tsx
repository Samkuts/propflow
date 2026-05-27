import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageSquare, Send, Inbox, Plus, X, Search, CheckCheck } from 'lucide-react';
import { apiGet, apiPost, apiPatch, getErrorMessage } from '@/lib/api';
import { Card, CardBody, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
      qc.invalidateQueries({ queryKey: ['tenant-messages-sent'] });
      qc.invalidateQueries({ queryKey: ['tenant-messages-unread'] });
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg flex flex-col max-h-[92vh]">
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
              <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg">
                <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">
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
                <div className="max-h-36 overflow-y-auto">
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
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
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

// ─── Message Read Panel ───────────────────────────────────────────────────────

function MessagePanel({ message, tab, onClose }: { message: Message; tab: Tab; onClose: () => void }) {
  const person = tab === 'Inbox' ? message.sender : message.recipient;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20">
      <div className="bg-white w-full shadow-xl flex flex-col h-full">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-teal-600 text-white">
          <button onClick={onClose} className="text-teal-100 hover:text-white">
            <X size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">
              {person ? `${person.firstName} ${person.lastName}` : 'Unknown'}
            </p>
            {message.subject && <p className="text-xs text-teal-100 truncate">{message.subject}</p>}
          </div>
          <span className="text-xs text-teal-100">{formatDate(message.createdAt)}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-5 pb-24">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{message.body}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = ['Inbox', 'Sent'] as const;
type Tab = typeof TABS[number];

export default function TenantMessages() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Inbox');
  const [composing, setComposing] = useState(false);
  const [selected, setSelected] = useState<Message | null>(null);

  const { data: inbox = [], isLoading: loadingInbox } = useQuery<Message[]>({
    queryKey: ['tenant-messages-inbox'],
    queryFn: () => apiGet('/api/v1/messages/inbox'),
  });

  const { data: sent = [], isLoading: loadingSent } = useQuery<Message[]>({
    queryKey: ['tenant-messages-sent'],
    queryFn: () => apiGet('/api/v1/messages/sent'),
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['tenant-messages-unread'],
    queryFn: () => apiGet('/api/v1/messages/unread-count'),
    refetchInterval: 30_000,
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/v1/messages/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-messages-inbox'] });
      qc.invalidateQueries({ queryKey: ['tenant-messages-unread'] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: () => apiPatch('/api/v1/messages/mark-all-read', {}),
    onSuccess: () => {
      toast.success('All messages marked as read');
      qc.invalidateQueries({ queryKey: ['tenant-messages-inbox'] });
      qc.invalidateQueries({ queryKey: ['tenant-messages-unread'] });
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
      <div className="space-y-4 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Messages
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 bg-teal-600 text-white text-xs rounded-full font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Contact your property manager</p>
          </div>
          <Button onClick={() => setComposing(true)} className="!bg-teal-600 hover:!bg-teal-700">
            <Plus size={14} />
            New
          </Button>
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
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'Inbox' ? <Inbox size={14} /> : <Send size={14} />}
                {t}
                {t === 'Inbox' && unreadCount > 0 && (
                  <span className="bg-teal-100 text-teal-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}

            {tab === 'Inbox' && unreadCount > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                className="ml-auto px-3 py-2 text-xs text-gray-400 hover:text-teal-600 flex items-center gap-1"
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
          </div>

          <CardBody>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <MessageSquare size={36} className="text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">
                  {tab === 'Inbox' ? 'No messages yet' : 'No sent messages'}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {tab === 'Inbox'
                    ? 'Messages from your manager will appear here'
                    : 'Messages you send will appear here'}
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
                      className={`w-full flex items-start gap-3 px-2 py-3 text-left rounded-lg hover:bg-gray-50 transition-colors ${isUnread ? 'bg-teal-50/40' : ''}`}
                    >
                      <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-sm font-bold shrink-0">
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
                        <div className="w-2 h-2 rounded-full bg-teal-600 mt-1.5 shrink-0" />
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
      {selected && <MessagePanel message={selected} tab={tab} onClose={() => setSelected(null)} />}
    </>
  );
}
