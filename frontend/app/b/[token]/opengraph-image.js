import { ImageResponse } from "next/og";
import { invoiceShareText, loadSharedBill } from "@/lib/invoicePreview";

export const dynamic = "force-dynamic";
export const alt = "Invoice";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function Row({ left, right, size: fontSize = 26, color = "#1f2937", weight = 400 }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize, color, fontWeight: weight }}>
      <div style={{ display: "flex" }}>{left}</div>
      <div style={{ display: "flex" }}>{right}</div>
    </div>
  );
}

export default async function InvoicePreviewImage({ params }) {
  const { token } = await params;
  const bill = await loadSharedBill(token);
  const text = invoiceShareText(bill);
  const status = text.isReturn ? "RETURN" : (text.pending ? "PENDING" : "PAID");
  const statusColor = text.pending ? "#e11d48" : "#059669";
  const lines = text.items.length
    ? text.items
    : [{ name: "Invoice PDF", amount: "" }];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#efeae2", display: "flex", padding: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#ffffff", border: "1px solid #e4ddd2", padding: "36px 48px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#312e81" }}>{text.shopName}</div>
              <div style={{ display: "flex", marginTop: 14, fontSize: 20, color: "#6b7280" }}>BILL TO</div>
              <div style={{ display: "flex", fontSize: 32, color: "#111827" }}>{text.customer}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#111827" }}>{text.isReturn ? "RETURN" : "INVOICE"}</div>
              <div style={{ display: "flex", marginTop: 8, fontSize: 26, color: "#374151" }}>{text.number}</div>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 20, height: 3, background: "#312e81", width: "100%" }} />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 20, width: "100%" }}>
            {lines.map((item, index) => (
              <div key={index} style={{ display: "flex", marginBottom: 8, width: "100%" }}>
                <Row left={item.name} right={item.amount} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flex: 1 }} />
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: statusColor }}>{status}</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: 20, color: "#6b7280" }}>{text.isReturn ? "Refund" : "Grand total"}</div>
              <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#111827" }}>{text.total}</div>
              {text.pending ? (
                <div style={{ display: "flex", fontSize: 24, color: "#e11d48" }}>{`Balance ${text.balance}`}</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
