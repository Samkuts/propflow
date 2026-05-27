import { useQuery } from '@tanstack/react-query';
import { Building2, Home, CheckCircle, Circle } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatCents } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Unit {
  id: string;
  unitNumber: string;
  status: string;
  rentAmount: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  vacantSince?: string;
}

interface Property {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  units: Unit[];
  _count: { units: number };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OwnerProperties() {
  const { data: raw, isLoading } = useQuery({
    queryKey: ['owner-properties-detail'],
    queryFn: () => apiGet<{ data: Property[] } | Property[]>('/properties'),
  });

  const properties: Property[] = Array.isArray(raw)
    ? raw
    : (raw as { data: Property[] })?.data ?? [];

  const totalUnits = properties.reduce((s, p) => s + (p.units?.length ?? p._count?.units ?? 0), 0);
  const totalOccupied = properties.reduce((s, p) => s + (p.units?.filter((u) => u.status === 'OCCUPIED').length ?? 0), 0);
  const totalRevenue = properties.reduce(
    (s, p) => s + (p.units?.filter((u) => u.status === 'OCCUPIED').reduce((ss, u) => ss + u.rentAmount, 0) ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Properties</h1>
        <p className="text-gray-500 text-sm">{properties.length} propert{properties.length !== 1 ? 'ies' : 'y'}</p>
      </div>

      {/* ── Portfolio Stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Properties" value={properties.length} icon={Building2} color="green" />
        <StatCard label="Total Units" value={totalUnits} icon={Home} color="green" />
        <StatCard
          label="Occupied"
          value={totalUnits > 0 ? `${Math.round((totalOccupied / totalUnits) * 100)}%` : '—'}
          icon={CheckCircle}
          color="green"
        />
        <StatCard label="Monthly Revenue" value={formatCents(totalRevenue)} icon={Building2} color="green" />
      </div>

      {/* ── Properties ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardBody>
                <div className="h-32 bg-gray-100 animate-pulse rounded" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : properties.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-16 text-center">
              <Building2 size={40} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-500 font-medium">No properties assigned</p>
              <p className="text-gray-400 text-sm mt-1">Contact your property manager</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {properties.map((property) => {
            const units = property.units ?? [];
            const occupied = units.filter((u) => u.status === 'OCCUPIED').length;
            const vacant = units.filter((u) => u.status === 'VACANT').length;
            const revenue = units
              .filter((u) => u.status === 'OCCUPIED')
              .reduce((s, u) => s + u.rentAmount, 0);
            const occupancyPct = units.length > 0
              ? Math.round((occupied / units.length) * 100)
              : 0;

            return (
              <Card key={property.id}>
                <CardHeader>
                  <div>
                    <h2 className="font-semibold text-gray-900">{property.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {property.address}, {property.city}, {property.state}
                    </p>
                  </div>
                  <StatusBadge status={property.type} />
                </CardHeader>
                <CardBody>
                  {/* Property stats */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {[
                      { label: 'Units', value: units.length || property._count?.units },
                      { label: 'Occupied', value: occupied, className: 'text-green-600' },
                      { label: 'Vacant', value: vacant, className: 'text-amber-600' },
                      { label: 'Revenue', value: formatCents(revenue), className: 'text-gray-900' },
                    ].map((s) => (
                      <div key={s.label} className="text-center bg-gray-50 rounded-lg py-2 px-1">
                        <p className={`text-lg font-bold ${(s as any).className ?? 'text-gray-900'}`}>{s.value}</p>
                        <p className="text-xs text-gray-400">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Occupancy bar */}
                  {units.length > 0 && (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Occupancy</span>
                        <span className="font-medium">{occupancyPct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all"
                          style={{ width: `${occupancyPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Unit list */}
                  {units.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-gray-500 mb-2">Units</p>
                      <div className="grid grid-cols-2 gap-2">
                        {units.map((unit) => (
                          <div
                            key={unit.id}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                              unit.status === 'OCCUPIED' ? 'bg-green-50' : 'bg-amber-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {unit.status === 'OCCUPIED' ? (
                                <CheckCircle size={13} className="text-green-500" />
                              ) : (
                                <Circle size={13} className="text-amber-400" />
                              )}
                              <span className="text-sm font-medium text-gray-800">
                                Unit {unit.unitNumber}
                              </span>
                            </div>
                            <span className={`text-xs font-medium ${
                              unit.status === 'OCCUPIED' ? 'text-green-700' : 'text-amber-700'
                            }`}>
                              {unit.status === 'OCCUPIED' ? formatCents(unit.rentAmount) : 'Vacant'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
