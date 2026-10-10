/** Serves the invoice file at /b/<token>/invoice.pdf so WhatsApp can preview it. */

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.REACT_APP_API_URL ||
  "http://localhost:8000/api";

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export async function GET(_request, context) {
  const params = await context.params;
  const token = String(params?.token || "");
  if (!TOKEN.test(token)) {
    return new Response("Not found", { status: 404 });
  }
  let upstream;
  try {
    upstream = await fetch(`${API}/b/${token}/invoice.pdf`, { cache: "no-store" });
  } catch {
    return new Response("Invoice unavailable", { status: 503 });
  }
  if (!upstream.ok) {
    return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });
  }
  const body = await upstream.arrayBuffer();
  const disposition = upstream.headers.get("content-disposition") || 'inline; filename="invoice.pdf"';
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
