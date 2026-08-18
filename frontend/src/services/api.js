/**
 * API Client — single HTTP layer between frontend and backend.
 *
 * Every data operation goes through this module. It:
 * - Attaches the Firebase ID token as Bearer authorization
 * - Provides consistent error handling
 * - Is the ONLY place that makes HTTP calls to the backend
 */

import { getAuth } from "firebase/auth";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

/**
 * Get the current Firebase ID token for authenticated requests.
 * Returns null if no user is signed in.
 */
async function getToken() {
  const user = getAuth().currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/**
 * Core fetch wrapper with auth, error handling, and JSON parsing.
 */
async function request(path, options = {}) {
  const token = await getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let errorMessage = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      errorMessage = body.error || body.detail || errorMessage;
    } catch {}
    const err = new Error(errorMessage);
    err.status = res.status;
    throw err;
  }

  // Handle 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

// ── Shop ──

export async function getShop() {
  return request("/shops/me");
}

export async function updateShop(data) {
  return request("/shops/me", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Products ──

export async function listProducts() {
  return request("/products");
}

export async function createProduct(data) {
  return request("/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProduct(id, data) {
  return request(`/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteProduct(id) {
  return request(`/products/${id}`, { method: "DELETE" });
}

export async function transferStock(productId, qty) {
  return request(`/products/${productId}/transfer`, {
    method: "POST",
    body: JSON.stringify({ qty }),
  });
}

export async function bulkImportProducts(rows) {
  return request("/products/bulk", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

// ── Invoices ──

export async function listInvoices() {
  return request("/invoices");
}

export async function getInvoice(id) {
  return request(`/invoices/${id}`);
}

export async function createBill(draft) {
  return request("/invoices", {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

// ── Customers ──

export async function listCustomers(role) {
  const q = role && role !== "all" ? `?role=${encodeURIComponent(role)}` : "";
  return request(`/customers${q}`);
}

export async function createCustomer(data) {
  return request("/customers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCustomer(id) {
  return request(`/customers/${id}`);
}

export async function allocatePayment(customerId, allocations, mode) {
  return request(`/customers/${customerId}/payment`, {
    method: "POST",
    body: JSON.stringify({ allocations, mode }),
  });
}

export async function reconcileCustomer(customerId) {
  return request(`/customers/${customerId}/reconcile`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ── Returns ──

export async function createReturn(data) {
  return request("/returns", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function convertStoreCreditReturn(invoiceId, data) {
  return request(`/returns/${invoiceId}/convert-store-credit`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Expenses ──

export async function listExpenses() {
  return request("/expenses");
}

export async function createExpense(data) {
  return request("/expenses", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── AI (OpenRouter via backend) ──

export async function parseCommand(transcript) {
  return request("/ai/parse-command", {
    method: "POST",
    body: JSON.stringify({ transcript }),
  });
}

export async function extractStockSheet(base64, mimeType) {
  return request("/ai/extract-stock", {
    method: "POST",
    body: JSON.stringify({ base64, mimeType }),
  });
}

/**
 * Stream a chat response from the backend AI proxy.
 * Yields text chunks as an async generator.
 */
export async function* streamChat(messages, systemContext) {
  const token = await getToken();
  const url = `${BASE_URL}/ai/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, systemContext }),
  });

  if (!res.ok) {
    throw new Error("Chat request failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseEvent = (line) => {
    const trimmed = (line || "").trim();
    if (!trimmed.startsWith("data:")) return null;
    try {
      return JSON.parse(trimmed.slice(5));
    } catch {
      return null;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      const j = parseEvent(line);
      if (!j) continue;
      if (j.error) throw new Error(j.error);
      if (j.text) yield j.text;
    }
  }

  buffer += decoder.decode();
  const last = parseEvent(buffer);
  if (last?.error) throw new Error(last.error);
  if (last?.text) yield last.text;
}

// ── Analytics ──

export async function getDashboardStats() {
  return request("/analytics/dashboard");
}
