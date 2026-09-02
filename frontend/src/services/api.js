/**
 * API Client — single HTTP layer between frontend and backend.
 *
 * Every data operation goes through this module. It:
 * - Attaches the Supabase access token as Bearer authorization
 * - Provides consistent error handling
 * - Is the ONLY place that makes HTTP calls to the backend
 */

import { supabase } from "@/supabase";
import { getSessionToken } from "@/services/auth";
import { ApiError, friendlyMessage, isRetryable, parseErrorBody } from "@/services/apiError";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.REACT_APP_API_URL ||
  "http://localhost:8000/api";

/** Default per-request budget. AI calls pass their own (Gemini is slow). */
const DEFAULT_TIMEOUT_MS = 20_000;
const AI_TIMEOUT_MS = 120_000;

export { ApiError, friendlyMessage, errorMessage } from "@/services/apiError";

/** Lightweight reachability probe for the "server down" screen. */
export async function pingServer() {
  const { signal, clear } = withTimeout(null, 6000);
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  } finally {
    clear();
  }
}

/**
 * Get the current Supabase access token for authenticated requests.
 * Returns null if no user is signed in.
 */
async function getToken() {
  try {
    return await getSessionToken();
  } catch {
    // Supabase client hiccup — send the request unauthenticated; the backend
    // answers 401 and the normal flow takes over.
    return null;
  }
}

async function handleUnauthorized() {
  try {
    await supabase.auth.signOut();
  } catch {
    // Session is already unusable; the auth listener will send the user to login.
  }
}

function withTimeout(signal, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), ms);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Core fetch wrapper with auth, timeout, one safe retry, and normalized errors.
 *
 * Every failure is thrown as an {@link ApiError} with a Hinglish `message`
 * that is safe to show in a toast, plus `status`, `type`, `requestId`,
 * `isNetwork`, `isTimeout`.
 *
 * Options (besides fetch init):
 *  - timeoutMs   default 20s
 *  - retries     default 1 for GET, 0 otherwise; only network errors and
 *                502/503/504 are retried (never on 4xx, never on writes)
 */
async function request(path, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries: retriesOpt,
    signal: outerSignal,
    ...init
  } = options;
  const method = (init.method || "GET").toUpperCase();
  const retries = retriesOpt ?? (method === "GET" ? 1 : 0);

  const url = `${BASE_URL}${path}`;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const token = await getToken();
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    };
    const { signal, clear } = withTimeout(outerSignal, timeoutMs);

    let res;
    try {
      res = await fetch(url, { ...init, headers, signal });
    } catch (cause) {
      clear();
      const err = ApiError.fromFetchFailure(cause, { path, method });
      if (!err.isTimeout && outerSignal?.aborted) throw err; // caller cancelled
      if (attempt < retries && err.isNetwork) {
        attempt += 1;
        await sleep(400 * attempt);
        continue;
      }
      throw err;
    }
    clear();

    if (!res.ok) {
      const body = await parseErrorBody(res);
      const err = new ApiError({
        status: res.status,
        message: friendlyMessage(res.status, body.message),
        serverMessage: body.message,
        type: body.type,
        requestId: body.requestId || res.headers.get("x-request-id") || null,
        path,
        method,
      });
      if (res.status === 401) {
        await handleUnauthorized();
        throw err;
      }
      if (attempt < retries && isRetryable(res.status)) {
        attempt += 1;
        await sleep(600 * attempt);
        continue;
      }
      throw err;
    }

    // Handle 204 No Content
    if (res.status === 204) return null;

    try {
      return await res.json();
    } catch (cause) {
      throw new ApiError({
        status: res.status,
        message: "Server se jawab samajh nahi aaya. Dobara try karein.",
        type: "BadResponse",
        requestId: res.headers.get("x-request-id") || null,
        path,
        method,
        cause,
      });
    }
  }
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

// ── AI / Gemini (proxied through backend) ──

export async function parseCommand(transcript) {
  return request("/ai/parse-command", {
    method: "POST",
    body: JSON.stringify({ transcript }),
    timeoutMs: AI_TIMEOUT_MS,
  });
}

export async function extractStockSheet(base64, mimeType) {
  const result = await request("/ai/extract-stock", {
    method: "POST",
    body: JSON.stringify({ base64, mimeType }),
    timeoutMs: AI_TIMEOUT_MS,
  });
  if (result?.error) {
    throw new ApiError({ status: 503, message: friendlyMessage(503, result.error), serverMessage: result.error, type: result.type || "AIError", path: "/ai/extract-stock", method: "POST" });
  }
  return result;
}

/** Chat: give up if no bytes arrive for this long (Gemini stall / dead proxy). */
const CHAT_IDLE_MS = 90_000;

/**
 * Stream a shop-analyst answer from the backend (Vertex AI + ADC).
 * Yields text chunks. Result rows stay on the server (tokenized planner + local template fill).
 *
 * Throws {@link ApiError} on HTTP failure, network drop, idle timeout, or a
 * server-sent `{"error": ...}` event (the backend emits one instead of
 * cutting the connection when the analyst fails mid-answer).
 */
export async function* streamChat(messages, { signal } = {}) {
  const token = await getToken();
  const url = `${BASE_URL}/ai/chat`;
  const path = "/ai/chat";
  const controller = new AbortController();
  if (signal) signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });

  let idleTimer = null;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), CHAT_IDLE_MS);
  };
  const disarm = () => idleTimer && clearTimeout(idleTimer);

  let res;
  try {
    armIdle();
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages, systemContext: "" }),
      signal: controller.signal,
    });
  } catch (cause) {
    disarm();
    throw ApiError.fromFetchFailure(cause, { path, method: "POST" });
  }

  if (!res.ok) {
    disarm();
    const body = await parseErrorBody(res);
    const err = new ApiError({
      status: res.status,
      message: friendlyMessage(res.status, body.message),
      serverMessage: body.message,
      type: body.type,
      requestId: body.requestId || res.headers.get("x-request-id") || null,
      path,
      method: "POST",
    });
    if (res.status === 401) await handleUnauthorized();
    throw err;
  }

  const requestId = res.headers.get("x-request-id") || null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotAnyText = false;

  try {
    while (true) {
      armIdle();
      let chunk;
      try {
        chunk = await reader.read();
      } catch (cause) {
        const err = ApiError.fromFetchFailure(cause, { path, method: "POST" });
        err.requestId = requestId;
        if (gotAnyText && !err.isTimeout) {
          // Connection dropped after partial answer: surface as a soft error.
          err.message = "Jawab poora nahi aaya — connection toot gaya. Dobara poochhein.";
        }
        throw err;
      }
      const { done, value } = chunk;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        let j;
        try {
          j = JSON.parse(trimmed.slice(5));
        } catch {
          continue; // partial/garbled frame — wait for more bytes
        }
        if (j.error) {
          throw new ApiError({
            status: j.type === "UpstreamTimeout" ? 504 : 503,
            message: friendlyMessage(j.type === "UpstreamTimeout" ? 504 : 503, j.error),
            serverMessage: j.error,
            type: j.type || "AIError",
            requestId: j.requestId || requestId,
            path,
            method: "POST",
          });
        }
        if (j.text) {
          gotAnyText = true;
          yield j.text;
        }
      }
    }
  } finally {
    disarm();
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}

// ── Analytics ──

export async function getDashboardStats() {
  return request("/analytics/dashboard");
}
