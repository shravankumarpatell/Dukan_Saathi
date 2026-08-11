import React, { useState, useRef, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import * as api from "@/services/api";
import { Send, Bot, User, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
    
    // Sort products by sales volume (rough approximation using highest pending/sold invoices if we had them, for now just use standard data)
    const topProducts = app.products.slice(0, 30).map((p) => `- ${p.name} (Code: ${p.code || "-"}, Stock: ${(p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0)} ${p.unit || 'pcs'}, Price: ₹${p.sellPrice})`);
    lines.push(`Product inventory details:\n${topProducts.join("\n")}`);
    
    const totalUdhari = app.customers.reduce((s, c) => s + (c.totalPending || 0), 0);
    lines.push(`Total outstanding udhari (credit): ₹${totalUdhari}`);
    
    const todaySales = app.invoices.filter((i) => i.type === "sale" && new Date(i.date).toDateString() === new Date().toDateString());
    lines.push(`Today's sales: ${todaySales.length} bills, revenue ₹${todaySales.reduce((s, i) => s + (i.grandTotal || 0), 0)}`);
    
    lines.push(`\nSYSTEM INSTRUCTION: You are a senior business analyst for this shop. Answer the user's question accurately using ONLY the data provided above.
CRITICAL: When the user asks for analytical data (like low stock, sales summaries, or customer lists), you MUST format your response as a Markdown Table.
Never use plain text lists when a table would be better. Do not apologize, just provide the data in a crisp, professional table.`);

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

  const suggestions = ["Which products are low on stock?", "What is my total udhari?", "Show me today's sales summary", "Which items should I restock?"];

  return (
    <div className="flex h-[calc(100vh-160px)] lg:h-[calc(100vh-100px)] flex-col ds-fade" data-testid="chat-page">
      <div className="mb-2 flex items-center gap-2">
        <div className="rounded-lg bg-indigo-900 p-2 text-white dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]"><Bot className="h-4 w-4" /></div>
        <div><h2 className="font-display text-xl font-bold text-slate-900 dark:text-[#F5F5F7]">Business Intelligence</h2><p className="text-xs text-slate-400 dark:text-[#6E6E73]">AI powered · analyzes your stock, udhari & sales</p></div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl bg-white p-3 dark:bg-[#1C1C1E] md:p-6" data-testid="chat-messages">
        {messages.length === 0 && (
          <div className="mt-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-indigo-300 dark:text-[#818CF8]" />
            <p className="mt-2 text-sm text-slate-500 dark:text-[#A1A1A6]">Ask analytical questions about your business.</p>
            <div className="mt-6 grid gap-2 md:grid-cols-2">
              {suggestions.map((s) => (
                <button key={s} data-testid="chat-suggestion" onClick={() => setInput(s)} className="rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all dark:border-[#2C2C2E] dark:text-[#A1A1A6] dark:hover:border-[#6366F1] dark:hover:bg-[#2C2C2E] dark:hover:text-[#F5F5F7]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} data-testid={`chat-msg-${m.role}`} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-indigo-100 p-2 text-indigo-700 dark:bg-[#2C2C2E] dark:text-[#F5F5F7]"><Bot className="h-4 w-4" /></div>}
            
            <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-indigo-900 text-white dark:bg-[#818CF8] dark:text-[#F5F5F7]" : "bg-slate-50 text-slate-800 border border-slate-100 dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#F5F5F7]"}`}>
              {m.role === "user" ? (
                <div className="whitespace-pre-wrap">{m.content}</div>
              ) : (
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-50"
                  components={{
                    table: ({node, ...props}) => <div className="overflow-x-auto my-4 rounded-xl border border-slate-200 dark:border-[#3A3A3C] shadow-sm"><table className="w-full text-left border-collapse" {...props} /></div>,
                    thead: ({node, ...props}) => <thead className="bg-slate-100/50 dark:bg-[#1C1C1E]/50" {...props} />,
                    th: ({node, ...props}) => <th className="p-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#A1A1A6] border-b border-slate-200 dark:border-[#3A3A3C]" {...props} />,
                    td: ({node, ...props}) => <td className="p-3 border-b border-slate-100 dark:border-[#3A3A3C]/50 last:border-0" {...props} />,
                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
                    li: ({node, ...props}) => <li className="pl-1" {...props} />,
                  }}
                >
                  {m.content || "…"}
                </ReactMarkdown>
              )}
            </div>
            
            {m.role === "user" && <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-slate-200 p-2 text-slate-600 dark:bg-[#3A3A3C] dark:text-[#A1A1A6]"><User className="h-4 w-4" /></div>}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input data-testid="chat-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask a question about your business..." className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all dark:border-[#2C2C2E] dark:bg-[#1C1C1E] dark:text-[#A1A1A6] dark:placeholder-[#6E6E73] dark:focus:border-[#6366F1] dark:focus:ring-indigo-900/30" />
        <button data-testid="chat-send" onClick={send} disabled={busy} className="flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md active:scale-95 disabled:opacity-50 hover:bg-indigo-700 transition-all dark:bg-[#6366F1] dark:hover:bg-[#4F46E5]"><Send className="h-5 w-5 ml-1" /></button>
      </div>
    </div>
  );
}
