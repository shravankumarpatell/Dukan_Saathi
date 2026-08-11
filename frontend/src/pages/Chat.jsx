import React, { useState, useRef, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import * as api from "@/services/api";
import { Send, Bot, User, Sparkles } from "lucide-react";

const IDLE_MS = 60 * 60 * 1000; // clear after 1 hour inactivity

export default function Chat() {
  const app = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const idleRef = useRef(null);

  const resetIdle = () => { if (idleRef.current) clearTimeout(idleRef.current); idleRef.current = setTimeout(() => setMessages([]), IDLE_MS); };
  useEffect(() => { resetIdle(); return () => idleRef.current && clearTimeout(idleRef.current); }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const buildContext = () => {
    const lines = [];
    lines.push(`Shop: ${app.shop?.name || "DukanSaathi"}`);
    lines.push(`Products: ${app.products.length}`);
    lines.push(`Customers: ${app.customers.length}`);
    const topProducts = app.products.slice(0, 20).map((p) => `${p.name} (code: ${p.code || "-"}, stock: ${(p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0)} ${p.unit}, price: ₹${p.sellPrice})`);
    lines.push(`Product list:\n${topProducts.join("\n")}`);
    const totalUdhari = app.customers.reduce((s, c) => s + (c.totalPending || 0), 0);
    lines.push(`Total udhari: ₹${totalUdhari}`);
    const todaySales = app.invoices.filter((i) => i.type === "sale" && new Date(i.date).toDateString() === new Date().toDateString());
    lines.push(`Today's sales: ${todaySales.length} bills, revenue ₹${todaySales.reduce((s, i) => s + (i.grandTotal || 0), 0)}`);
    return lines.join("\n");
  };

  const send = async () => {
    const text = input.trim(); if (!text || busy) return;
    setInput(""); resetIdle();
    const next = [...messages, { role: "user", content: text }];
    setMessages(next); setBusy(true);

    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    try {
      const ctx = buildContext();
      for await (const chunk of api.streamChat(
        next.map((m) => ({ role: m.role, content: m.content })),
        ctx
      )) {
        setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: c[c.length - 1].content + chunk }; return c; });
      }
    } catch {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: "Sorry, could not get a response. Please try again." }; return c; });
    }
    setBusy(false);
  };

  const suggestions = ["2130 highlight ka stock kitna hai?", "Total udhari kitni hai?", "Aaj ki sale kitni hui?", "Sabse zyada kya bika?"];

  return (
    <div className="flex h-[calc(100vh-160px)] lg:h-[calc(100vh-100px)] flex-col ds-fade" data-testid="chat-page">
      <div className="mb-2 flex items-center gap-2">
        <div className="rounded-lg bg-indigo-900 p-2 text-white dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]"><Bot className="h-4 w-4" /></div>
        <div><h2 className="font-display text-xl font-bold text-slate-900 dark:text-[#F5F5F7]">Shop Assistant</h2><p className="text-xs text-slate-400 dark:text-[#6E6E73]">AI powered · knows your stock, udhari & sales</p></div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-white p-3 dark:bg-[#1C1C1E]" data-testid="chat-messages">
        {messages.length === 0 && (
          <div className="mt-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-indigo-300 dark:text-[#818CF8]" />
            <p className="mt-2 text-sm text-slate-500 dark:text-[#A1A1A6]">Shop ke baare me kuch bhi poochiye.</p>
            <div className="mt-4 grid gap-2">
              {suggestions.map((s) => <button key={s} data-testid="chat-suggestion" onClick={() => setInput(s)} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 dark:border-[#2C2C2E] dark:text-[#A1A1A6] dark:hover:bg-[#2C2C2E]">{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} data-testid={`chat-msg-${m.role}`} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-indigo-100 p-1.5 text-indigo-700 dark:bg-[#2C2C2E] dark:text-[#F5F5F7]"><Bot className="h-4 w-4" /></div>}
            <div className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-indigo-900 text-white dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]" : "bg-slate-100 text-slate-800 dark:bg-[#2C2C2E] dark:text-[#A1A1A6]"}`}>{m.content || "…"}</div>
            {m.role === "user" && <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-slate-200 p-1.5 text-slate-600 dark:bg-[#3A3A3C] dark:text-[#A1A1A6]"><User className="h-4 w-4" /></div>}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input data-testid="chat-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type your question…" className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-[#2C2C2E] dark:bg-[#1C1C1E] dark:text-[#A1A1A6] dark:placeholder-[#6E6E73]" />
        <button data-testid="chat-send" onClick={send} disabled={busy} className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-600 text-white active:scale-95 disabled:opacity-50 dark:bg-[#FB923C]"><Send className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
