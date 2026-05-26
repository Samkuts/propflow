import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'MANAGER' | 'OWNER' | 'TENANT' | 'VENDOR';

interface AuthUser {
  sub: string;
  email: string;
  role: UserRole;
  managementCompanyId: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

function parseJwt(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { sub: payload.sub, email: payload.email, role: payload.role, managementCompanyId: payload.managementCompanyId };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken, user: parseJwt(accessToken) }),

      logout: () =>
        set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'pm-auth' }
  )
);
