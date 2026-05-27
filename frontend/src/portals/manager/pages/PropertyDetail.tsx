import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Building2, MapPin, Plus, Home, Wrench, FileText,
  BedDouble, Bath, Maximize2, DollarSign, Upload, Download, Trash2, X
} from 'lucide-react';
import { apiGet, apiPost, apiDelete, getErrorMessage } from '@/lib/api';
import { Card, CardBody, CardHeader, StatCard, Skeleton } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { formatCents, formatDate } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
  type: 'RESIDENTIAL' | 'COMMERCIAL' | 'HOA';
  address: string;
  city: string;
  state: string;
  zip: string;
  description?: string;
  owner?: { user: { firstName: string; lastName: string; email: string } };
  _count?: { units: number };
}

interface Tenant {
  id: string;
  user: { firstName: string; lastName: string };
}

interface Lease {
  id: string;
  status: string;
  tenants?: Tenant[];
}

interface Unit {
  id: string;
  unitNumber: string;
  beds: number;
  baths: number;
  sqft?: number;
  rentAmount: number;
  status: 'OCCUPIED' | 'VACANT' | 'UNDER_MAINTENANCE' | 'NOTICE_GIVEN';
  vacantSince?: string;
  activeLease?: Lease;
}

interface WorkOrder {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  unit?: { unitNumber: string };
}

interface PropertyDocument {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MIME_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
};
function mimeIcon(mime: string) { return MIME_ICONS[mime] ?? '📁'; }

// ─── Doc Upload Modal ────────────────────────────────────────────────────────

