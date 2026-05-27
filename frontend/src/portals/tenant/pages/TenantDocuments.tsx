import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileText, Upload, Download, Trash2, Plus, X, ClipboardList, CheckSquare, PenLine } from 'lucide-react';
import { apiGet, apiPost, apiDelete, getErrorMessage } from '@/lib/api';
import { Card, CardHeader, CardBody, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Document {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface MyLease {
  tenant: { id: string };
  lease: { id: string } | null;
}

interface InspectionReport {
  id: string;
  type: string;
  conductedAt: string;
  overallCondition: string;
  notes?: string;
  items: Array<{ room: string; condition: string; notes?: string }>;
  signedByTenant: boolean;
  signedAt?: string;
  tenantSignature?: string;
}

// ─── Inspection Sign Modal ─────────────────────────────────────────────────────

function SignInspectionModal({
  inspection,
  leaseId,
  onClose,
}: {
  inspection: InspectionReport;
  leaseId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [signature, setSignature] = useState('');

  const signMutation = useMutation({
    mutationFn: () =>
      apiPost(`/leases/${leaseId}/inspections/${inspection.id}/sign`, { signature }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-inspections', leaseId] });
      toast.success('Inspection signed successfully');
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const CONDITION_COLORS: Record<string, string> = {
    EXCELLENT: 'text-green-700',
    GOOD: 'text-blue-700',
    FAIR: 'text-yellow-700',
    POOR: 'text-red-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Sign Inspection Report</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{inspection.type.replace(/_/g, ' ')} · {new Date(inspection.conductedAt).toLocaleDateString()}</span>
            <span className={`font-semibold ${CONDITION_COLORS[inspection.overallCondition]}`}>{inspection.overallCondition}</span>
          </div>

          {inspection.notes && (
            <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{inspection.notes}</p>
          )}

          <div className="max-h-48 overflow-y-auto space-y-1">
            {(inspection.items as Array<{ room: string; condition: string; notes?: string }>).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg hover:bg-gray-50">
                <span className="text-gray-700">{item.room}</span>
                <span className={`font-medium text-xs ${CONDITION_COLORS[item.condition] ?? 'text-gray-500'}`}>{item.condition}</span>
              </div>
            ))}
          </div>

          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type your full name to sign
            </label>
            <input
              type="text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Your full legal name"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              By signing, you acknowledge you have reviewed this inspection report.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={() => signMutation.mutate()}
            disabled={signMutation.isPending || signature.trim().length < 2}
            className="flex-1 py-2.5 bg-teal-600 text-white font-medium rounded-lg text-sm hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {signMutation.isPending ? 'Signing…' : 'Sign Report'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MIME_ICON: Record<string, string> = {
  'application/pdf': '📄',
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'image/gif': '🖼️',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
};

function fileIcon(mime: string) {
  return MIME_ICON[mime] ?? '📁';
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ leaseId, onClose }: { leaseId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      // Step 1: get presigned upload URL
      const uploadResult = await apiPost('/api/v1/documents/upload-url', {
        leaseId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      }) as { uploadUrl: string; fields: Record<string, string>; document: Document };
      const { uploadUrl, fields } = uploadResult;

      // Step 2: upload to S3 (or local fallback)
      if (fields && Object.keys(fields).length > 0) {
        // Real S3: POST multipart/form-data
        const form = new FormData();
        Object.entries(fields).forEach(([k, v]) => form.append(k, v));
        form.append('file', file);
        const res = await fetch(uploadUrl, { method: 'POST', body: form });
        if (!res.ok) throw new Error('Upload failed');
      }
      // Local dev fallback: file stays in memory, doc record already created

      toast.success('Document uploaded');
      qc.invalidateQueries({ queryKey: ['tenant-documents', leaseId] });
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Upload Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* File picker */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">File</label>
            {file ? (
              <div className="flex items-center gap-3 px-3 py-2 bg-teal-50 border border-teal-200 rounded-xl">
                <span className="text-xl">{fileIcon(file.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                </div>
                <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-teal-400 hover:text-teal-500 transition-colors"
              >
                <Upload size={24} />
                <span className="text-sm">Click to select a file</span>
                <span className="text-xs">PDF, images, Word, Excel — up to 25 MB</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx"
            />
          </div>

        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            loading={uploading}
            className="bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
          >
            <Upload size={14} />
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantDocuments() {
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [signTarget, setSignTarget] = useState<InspectionReport | undefined>();

  // Get lease ID from the my-lease endpoint
  const { data: myLease, isLoading: leaseLoading } = useQuery<MyLease>({
    queryKey: ['my-lease'],
    queryFn: () => apiGet('/api/v1/leases/my-lease'),
  });

  const leaseId = myLease?.lease?.id;

  const { data: documents = [], isLoading: docsLoading } = useQuery<Document[]>({
    queryKey: ['tenant-documents', leaseId],
    queryFn: () => apiGet(`/api/v1/documents?leaseId=${leaseId}`),
    enabled: !!leaseId,
  });

  const { data: inspections = [] } = useQuery<InspectionReport[]>({
    queryKey: ['tenant-inspections', leaseId],
    queryFn: () => apiGet(`/leases/${leaseId}/inspections`),
    enabled: !!leaseId,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/documents/${id}`),
    onSuccess: () => {
      toast.success('Document removed');
      qc.invalidateQueries({ queryKey: ['tenant-documents', leaseId] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  async function handleDownload(docId: string, name: string) {
    try {
      const { url } = await apiGet(`/api/v1/documents/${docId}/download-url`) as { url: string };
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    } catch (err) {
      toast.error('Could not get download link');
    }
  }

  const isLoading = leaseLoading || docsLoading;

  return (
    <>
      <div className="space-y-4 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Documents</h1>
          {leaseId && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 bg-teal-600 text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              <Plus size={14} />
              Upload
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : !leaseId ? (
          <Card>
            <CardBody>
              <div className="flex flex-col items-center py-12 text-center">
                <FileText size={36} className="text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No active lease found</p>
                <p className="text-gray-400 text-sm mt-1">Documents will be available once you have an active lease</p>
              </div>
            </CardBody>
          </Card>
        ) : documents.length === 0 ? (
          <Card>
            <CardBody>
              <div className="flex flex-col items-center py-12 text-center">
                <FileText size={36} className="text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No documents yet</p>
                <p className="text-gray-400 text-sm mt-1">Upload your lease agreement, move-in checklist, and other documents here</p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="mt-4 flex items-center gap-1.5 bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors"
                >
                  <Upload size={14} />
                  Upload first document
                </button>
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <Card key={doc.id}>
                <div className="flex items-center gap-3 p-4">
                  <div className="text-2xl shrink-0">{fileIcon(doc.mimeType)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{formatBytes(doc.sizeBytes)}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{formatDate(doc.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDownload(doc.id, doc.name)}
                      className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${doc.name}"?`)) deleteMut.mutate(doc.id);
                      }}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Inspection Reports ─────────────────────────────────────────────── */}
      {leaseId && inspections.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
              <ClipboardList size={15} /> Inspection Reports
            </h2>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-gray-100">
              {inspections.map((insp) => (
                <li key={insp.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{insp.type.replace(/_/g, ' ')} Inspection</p>
                    <p className="text-xs text-gray-400">{new Date(insp.conductedAt).toLocaleDateString()} · Overall: <span className="font-medium">{insp.overallCondition}</span></p>
                  </div>
                  {insp.signedByTenant ? (
                    <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium shrink-0">
                      <CheckSquare size={14} />
                      Signed {insp.signedAt ? new Date(insp.signedAt).toLocaleDateString() : ''}
                    </div>
                  ) : (
                    <button
                      onClick={() => setSignTarget(insp)}
                      className="flex items-center gap-1.5 text-xs font-medium text-teal-600 border border-teal-200 px-2.5 py-1.5 rounded-lg hover:bg-teal-50 transition-colors shrink-0"
                    >
                      <PenLine size={13} /> Review &amp; Sign
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {showUpload && leaseId && (
        <UploadModal leaseId={leaseId} onClose={() => setShowUpload(false)} />
      )}
      {signTarget && leaseId && (
        <SignInspectionModal
          inspection={signTarget}
          leaseId={leaseId}
          onClose={() => setSignTarget(undefined)}
        />
      )}
    </>
  );
}
