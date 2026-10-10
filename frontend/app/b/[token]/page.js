import { headers } from "next/headers";
import { invoiceShareText, loadSharedBill } from "@/lib/invoicePreview";

export const dynamic = "force-dynamic";

const APP_TITLE = "DukanSaathi — Bill banao, stock sambhalo";
const APP_DESCRIPTION = "DukanSaathi — keyboard-first stock, billing, and udhari for local shops.";
const APP_ICON = { url: "/icon-192.png", width: 192, height: 192, alt: "DukanSaathi" };

export async function generateMetadata({ params }) {
  const { token } = await params;
  const bill = await loadSharedBill(token);
  const text = invoiceShareText(bill);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "";
  const proto = (requestHeaders.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const metadataBase = host ? new URL(`${proto}://${host}`) : undefined;
  const title = text.found ? text.title : APP_TITLE;
  const description = text.found ? text.description : APP_DESCRIPTION;

  return {
    metadataBase,
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "DukanSaathi",
      url: host ? `${proto}://${host}/b/${token}` : undefined,
      images: [APP_ICON],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [APP_ICON.url],
    },
  };
}

/** The bill screen is the client app. This page only supplies the link preview. */
export default function BillSharePage() {
  return null;
}
