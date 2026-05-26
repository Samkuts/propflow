import { cn } from '@/lib/utils';

type BadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange' | 'purple';

const variants: Record<BadgeVariant, string> = {
  green:  'bg-green-100 text-green-800',
  red:    'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  blue:   'bg-blue-100 text-blue-800',
  gray:   'bg-gray-100 text-gray-700',
  orange: 'bg-orange-100 text-orange-800',
  purple: 'bg-purple-100 text-purple-800',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'gray', children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  );
}

// Status badge helpers
const statusConfig: Record<string, { variant: BadgeVariant; label: string }> = {
  // Unit statuses
  OCCUPIED:          { variant: 'green',  label: 'Occupied' },
  VACANT:            { variant: 'gray',   label: 'Vacant' },
  UNDER_MAINTENANCE: { variant: 'yellow', label: 'Maintenance' },
  NOTICE_GIVEN:      { variant: 'orange', label: 'Notice Given' },
  // Lease statuses
  ACTIVE:            { variant: 'green',  label: 'Active' },
  PENDING:           { variant: 'blue',   label: 'Pending' },
  MONTH_TO_MONTH:    { variant: 'purple', label: 'Month-to-Month' },
  EXPIRED:           { variant: 'gray',   label: 'Expired' },
  TERMINATED:        { variant: 'red',    label: 'Terminated' },
  // Work order statuses
  SUBMITTED:         { variant: 'blue',   label: 'Submitted' },
  APPROVED:          { variant: 'purple', label: 'Approved' },
  ASSIGNED:          { variant: 'yellow', label: 'Assigned' },
  IN_PROGRESS:       { variant: 'orange', label: 'In Progress' },
  COMPLETED:         { variant: 'green',  label: 'Completed' },
  INVOICED:          { variant: 'blue',   label: 'Invoiced' },
  CLOSED:            { variant: 'gray',   label: 'Closed' },
  DENIED:            { variant: 'red',    label: 'Denied' },
  // Priority
  EMERGENCY:         { variant: 'red',    label: 'Emergency' },
  HIGH:              { variant: 'orange', label: 'High' },
  NORMAL:            { variant: 'blue',   label: 'Normal' },
  LOW:               { variant: 'gray',   label: 'Low' },
  // Payment
  OUTSTANDING:       { variant: 'red',    label: 'Outstanding' },
  PARTIAL:           { variant: 'yellow', label: 'Partial' },
  PAID:              { variant: 'green',  label: 'Paid' },
  WAIVED:            { variant: 'gray',   label: 'Waived' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { variant: 'gray' as BadgeVariant, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
