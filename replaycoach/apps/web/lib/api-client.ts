/**
 * api-client — typed REST client using shared DTOs from @replaycoach/types.
 * All API calls go through this module — never call fetch directly in components.
 * Implementation: Phase 1.
 */

import { authClient } from './auth-client';
import { useAuthStore } from '../stores/auth-store';

const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

function formatPath(path: string): string {
  // If path doesn't start with /api/v1 or /api or /uploads, prefix it with /api/v1
  if (!path.startsWith('/api') && !path.startsWith('/uploads')) {
    return `/api/v1${path.startsWith('/') ? path : '/' + path}`;
  }
  return path;
}

function getHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Nest's default error body is `{ statusCode, message, error }` — surface
 * `message` when present so callers see the real reason (e.g. "Only the
 * session coach can manage reference videos") instead of a bare status code. */
async function throwApiError(res: Response, formattedPath: string): Promise<never> {
  let detail = '';
  try {
    const body = await res.clone().json();
    if (typeof body?.message === 'string') detail = body.message;
    else if (Array.isArray(body?.message)) detail = body.message.join(', ');
  } catch {
    // Non-JSON error body — fall back to the generic message below.
  }
  throw new Error(detail || `API error ${res.status}: ${formattedPath}`);
}

async function fetchWithAuth(path: string, options: RequestInit): Promise<Response> {
  const formattedPath = formatPath(path);
  const url = `${API_BASE_URL}${formattedPath}`;
  
  // Make the first attempt
  let res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...getHeaders(),
    },
  });

  // If unauthorized (e.g. token expired), attempt dynamic token refresh and retry
  if (res.status === 401) {
    try {
      await authClient.refresh();
      res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          ...getHeaders(),
        },
      });
    } catch (refreshErr) {
      console.error('API request failed with 401 and refresh attempt failed:', refreshErr);
    }
  }

  return res;
}

async function get<T>(path: string): Promise<T> {
  const formattedPath = formatPath(path);
  const res = await fetchWithAuth(formattedPath, {
    method: 'GET',
  });
  if (!res.ok) return throwApiError(res, formattedPath);
  return res.json() as Promise<T>;
}

async function post<TBody, TResponse>(path: string, body: TBody): Promise<TResponse> {
  const formattedPath = formatPath(path);
  const res = await fetchWithAuth(formattedPath, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) return throwApiError(res, formattedPath);
  return res.json() as Promise<TResponse>;
}

async function patch<TBody, TResponse>(path: string, body: TBody): Promise<TResponse> {
  const formattedPath = formatPath(path);
  const res = await fetchWithAuth(formattedPath, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) return throwApiError(res, formattedPath);
  return res.json() as Promise<TResponse>;
}

async function del<TResponse = unknown>(path: string): Promise<TResponse> {
  const formattedPath = formatPath(path);
  const res = await fetchWithAuth(formattedPath, { method: 'DELETE' });
  if (!res.ok) return throwApiError(res, formattedPath);
  // DELETE responses may be empty; tolerate no-body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as TResponse;
}

/**
 * Multipart form upload (e.g. video files). Cannot reuse fetchWithAuth's
 * getHeaders() — it always forces Content-Type: application/json, which
 * would strip the browser's multipart boundary. Duplicates fetchWithAuth's
 * 401-retry-once behavior instead.
 */
async function postForm<TResponse>(path: string, formData: FormData): Promise<TResponse> {
  const formattedPath = formatPath(path);
  const url = `${API_BASE_URL}${formattedPath}`;

  const authHeaders = (): Record<string, string> => {
    const token = useAuthStore.getState().accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  let res = await fetch(url, { method: 'POST', headers: authHeaders(), body: formData });

  if (res.status === 401) {
    try {
      await authClient.refresh();
      res = await fetch(url, { method: 'POST', headers: authHeaders(), body: formData });
    } catch (refreshErr) {
      console.error('Form upload failed with 401 and refresh attempt failed:', refreshErr);
    }
  }

  if (!res.ok) throw new Error(`API error ${res.status}: ${formattedPath}`);
  return res.json() as Promise<TResponse>;
}

/**
 * Multipart form upload with live upload-progress reporting. Fetch has no
 * upload-progress event, so this uses XMLHttpRequest instead — mirrors
 * postForm's 401-retry-once behavior.
 */
function postFormWithProgress<TResponse>(
  path: string,
  formData: FormData,
  onProgress?: (loaded: number, total: number) => void,
): Promise<TResponse> {
  const formattedPath = formatPath(path);
  const url = `${API_BASE_URL}${formattedPath}`;

  const authHeaders = (): Record<string, string> => {
    const token = useAuthStore.getState().accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const send = (): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      const headers = authHeaders();
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value);
      }
      if (onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(event.loaded, event.total);
          }
        };
      }
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });

  return (async () => {
    let res = await send();

    if (res.status === 401) {
      try {
        await authClient.refresh();
        res = await send();
      } catch (refreshErr) {
        console.error('Form upload failed with 401 and refresh attempt failed:', refreshErr);
      }
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`API error ${res.status}: ${formattedPath}`);
    }
    return JSON.parse(res.body) as TResponse;
  })();
}

export const apiClient = { get, post, patch, del, postForm, postFormWithProgress };

