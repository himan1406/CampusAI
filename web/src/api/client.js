export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export async function request(path, options = {}, token = null) {
  const headers = { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: 'include'
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiError = payload.error;
    const fieldMessage = apiError?.fieldErrors ? Object.values(apiError.fieldErrors).flat().find(Boolean) : null;
    const message = typeof apiError === 'string' ? apiError : apiError?.message || fieldMessage || apiError?.formErrors?.[0] || `Request failed (${response.status})`;
    const error = new Error(message); error.status = response.status; throw error;
  }
  return payload;
}
