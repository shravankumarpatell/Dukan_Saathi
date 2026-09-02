/**
 * Normalized API error + Hinglish copy. Pure module (no fetch) so it is unit-testable.
 *
 * Backend JSON shape: { error, type, requestId, detail? }
 */

export const GENERIC_MESSAGE = "Kuch gadbad ho gayi. Dobara try karein.";
export const OFFLINE_MESSAGE = "Internet nahi hai. Connection check karke dobara try karein.";
export const TIMEOUT_MESSAGE = "Server se jawab aane mein der ho rahi hai. Dobara try karein.";
export const SERVER_DOWN_MESSAGE = "Server abhi available nahi hai. Thodi der baad dobara try karein.";

export class ApiError extends Error {
  constructor({
    status = 0,
    message = GENERIC_MESSAGE,
    serverMessage = null,
    type = null,
    requestId = null,
    path = "",
    method = "GET",
    isNetwork = false,
    isTimeout = false,
    cause = undefined,
  } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.serverMessage = serverMessage;
    this.type = type;
    this.requestId = requestId;
    this.path = path;
    this.method = method;
    this.isNetwork = isNetwork;
    this.isTimeout = isTimeout;
    if (cause !== undefined) this.cause = cause;
  }

  /** Not the user's fault and worth a retry button. */
  get isRetryable() {
    return this.isNetwork || this.isTimeout || isRetryable(this.status);
  }

  static fromFetchFailure(cause, { path = "", method = "GET" } = {}) {
    const name = cause?.name || "";
    const isTimeout = name === "TimeoutError" || (name === "AbortError" && cause?.message === "timeout");
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (isTimeout) {
      return new ApiError({ status: 0, message: TIMEOUT_MESSAGE, type: "Timeout", path, method, isNetwork: true, isTimeout: true, cause });
    }
    if (name === "AbortError") {
      return new ApiError({ status: 0, message: "Request cancel ho gayi.", type: "Aborted", path, method, cause });
    }
    return new ApiError({
      status: 0,
      message: offline ? OFFLINE_MESSAGE : SERVER_DOWN_MESSAGE,
      type: offline ? "Offline" : "NetworkError",
      path,
      method,
      isNetwork: true,
      cause,
    });
  }
}

export function isRetryable(status) {
  return status === 502 || status === 503 || status === 504 || status === 429;
}

/**
 * Map an HTTP status (+ optional server message) to what the shopkeeper sees.
 * Server messages for 4xx are business errors written for the user (e.g.
 * "Stock kam hai…") — show them. For 5xx we trust the backend's Hinglish
 * `error` when present, otherwise fall back to a generic line.
 */
export function friendlyMessage(status, serverMessage) {
  const msg = typeof serverMessage === "string" ? serverMessage.trim() : "";
  const looksTechnical = /traceback|exception|sqlalchemy|psycopg|internal server error|nonetype|keyerror|typeerror/i.test(msg);
  if (status === 401) return "Session khatam ho gayi. Dobara login karein.";
  if (status === 403) return "Is kaam ki permission nahi hai.";
  if (status === 404) return msg && !looksTechnical ? msg : "Yeh record nahi mila.";
  if (status === 409) return msg && !looksTechnical ? msg : "Yeh pehle se maujood hai.";
  if (status === 413) return "File bahut badi hai. Chhoti file bhejein.";
  if (status === 429) return "Bahut request ho gayi. Ek minute ruk kar try karein.";
  if (status >= 400 && status < 500) return msg && !looksTechnical ? msg : "Input sahi nahi hai. Check karke dobara try karein.";
  if (status === 504) return msg && !looksTechnical ? msg : TIMEOUT_MESSAGE;
  if (status === 502 || status === 503) return msg && !looksTechnical ? msg : SERVER_DOWN_MESSAGE;
  if (status >= 500) return msg && !looksTechnical ? msg : "Server mein kuch gadbad ho gayi. Thodi der baad dobara try karein.";
  return msg && !looksTechnical ? msg : GENERIC_MESSAGE;
}

/** Read {error|detail|message, type, requestId} from a failed response without throwing. */
export async function parseErrorBody(res) {
  let message = null;
  let type = null;
  let requestId = null;
  try {
    const text = await res.text();
    if (text) {
      try {
        const body = JSON.parse(text);
        type = body.type || null;
        requestId = body.requestId || null;
        const raw = body.error ?? body.detail ?? body.message;
        if (typeof raw === "string") message = raw;
        else if (Array.isArray(raw)) message = raw.map((e) => e?.msg || String(e)).join("; ");
        else if (raw && typeof raw === "object") message = raw.error || raw.message || raw.detail || null;
      } catch {
        // Non-JSON body (proxy HTML page etc.) — keep the status-based message.
        if (!/<html/i.test(text)) message = text.slice(0, 200);
      }
    }
  } catch {
    // body unreadable
  }
  return { message, type, requestId };
}

/** Turn anything thrown anywhere into a toast-safe string. */
export function errorMessage(err, fallback = GENERIC_MESSAGE) {
  if (!err) return fallback;
  if (err instanceof ApiError) return err.message || fallback;
  if (typeof err === "string") return err;
  const m = err.message || "";
  if (!m || /failed to fetch|networkerror|load failed/i.test(m)) {
    return typeof navigator !== "undefined" && navigator.onLine === false ? OFFLINE_MESSAGE : SERVER_DOWN_MESSAGE;
  }
  if (/traceback|exception|undefined|null|is not a function|cannot read/i.test(m)) return fallback;
  return m;
}
