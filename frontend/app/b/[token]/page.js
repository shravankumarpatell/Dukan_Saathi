import { headers } from "next/headers";
import { invoiceShareText, loadSharedBill } from "@/lib/invoicePreview";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { token } = await params;
  const bill = await loadSharedBill(token);
  const text = invoiceShareText(bill);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "";
  const proto = (requestHeaders.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const metadataBase = host ? new URL(`${proto}://${host}`) : undefined;

  return {
    metadataBase,
    title: { absolute: text.found ? text.title : "Invoice" },
    description: text.found ? text.description : "Open the link to view this invoice.",
    robots: { index: false, follow: false },
    openGraph: {
      title: text.found ? text.title : "Invoice",
      description: text.found ? text.description : "Open the link to view this invoice.",
      type: "website",
      siteName: text.found ? text.shopName : "Invoice",
      url: host ? `${proto}://${host}/b/${token}` : undefined,
    },
  };
}

/** The bill screen is the client app. This page only supplies the link preview. */
export default function BillSharePage() {
  return null;
}
