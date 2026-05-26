import { cn } from '@/lib/utils';

interface CardProps { children: React.ReactNode; className?: string; }

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('px-6 py-4 border-b border-gray-100 flex items-center justify-between', className)}>
      {children}
    </div>
  );
}

export function CardBody({ children, className }: CardProps) {
  return <div className={cn('px-6 py-4', className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'indigo',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ElementType;
  color?: string;
}) {
  return (
    <Card>
      <CardBody className="flex items-start gap-4">
        {Icon && (
          <div className={`p-2 rounded-lg bg-${color}-50 text-${color}-600`}>
            <Icon size={20} />
          </div>
        )}
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </CardBody>
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-gray-200 rounded', className)} />;
}
