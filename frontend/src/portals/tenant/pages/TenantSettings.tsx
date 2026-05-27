import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import SettingsPage from '@/components/SettingsPage';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { apiGet, apiPatch, getErrorMessage } from '@/lib/api';

interface AutopayStatus {
  autopayEnabled: boolean;
  hasCard: boolean;
}

function AutopayCard() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<AutopayStatus>({
    queryKey: ['autopay-status'],
    queryFn: () => apiGet<AutopayStatus>('/payments/autopay-status'),
    retry: false,
  });

  const { mutate: toggle, isPending } = useMutation({
    mutationFn: (enabled: boolean) =>
      apiPatch<{ autopayEnabled: boolean }>('/payments/autopay', { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['autopay-status'] });
      toast.success(data?.autopayEnabled ? 'Autopay disabled' : 'Autopay enabled!');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <span className="font-semibold text-gray-900 flex items-center gap-2">
          <RefreshCw size={16} className="text-teal-600" />
          Autopay
        </span>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  Automatically pay rent each month
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Your saved card will be charged on your rent due date
                </p>
              </div>
              {/* Toggle switch */}
              <button
                onClick={() => data?.hasCard && toggle(!data.autopayEnabled)}
                disabled={!data?.hasCard || isPending}
                className={[
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
                  data?.autopayEnabled ? 'bg-teal-600' : 'bg-gray-200',
                  (!data?.hasCard || isPending) ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
                role="switch"
                aria-checked={data?.autopayEnabled ?? false}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0',
                    'transition duration-200 ease-in-out',
                    data?.autopayEnabled ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>

            {/* Status message */}
            {data?.autopayEnabled && (
              <p className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                ✓ Autopay is <strong>on</strong> — your balance will be charged automatically each month.
              </p>
            )}
            {!data?.hasCard && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Save a payment card on the Payments page before enabling autopay.
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function TenantSettings() {
  return (
    <div className="space-y-5">
      <SettingsPage accentClass="bg-teal-600" ringClass="focus:ring-teal-500" />
      <AutopayCard />
    </div>
  );
}
