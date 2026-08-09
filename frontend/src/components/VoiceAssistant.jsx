import React, { useState, useCallback, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { useSpeech, speak } from "@/hooks/useSpeech";
import { parseCommand } from "@/services/gemini";
import { matchProduct, matchCustomer } from "@/lib/fuzzy";
import { money, todayISO } from "@/lib/calc";
import { Mic, Loader2, X } from "lucide-react";

// Push-to-talk voice assistant. Every mutating command becomes a DRAFT (never a direct write).
export default function VoiceAssistant() {
  const app = useApp();
  const { products, customers, invoices, setDraft } = app;
  const { listening, transcript, supported, start, stop } = useSpeech();
  const [thinking, setThinking] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [ask, setAsk] = useState(null); // ask-back on ambiguity

  const handleResult = useCallback(async (finalText) => {
    setThinking(true);
    setAnswer(null); setAsk(null);
    try {
      const parsed = await parseCommand(finalText);
      await route(parsed, finalText);
    } catch (e) {
      speak("Kuch samajh nahi aaya, dobara boliye.");
      setAnswer({ text: "Samajh nahi aaya. Dobara try karein.", tone: "err" });
    }
    setThinking(false);
  }, [products, customers, invoices]);

  const route = async (parsed, finalText) => {
    const lang = parsed.language || "hi";
    const en = lang === "en";
    const ent = parsed.entities || {};

    const findProduct = () => {
      const m = matchProduct(products, ent.product);
      if (m.matches.length > 1 && m.ambiguous) {
        setAsk({ text: `Kaunsa? ${m.matches.slice(0, 3).map((p) => p.name).join(" ya ")}?`, options: m.matches.slice(0, 3), type: "product", parsed });
        speak(`Kaunsa? ${m.matches.slice(0, 2).map((p) => p.name).join(" ya ")}?`);
        return { ambiguous: true };
      }
      return { product: m.best };
    };

    switch (parsed.intent) {
      case "stock_query": {
        const r = findProduct();
        if (r.ambiguous) return;
        if (!r.product) return sayNotFound("product", en);
        const total = (r.product.showroomQty || 0) + (r.product.godownQty || 0);
        const msg = en
          ? `${r.product.name}: ${total} ${r.product.unit} in stock (${r.product.showroomQty} showroom, ${r.product.godownQty} godown).`
          : `${r.product.name} ka ${total} ${r.product.unit} stock bacha hai. Showroom ${r.product.showroomQty}, godown ${r.product.godownQty}.`;
        speak(msg); setAnswer({ text: msg, tone: "ok" }); return;
      }
      case "udhari_query": {
        const m = matchCustomer(customers, ent.customer);
        if (!m.best) return sayNotFound("customer", en);
        const msg = en ? `${m.best.name} pending balance is ${money(m.best.totalPending)}.` : `${m.best.name} ka ${money(m.best.totalPending)} udhari baaki hai.`;
        speak(msg); setAnswer({ text: msg, tone: m.best.totalPending > 0 ? "warn" : "ok" }); return;
      }
      case "buyers_query": {
        const r = findProduct();
        if (r.ambiguous) return;
        if (!r.product) return sayNotFound("product", en);
        const today = new Date().toDateString();
        const buyers = invoices.filter((iv) => iv.type === "sale" && iv.items.some((it) => it.productId === r.product.id))
          .map((iv) => iv.customerName + " (" + new Date(iv.date).toLocaleDateString("en-IN") + ")");
        const msg = buyers.length ? `${r.product.name}: ${buyers.slice(0, 5).join(", ")}.` : `Abhi tak koi record nahi ${r.product.name} ke liye.`;
        speak(buyers.length ? `${r.product.name} ${buyers.slice(0, 3).join(", ")} ne liya.` : msg);
        setAnswer({ text: msg, tone: "ok" }); return;
      }
      case "topseller_query": {
        const map = {};
        invoices.filter((i) => i.type === "sale").forEach((iv) => iv.items.forEach((it) => { map[it.name] = (map[it.name] || 0) + (Number(it.qty) || 0); }));
        const top = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const msg = top.length ? `Top sellers: ${top.map(([n, q]) => `${n} (${q})`).join(", ")}.` : "Abhi koi sale record nahi.";
        speak(top.length ? `Sabse zyada bika ${top[0][0]}.` : msg); setAnswer({ text: msg, tone: "ok" }); return;
      }
      case "sale":
      case "purchase": {
        const r = findProduct();
        if (r.ambiguous) return;
        if (!r.product) return sayNotFound("product", en);
        const qty = Number(ent.qty) || 1;
        const rate = parsed.intent === "sale" ? r.product.sellPrice : r.product.costPrice;
        const cust = parsed.intent === "sale" ? matchCustomer(customers, ent.customer).best : null;
        const grand = qty * rate;
        const payMode = ent.mode || "cash";
        const payments = parsed.intent === "sale" && payMode !== "pending" ? [{ mode: payMode === "online" ? "online" : "cash", amount: grand }] : [];
        setDraft({
          kind: parsed.intent, type: parsed.intent, language: lang, createdVia: "voice",
          items: [{ productId: r.product.id, name: r.product.name, qty, unit: r.product.unit, rate, amount: grand }],
          discount: null, gstEnabled: !!app.shop?.gstEnabled, gstRate: 18,
          customerId: cust?.id || null, customerName: cust?.name || ent.customer || (parsed.intent === "sale" ? "Walk-in" : "Supplier"),
          payments, date: todayISO(),
        });
        speak(en ? "Please review the bill." : "Bill dekhiye aur confirm kariye.");
        return;
      }
      case "payment": {
        const m = matchCustomer(customers, ent.customer);
        if (!m.best) return sayNotFound("customer", en);
        const amount = Number(ent.amount) || 0;
        setDraft({
          kind: "payment", language: lang, customerId: m.best.id, amount, mode: ent.mode || "cash",
          title: "Record Payment", subtitle: `${m.best.name} · ${ent.mode || "cash"}`,
          summaryRows: [{ label: "Pending balance", old: money(m.best.totalPending), new: money(Math.max(0, (m.best.totalPending || 0) - amount)) }],
          amount,
        });
        speak(en ? "Confirm the payment." : "Payment confirm kariye.");
        return;
      }
      case "return": {
        const r = findProduct();
        if (r.ambiguous) return;
        const qty = Number(ent.qty) || 1;
        const cust = matchCustomer(customers, ent.customer).best;
        const refundValue = r.product ? qty * r.product.sellPrice : 0;
        setDraft({
          kind: "return", language: lang, createdVia: "voice",
          productId: r.product?.id, productName: r.product?.name || ent.product, qty,
          customerId: cust?.id, customerName: cust?.name || ent.customer, settlement: "cash", refundValue,
          title: "Record Return", subtitle: `${r.product?.name || ent.product} × ${qty}`,
          summaryRows: [
            { label: "Stock restored", new: `+${qty} ${r.product?.unit || ""}` },
            { label: "Settlement", new: "Cash refund" },
          ],
          amount: refundValue,
        });
        speak(en ? "Confirm the return." : "Return confirm kariye.");
        return;
      }
      default:
        speak(en ? "I didn't get that." : "Samajh nahi aaya, dobara boliye.");
        setAnswer({ text: `"${finalText}" — samajh nahi aaya.`, tone: "err" });
    }
  };

  const sayNotFound = (what, en) => {
    const msg = en ? `No matching ${what} found.` : `Koi ${what === "product" ? "product" : "customer"} nahi mila.`;
    speak(msg); setAnswer({ text: msg, tone: "err" });
  };

  const toggle = useCallback(() => {
    if (listening) { stop(); return; }
    setAnswer(null); setAsk(null);
    start(handleResult);
  }, [listening, stop, start, handleResult]);

  // Allow the mobile bottom-nav mic to trigger the same assistant.
  useEffect(() => {
    const h = () => toggle();
    window.addEventListener("ds:voice-toggle", h);
    return () => window.removeEventListener("ds:voice-toggle", h);
  }, [toggle]);

  if (!supported) return null;

  return (
    <>
      {/* Live transcript / answer floating bar */}
      {(listening || thinking || transcript || answer || ask) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4">
          <div className="pointer-events-auto max-w-md rounded-2xl bg-slate-900/85 px-4 py-3 text-white shadow-2xl backdrop-blur-md" data-testid="voice-transcript-bar">
            {listening && <p className="text-xs uppercase tracking-widest text-orange-300">Sun raha hoon…</p>}
            {thinking && <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-indigo-300"><Loader2 className="h-3 w-3 animate-spin" /> Soch raha hoon…</p>}
            {transcript && <p className="mt-1 text-sm font-medium">{transcript}</p>}
            {answer && <p className={`mt-1 text-sm font-semibold ${answer.tone === "err" ? "text-rose-300" : answer.tone === "warn" ? "text-amber-300" : "text-emerald-300"}`}>{answer.text}</p>}
            {ask && (
              <div className="mt-2 flex flex-wrap gap-2">
                {ask.options.map((o) => (
                  <button key={o.id} data-testid={`ask-option-${o.id}`} onClick={() => { setAsk(null); route({ ...ask.parsed, entities: { ...ask.parsed.entities, product: o.name } }, o.name); }}
                    className="rounded-full bg-orange-500 px-3 py-1 text-xs font-bold active:scale-95">{o.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Push-to-talk FAB (desktop; mobile uses the bottom-nav mic) */}
      <button
        data-testid="voice-mic-button"
        onClick={toggle}
        className={`fixed bottom-8 right-8 z-50 hidden h-16 w-16 items-center justify-center rounded-full text-white shadow-xl ring-4 ring-orange-600/30 transition-transform active:scale-95 md:flex ${listening ? "ds-listening scale-105 bg-orange-500" : "bg-orange-600 hover:bg-orange-500"}`}
        aria-label="Push to talk"
      >
        {listening ? <X className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
      </button>
    </>
  );
}
