import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MapPin, Bed, Bath, DollarSign, ArrowRight, Home } from 'lucide-react';
import { apiGet } from '@/lib/api';

interface Listing {
  id: string;
  unitNumber: string;
  beds?: number;
  baths?: number | string;
  sqft?: number;
  rentAmount: number;
  listingDescription?: string;
  property: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    photoUrl?: string;
    description?: string;
  };
}

function dollars(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

export default function Listings() {
  const navigate = useNavigate();

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ['public-listings'],
    queryFn: () => apiGet<Listing[]>('/listings'),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 text-white py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Home size={28} className="text-indigo-300" />
            <h1 className="text-3xl font-bold">Available Rentals</h1>
          </div>
          <p className="text-indigo-200 text-lg">
            {isLoading ? 'Loading…' : `${listings.length} unit${listings.length !== 1 ? 's' : ''} available now`}
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 h-56 animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20">
            <Home size={48} className="mx-auto text-gray-200 mb-4" />
            <p className="text-gray-500 font-medium">No units available right now.</p>
            <p className="text-gray-400 text-sm mt-1">Check back soon or contact us directly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group"
              >
                {/* Photo or placeholder */}
                {listing.property.photoUrl ? (
                  <img
                    src={listing.property.photoUrl}
                    alt={listing.property.name}
                    className="w-full h-44 object-cover"
                  />
                ) : (
                  <div className="w-full h-44 bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center">
                    <Home size={40} className="text-indigo-200" />
                  </div>
                )}

                <div className="p-5">
                  {/* Price */}
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-2xl font-bold text-gray-900">{dollars(listing.rentAmount)}</span>
                    <span className="text-gray-400 text-sm">/mo</span>
                  </div>

                  {/* Property + Unit */}
                  <p className="font-semibold text-gray-800 text-sm">
                    {listing.property.name} — Unit {listing.unitNumber}
                  </p>
                  <p className="flex items-center gap-1 text-gray-400 text-xs mt-0.5">
                    <MapPin size={11} />
                    {listing.property.address}, {listing.property.city}, {listing.property.state} {listing.property.zip}
                  </p>

                  {/* Specs */}
                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                    {listing.beds != null && (
                      <span className="flex items-center gap-1"><Bed size={13} className="text-gray-400" /> {listing.beds} bed{listing.beds !== 1 ? 's' : ''}</span>
                    )}
                    {listing.baths != null && (
                      <span className="flex items-center gap-1"><Bath size={13} className="text-gray-400" /> {listing.baths} bath{Number(listing.baths) !== 1 ? 's' : ''}</span>
                    )}
                    {listing.sqft != null && (
                      <span className="text-gray-400">{listing.sqft.toLocaleString()} sq ft</span>
                    )}
                  </div>

                  {/* Description */}
                  {listing.listingDescription && (
                    <p className="text-gray-500 text-xs mt-2 line-clamp-2">{listing.listingDescription}</p>
                  )}

                  {/* Apply button */}
                  <button
                    onClick={() => navigate(`/apply/${listing.id}`)}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white font-medium rounded-xl text-sm hover:bg-indigo-700 transition-colors group-hover:bg-indigo-700"
                  >
                    Apply Now <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
