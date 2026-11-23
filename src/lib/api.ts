// Session Bearer token held in memory (never stored in localStorage/sessionStorage)
let memoryAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  memoryAuthToken = token;
}

export function getAuthToken(): string | null {
  return memoryAuthToken;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'UniLink');
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryAuthToken) {
    headers.set('Authorization', `Bearer ${memoryAuthToken}`);
  }

  const res = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function uploadAttachment(file: File): Promise<{ url: string; name: string; mime: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('/api/uploads', {
    method: 'POST',
    body: form,
  });
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Recently';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatTimeRemaining(expiresAtIso: string): { label: string; isUrgent: boolean; isExpired: boolean } {
  const diffMs = new Date(expiresAtIso).getTime() - Date.now();
  if (diffMs <= 0) {
    return { label: 'Expired', isUrgent: false, isExpired: true };
  }
  const totalMins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const label = hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`;
  return { label, isUrgent: hrs < 3, isExpired: false };
}

export function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url.trim()) || url.trim().startsWith('/api/files/') || url.trim().startsWith('/src/assets/');
}