function DocUploadModal({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const result = await apiPost<{ uploadUrl: string; fields: Record<string, string> }>(
        '/documents/upload-url',
        {
          propertyId,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }
      );

      if (result.fields && Object.keys(result.fields).length > 0) {
        const form = new FormData();
        Object.entries(result.fields).forEach(([k, v]) => form.append(k, v));
        form.append('file', file);
        const res = await fetch(result.uploadUrl, { method: 'POST', body: form });
        if (!res.ok) throw new Error('Upload failed');
      }

      toast.success('Document uploaded');
      qc.invalidateQueries({ queryKey: ['property-docs', propertyId] });
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5">
          {file ? (
            <div className="flex items-center gap-3 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
              <span className="text-xl">{mimeIcon(file.type)}</span>
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
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
            >
              <Upload size={24} />
              <span className="text-sm">Click to select a file</span>
              <span className="text-xs">PDF, images, Word, Excel — up to 20 MB</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
          />
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!file || uploading} loading={uploading}>
            <Upload size={14} /> Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Unit Form Schema ────────────────────────────────────────────────────

const unitSchema = z.object({
  unitNumber: z.string().min(1, 'Unit number required'),
  beds: z.coerce.number().min(0, 'Required'),
  baths: z.coerce.number().min(0, 'Required'),
  sqft: z.coerce.number().optional(),
  rentAmount: z.coerce.number().min(1, 'Rent required'),
});
type UnitForm = z.infer<typeof unitSchema>;

const typeColors: Record<string, 'blue' | 'green' | 'purple'> = {
  RESIDENTIAL: 'blue',
  COMMERCIAL: 'green',
  HOA: 'purple',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'units' | 'maintenance' | 'documents'>('units');
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [showDocUpload, setShowDocUpload] = useState(false);

  // Fetch property
  const { data: property, isLoading: propLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => apiGet<Property>(`/properties/${id}`),
    enabled: !!id,
  });

  // Fetch units for this property
  const { data: unitsRaw, isLoading: unitsLoading } = useQuery({
    queryKey: ['units', id],
    queryFn: () => apiGet<Unit[] | { data: Unit[] }>(`/units?propertyId=${id}`),
    enabled: !!id,
  });
  const units: Unit[] = Array.isArray(unitsRaw)
    ? unitsRaw
    : (unitsRaw as { data: Unit[] })?.data ?? [];

  // Fetch work orders for property
  const { data: woRaw, isLoading: woLoading } = useQuery({
    queryKey: ['workorders', 'property', id],
    queryFn: () => apiGet<WorkOrder[] | { data: WorkOrder[] }>(`/maintenance?propertyId=${id}`),
    enabled: !!id && activeTab === 'maintenance',
  });
  const workOrders: WorkOrder[] = Array.isArray(woRaw)
    ? woRaw
    : (woRaw as { data: WorkOrder[] })?.data ?? [];

  // Fetch property-level documents
  const { data: docsRaw, isLoading: docsLoading } = useQuery({
    queryKey: ['property-docs', id],
    queryFn: () => apiGet<PropertyDocument[] | { data: PropertyDocument[] }>(`/documents?propertyId=${id}`),
    enabled: !!id && activeTab === 'documents',
  });
  const propertyDocs: PropertyDocument[] = Array.isArray(docsRaw)
    ? docsRaw
    : (docsRaw as { data: PropertyDocument[] })?.data ?? [];

  const { mutate: deleteDoc } = useMutation({
    mutationFn: (docId: string) => apiDelete(`/documents/${docId}`),
    onSuccess: () => {
      toast.success('Document deleted');
      qc.invalidateQueries({ queryKey: ['property-docs', id] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  async function handleDownload(docId: string, name: string) {
    try {
      const { url } = await apiGet<{ url: string }>(`/documents/${docId}/download-url`);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.target = '_blank'; a.rel = 'noopener'; a.click();
    } catch { toast.error('Could not get download link'); }
  }

  // Add unit mutation
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UnitForm>({
    resolver: zodResolver(unitSchema),
    defaultValues: { beds: 1, baths: 1 },
  });

  const { mutate: createUnit, isPending } = useMutation({
    mutationFn: (body: UnitForm) =>
      apiPost('/units', {
        ...body,
        propertyId: id,
        rentAmount: Math.round(body.rentAmount * 100), // convert dollars → cents
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units', id] });
      qc.invalidateQueries({ queryKey: ['property', id] });
      setShowUnitForm(false);
      reset();
      toast.success('Unit added');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // ── Derived stats ─────────────────────────────────────────────────────────
  const occupied = units.filter((u) => u.status === 'OCCUPIED').length;
  const vacant = units.filter((u) => u.status === 'VACANT').length;
  const monthlyRevenue = units
    .filter((u) => u.status === 'OCCUPIED')
    .reduce((sum, u) => sum + u.rentAmount, 0);

  const tabs = [
    { key: 'units', label: 'Units', icon: Home },
    { key: 'maintenance', label: 'Maintenance', icon: Wrench },
    { key: 'documents', label: 'Documents', icon: FileText },
  ] as const;

  if (propLoading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-24 text-gray-400">
        Property not found.{' '}
        <button className="text-indigo-600 underline" onClick={() => navigate('/manager/properties')}>
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Back + Header ──────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => navigate('/manager/properties')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
        >
          <ArrowLeft size={14} /> Properties
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
              <Building2 className="text-indigo-600" size={22} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
                <Badge variant={typeColors[property.type]}>{property.type}</Badge>
              </div>
              <p className="flex items-center gap-1 text-gray-400 text-sm mt-1">
                <MapPin size={13} />
                {property.address}, {property.city}, {property.state} {property.zip}
              </p>
              {property.owner && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Owner: {property.owner.user.firstName} {property.owner.user.lastName}
                </p>
              )}
            </div>
          </div>

          <Button onClick={() => setShowUnitForm(true)}>
            <Plus size={15} /> Add Unit
          </Button>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Units" value={units.length} icon={Home} color="indigo" />
        <StatCard label="Occupied" value={occupied} icon={Building2} color="green"
          sub={units.length ? `${Math.round((occupied / units.length) * 100)}% occupancy` : undefined} />
        <StatCard label="Vacant" value={vacant} icon={Building2} color="red" />
        <StatCard
          label="Monthly Revenue"
          value={formatCents(monthlyRevenue)}
          icon={DollarSign}
          color="green"
          sub="From occupied units"
        />
      </div>

      {/* ── Add Unit Form ──────────────────────────────────────────────────── */}
      {showUnitForm && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Add Unit</h2>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit((d) => createUnit(d))} className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input label="Unit #" placeholder="101" error={errors.unitNumber?.message} {...register('unitNumber')} />
                <Input label="Beds" type="number" min="0" step="1" error={errors.beds?.message} {...register('beds')} />
                <Input label="Baths" type="number" min="0" step="0.5" error={errors.baths?.message} {...register('baths')} />
                <Input label="Sqft" type="number" min="0" error={errors.sqft?.message} {...register('sqft')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Monthly Rent ($)"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="1200.00"
                  hint="Enter in dollars (e.g. 1200.00)"
                  error={errors.rentAmount?.message}
                  {...register('rentAmount')}
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" loading={isPending}>Save Unit</Button>
                <Button type="button" variant="secondary" onClick={() => { setShowUnitForm(false); reset(); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon size={15} />
              {label}
              {key === 'units' && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                  {units.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Units Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'units' && (
        <>
          {unitsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
            </div>
          ) : units.length === 0 ? (
            <div className="text-center py-16">
              <Home size={40} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-500 font-medium">No units yet</p>
              <p className="text-gray-400 text-sm mt-1">Add your first unit to this property</p>
              <Button className="mt-4" onClick={() => setShowUnitForm(true)}>
                <Plus size={15} /> Add Unit
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {units.map((unit) => (
                <Link
                  key={unit.id}
                  to={`/manager/properties/${id}/units/${unit.id}`}
                  className="block"
                >
                  <Card className="hover:shadow-md transition-shadow h-full">
                    <CardBody>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-gray-900 text-lg">Unit {unit.unitNumber}</p>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                            {unit.beds != null && (
                              <span className="flex items-center gap-0.5">
                                <BedDouble size={12} /> {unit.beds} bd
                              </span>
                            )}
                            {unit.baths != null && (
                              <span className="flex items-center gap-0.5">
                                <Bath size={12} /> {unit.baths} ba
                              </span>
                            )}
                            {unit.sqft && (
                              <span className="flex items-center gap-0.5">
                                <Maximize2 size={12} /> {unit.sqft.toLocaleString()} sqft
                              </span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={unit.status} />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-indigo-600 font-semibold">{formatCents(unit.rentAmount)}/mo</span>
                        {unit.status === 'OCCUPIED' && unit.activeLease?.tenants?.[0] && (
                          <span className="text-xs text-gray-500">
                            {unit.activeLease.tenants[0].user.firstName}{' '}
                            {unit.activeLease.tenants[0].user.lastName}
                          </span>
                        )}
                        {unit.status === 'VACANT' && unit.vacantSince && (
                          <span className="text-xs text-red-500">
                            Vacant {Math.floor(
                              (Date.now() - new Date(unit.vacantSince).getTime()) / 86400000
                            )}d
                          </span>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Maintenance Tab ────────────────────────────────────────────────── */}
      {activeTab === 'maintenance' && (
        <Card>
          <CardHeader>
            <span className="font-semibold text-gray-900">Open Work Orders</span>
          </CardHeader>
          <Table<WorkOrder>
            loading={woLoading}
            data={workOrders}
            emptyMessage="No work orders for this property"
            columns={[
              {
                key: 'priority',
                header: 'Priority',
                render: (row) => <StatusBadge status={row.priority} />,
              },
              {
                key: 'title',
                header: 'Title',
                render: (row) => <span className="font-medium text-gray-900">{row.title}</span>,
              },
              {
                key: 'unit',
                header: 'Unit',
                render: (row) => row.unit?.unitNumber ?? '—',
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusBadge status={row.status} />,
              },
              {
                key: 'createdAt',
                header: 'Submitted',
                render: (row) => formatDate(row.createdAt),
              },
            ]}
          />
        </Card>
      )}

      {/* ── Documents Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <Card>
          <CardHeader>
            <span className="font-semibold text-gray-900">Property Documents</span>
            <Button size="sm" onClick={() => setShowDocUpload(true)}>
              <Plus size={14} /> Upload
            </Button>
          </CardHeader>
          {docsLoading ? (
            <CardBody>
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
              </div>
            </CardBody>
          ) : propertyDocs.length === 0 ? (
            <CardBody>
              <div className="text-center py-10">
                <FileText size={36} className="mx-auto text-gray-200 mb-3" />
                <p className="text-gray-500 font-medium text-sm">No documents yet</p>
                <p className="text-gray-400 text-xs mt-1">
                  Upload HOA rules, property info sheets, inspection reports, and more
                </p>
                <Button className="mt-4" size="sm" onClick={() => setShowDocUpload(true)}>
                  <Upload size={14} /> Upload first document
                </Button>
              </div>
            </CardBody>
          ) : (
            <div className="divide-y divide-gray-100">
              {propertyDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-xl shrink-0">{mimeIcon(doc.mimeType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatBytes(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDownload(doc.id, doc.name)}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${doc.name}"?`)) deleteDoc(doc.id); }}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {showDocUpload && id && (
        <DocUploadModal propertyId={id} onClose={() => setShowDocUpload(false)} />
      )}
    </div>
  );
}
