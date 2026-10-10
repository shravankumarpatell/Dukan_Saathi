/** Public invoice path. The token is unguessable; the bill number is not in the URL. */

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export function isShareToken(token) {
  return TOKEN.test(String(token || ""));
}

/** null = not a share route. "" = a share route with a bad token. */
export function billShareToken(pathname) {
  const path = String(pathname || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const match = /^\/b\/([^/]+)$/.exec(path);
  if (!match) return null;
  let token = match[1];
  try {
    token = decodeURIComponent(token);
  } catch {
    return "";
  }
  return isShareToken(token) ? token : "";
}

/** Absolute https/http URL for the WhatsApp message. Empty when the token is unusable. */
export function publicBillUrl(token, origin) {
  if (!isShareToken(token)) return "";
  let base = origin == null ? "" : String(origin);
  if (!base && typeof window !== "undefined" && window.location) {
    base = window.location.origin || "";
  }
  base = base.replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) return "";
  return `${base}/b/${token}`;
}
