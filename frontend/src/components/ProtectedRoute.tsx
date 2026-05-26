import { Navigate } from 'react-router-dom';
import { useAuthStore, UserRole } from '@/store/auth.store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  role: UserRole;
  loginPath: string;
}

export function ProtectedRoute({ children, role, loginPath }: ProtectedRouteProps) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken || !user) return <Navigate to={loginPath} replace />;
  if (user.role !== role) return <Navigate to={loginPath} replace />;

  return <>{children}</>;
}
