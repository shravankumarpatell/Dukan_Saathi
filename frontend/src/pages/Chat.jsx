import React, { useState, useRef, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import * as api from "@/services/api";
import Kbd from "@/components/Kbd";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { usePageFocus } from "@/hooks/usePageFocus";
import { SCOPES, KEYS } from "@/lib/keymap";
import { buildShopContext } from "@/services/chat";
import { useIsPageActive } from "@/context/PageKeepAliveContext";
import { Send, Bot, User, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const IDLE_MS = 60 * 60 * 1000; // clear after 1 hour inactivity

export default function Chat() {
  const app = useApp();
  const pageActive = useIsPageActive();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const idleRef = useRef(null);
  const inputRef = useRef(null);

  const focusStart = usePageFocus(() => inputRef.current?.focus());

  const resetIdle = () => { if (idleRef.current) clearTimeout(idleRef.current); idleRef.current = setTimeout(() => setMessages([]), IDLE_MS); };
  useEffect(() => {
    if (!pageActive) {
      if (idleRef.current) clearTimeout(idleRef.current);
      return undefined;
    }
    resetIdle();
    return () => idleRef.current && clearTimeout(idleRef.current);
  }, [messages, pageActive]);
  useEffect(() => {
    if (!pageActive) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, pageActive]);

  const buildContext = () => {
    const shopData = buildShopContext({
      shop: app.shop,
      products: app.products,
      customers: app.customers,
      invoices: app.invoices,
      expenses: app.expenses,
    });
    return `${shopData}

When the user asks for analytical data (low stock, sales summaries, customer lists), format the answer as a Markdown table when a table is clearer than a list.`;
  };

  const send = async () => {
    const text = input.trim(); if (!text || busy) return;
    setInput(""); resetIdle();
    const next = [...messages, { role: "user", content: text }];
    setMessages(next); setBusy(true);

    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    try {
      const ctx = buildContext();
      let got = false;
      for await (const chunk of api.streamChat(
        next.map((m) => ({ role: m.role, content: m.content })),
        ctx
      )) {
        got = true;
        setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: c[c.length - 1].content + chunk }; return c; });
      }
      if (!got) {
        setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: "Sorry, could not get a response. Please try again." }; return c; });
      }
    } catch {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: "Sorry, could not get a response. Please try again." }; return c; });
    }
    setBusy(false);
    focusStart(0);
  };

  const suggestions = ["Which products are low on stock?", "What is my total udhari?", "Show me today's sales summary", "Which items should I restock?"];

  useHotkeyScope(SCOPES.CHAT);
  useHotkeys(SCOPES.CHAT, [
    { keys: KEYS.focusSearch, label: "Sawal likhne par jaayein", handler: () => focusStart(0) },
    { keys: "alt+k", label: "Baat-cheet saaf karein", handler: () => { setMessages([]); focusStart(0); } },
  ]);

  return (
    <div className="flex h-[calc(100vh-160px)] lg:h-[calc(100vh-100px)] flex-col ds-fade" data-testid="chat-page">
      <div className="mb-2 flex items-center gap-2">
        <div className="rounded-lg bg-indigo-900 p-2 text-white"><Bot className="h-4 w-4" /></div>
        <div className="flex-1"><h2 className="font-display text-xl font-bold text-slate-900">Business Intelligence</h2><p className="text-xs text-slate-400">AI powered · analyzes your stock, udhari &amp; sales</p></div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:text-indigo-800">
            Clear <Kbd keys="alt+k" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl bg-white p-3 md:p-6" data-testid="chat-messages">
        {messages.length === 0 && (
          <div className="mt-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-indigo-300" />
            <p className="mt-2 text-sm text-slate-500">Ask analytical questions about your business.</p>
            <div className="mt-6 grid gap-2 md:grid-cols-2">
              {suggestions.map((s) => (
                <button key={s} data-testid="chat-suggestion" onClick={() => setInput(s)} className="rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} data-testid={`chat-msg-${m.role}`} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-indigo-100 p-2 text-indigo-700"><Bot className="h-4 w-4" /></div>}
            
            <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-indigo-900 text-white" : "bg-slate-50 text-slate-800 border border-slate-100"}`}>
              {m.role === "user" ? (
                <div className="whitespace-pre-wrap">{m.content}</div>
              ) : (
                <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-50">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({node, ...props}) => <div className="overflow-x-auto my-4 rounded-xl border border-slate-200 shadow-sm"><table className="w-full text-left border-collapse" {...props} /></div>,
                    thead: ({node, ...props}) => <thead className="bg-slate-100/50" {...props} />,
                    th: ({node, ...props}) => <th className="p-3 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200" {...props} />,
                    td: ({node, ...props}) => <td className="p-3 border-b border-slate-100 last:border-0" {...props} />,
                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
                    li: ({node, ...props}) => <li className="pl-1" {...props} />,
                  }}
                >
                  {m.content || "…"}
                </ReactMarkdown>
                </div>
              )}
            </div>
            
            {m.role === "user" && <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-slate-200 p-2 text-slate-600"><User className="h-4 w-4" /></div>}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input ref={inputRef} data-testid="chat-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }} placeholder="Ask a question about your business..." className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
        <button data-testid="chat-send" onClick={send} disabled={busy} className="flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md active:scale-95 disabled:opacity-50 hover:bg-indigo-700 transition-all"><Send className="h-5 w-5 ml-1" /></button>
      </div>
    </div>
  );
}
