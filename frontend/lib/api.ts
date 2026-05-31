export const API_BASE = "/api-proxy";

export type Product = {
  id: number;
  sku: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductPage = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
};

export type ImportJob = {
  id: string;
  filename: string;
  status: "queued" | "running" | "complete" | "failed";
  stage: string;
  total_rows: number;
  processed_rows: number;
  error: string | null;
};

export type Webhook = {
  id: number;
  url: string;
  events: string[];
  enabled: boolean;
  last_status_code: number | null;
  last_response_ms: number | null;
  last_error: string | null;
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch {
      // Keep status text if the response has no JSON body.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}
