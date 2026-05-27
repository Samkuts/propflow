import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/store/auth.store';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retry?: boolean };

    if (error.response?.status === 401 && !original?._retry) {
      original._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }
      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
        useAuthStore.getState().setTokens(data.data.accessToken, data.data.refreshToken);
        original.headers!['Authorization'] = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);

// Typed helper that unwraps our envelope
export async function apiGet<T>(url: string, params?: object): Promise<T> {
  const { data } = await api.get<{ success: boolean; data: T }>(url, { params });
  return data.data;
}

export async function apiPost<T>(url: string, body?: object): Promise<T> {
  const { data } = await api.post<{ success: boolean; data: T }>(url, body);
  return data.data;
}

export async function apiPatch<T>(url: string, body?: object): Promise<T> {
  const { data } = await api.patch<{ success: boolean; data: T }>(url, body);
  return data.data;
}

export async function apiDelete(url: string): Promise<void> {
  await api.delete(url);
}

/** Download a binary resource (PDF, CSV, …) and trigger a browser save-as dialog. */
export async function apiDownloadBlob(url: string, fallbackFilename = 'download'): Promise<void> {
  const response = await api.get(url, { responseType: 'blob' });

  // Try to extract filename from Content-Disposition header
  const cd = response.headers['content-disposition'] as string | undefined;
  let filename = fallbackFilename;
  if (cd) {
    const match = cd.match(/filename="?([^";\n]+)"?/i);
    if (match?.[1]) filename = match[1];
  }

  const blobUrl = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error ?? error.message;
  }
  return 'An unexpected error occurred';
}
