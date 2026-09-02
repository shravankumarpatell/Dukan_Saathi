"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import * as api from "@/services/api";
import { errorMessage } from "@/services/apiError";
import Kbd from "@/components/Kbd";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { usePageFocus } from "@/hooks/usePageFocus";
import { usePageKeepAlive } from "@/context/PageKeepAliveContext";
import { SCOPES, KEYS } from "@/lib/keymap";
import { buildChatSuggestions } from "@/lib/chatSuggestions";
import { Send, Bot, Sparkles, Eraser, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const IDLE_MS = 60 * 60 * 1000;

const mdComponents = {
  table: ({ node: _n, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-control border border-border">
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  ),
  thead: ({ node: _n, ...props }) => <thead className="bg-canvas/80" {...props} />,
  th: ({ node: _n, ...props }) => (
    <th
      className="border-b border-border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted"
      {...props}
    />
  ),
  td: ({ node: _n, ...props }) => (
    <td className="border-b border-border/70 px-3 py-2 font-mono text-[13px] tabular-nums text-ink last:border-0" {...props} />
  ),
  p: ({ node: _n, ...props }) => <p className="mb-2 leading-relaxed last:mb-0" {...props} />,
  ul: ({ node: _n, ...props }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: ({ node: _n, ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  li: ({ node: _n, ...props }) => <li className="pl-0.5" {...props} />,
  strong: ({ node: _n, ...props }) => <strong className="font-semibold text-ink" {...props} />,
  code: ({ node: _n, className, children, ...props }) => {
    const block = typeof className === "string" && className.includes("language-");
    if (block) {
      return (
        <code
          className="block overflow-x-auto rounded-control bg-surface px-3 py-2 font-mono text-[12px] text-white"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[12px] text-ink" {...props}>
        {children}
      </code>
    );
  },
};

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-0.5 py-1" aria-label="Likh raha hai">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-muted/50"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

export default function Chat() {
  const { customers, products, invoices } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const idleRef = useRef(null);
  const inputRef = useRef(null);

  const suggestions = useMemo(
    () => buildChatSuggestions({ customers, products, invoices }),
    [customers, products, invoices]
  );
  const placeholder = suggestions[0]?.q
    ? `Jaise: ${suggestions[0].q}`
    : "Hinglish mein poochho…";

  const focusStart = usePageFocus(() => inputRef.current?.focus());
  const { active: pageActive } = usePageKeepAlive();

  const resetIdle = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setMessages([]), IDLE_MS);
  }, []);

  useEffect(() => {
    if (!pageActive) {
      if (idleRef.current) clearTimeout(idleRef.current);
      return undefined;
    }
    resetIdle();
    return () => idleRef.current && clearTimeout(idleRef.current);
  }, [messages, pageActive, resetIdle]);

  useEffect(() => {
    if (!pageActive) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, pageActive]);

  const clearChat = useCallback(() => {
    setMessages([]);
    focusStart(0);
  }, [focusStart]);

    const sendText = useCallback(async (raw) => {
    const text = (raw || "").trim();
    if (!text || busy) return;
    setInput("");
    resetIdle();
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    // Keep caret in the composer while the reply streams.
    requestAnimationFrame(() => inputRef.current?.focus());
    try {
      for await (const chunk of api.streamChat(
        next.map((m) => ({ role: m.role, content: m.content }))
      )) {
        if (chunk && typeof chunk === "object") continue;
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "assistant", content: c[c.length - 1].content + chunk };
          return c;
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[chat]", err);
      const reason = errorMessage(err, "Jawab nahi aa paya. Thodi der baad dobara try karein.");
      const ref = err?.requestId ? `\n\n_ref: ${err.requestId}_` : "";
      setMessages((m) => {
        const c = [...m];
        const partial = (c[c.length - 1]?.content || "").trim();
        c[c.length - 1] = {
          role: "assistant",
          content: partial ? `${partial}\n\n_${reason}_${ref}` : `${reason}${ref}`,
          failed: true,
        };
        return c;
      });
    } finally {
      setBusy(false);
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      focusStart(40);
    });
  }, [busy, messages, resetIdle, focusStart]);

  const send = useCallback(() => sendText(input), [input, sendText]);

  const sendTextRef = useRef(sendText);
  useEffect(() => {
    sendTextRef.current = sendText;
  }, [sendText]);

  // Re-ask the last question after a failed answer (drops the failed pair first).
  const retryLast = useCallback(() => {
    if (busy) return;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx < 0) return;
    const question = messages[lastUserIdx].content;
    setMessages(messages.slice(0, lastUserIdx));
    // sendText reads `messages` from its closure; defer one tick so it sees the trimmed list.
    setTimeout(() => sendTextRef.current(question), 0);
  }, [busy, messages]);

  useHotkeyScope(SCOPES.CHAT);
  useHotkeys(SCOPES.CHAT, [
    { keys: KEYS.focusSearch, label: "Sawal likhne par jaayein", handler: () => focusStart(0) },
    { keys: KEYS.chatClear, label: "Baat-cheet saaf karein", handler: clearChat },
  ]);

  const empty = messages.length === 0;
  const lastIsTyping = busy && messages.length > 0 && messages[messages.length - 1]?.role === "assistant"
    && !messages[messages.length - 1]?.content;

  return (
    <div
      className="ds-fade flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="chat-page"
    >
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3 lg:mb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-white lg:hidden">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0 lg:hidden">
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink">AI Saathi</h2>
            <p className="truncate text-xs text-ink-muted">Dukaan ke hisaab — Hinglish mein poochho</p>
          </div>
          <p className="hidden text-xs text-ink-muted lg:block">Dukaan ke hisaab — Hinglish mein poochho</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            data-testid="chat-clear"
            onClick={clearChat}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-surface/30 hover:text-ink"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
            <Kbd keys={KEYS.chatClear} />
          </button>
        )}
      </div>

      <div className="ds-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 md:px-5 md:py-5"
          data-testid="chat-messages"
        >
          {empty && (
            <div className="mx-auto flex max-w-lg flex-col items-center px-2 py-4 text-center sm:py-8">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-mint-soft text-mint-dark sm:mb-4 sm:h-14 sm:w-14">
                <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <p className="text-base font-semibold text-ink">Kya jaanna hai?</p>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
                Is dukaan ke customers, bills, kamai, stock, udhari — jo poochho.
              </p>
              <div className="mt-6 grid w-full gap-2 sm:mt-8 sm:grid-cols-2">
                {suggestions.map(({ q, icon: Icon, hint }) => (
                  <button
                    key={`${hint}-${q}`}
                    type="button"
                    data-testid="chat-suggestion"
                    disabled={busy}
                    onClick={() => sendText(q)}
                    className="group flex items-start gap-3 rounded-control border border-border bg-white px-3.5 py-3 text-left transition-colors hover:border-mint/40 hover:bg-mint-soft/40 disabled:opacity-50"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-canvas text-ink-muted transition-colors group-hover:bg-white group-hover:text-mint-dark">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                        {hint}
                      </span>
                      <span className="mt-0.5 block text-sm font-medium leading-snug text-ink">{q}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isUser = m.role === "user";
            const isLastAssistant = !isUser && i === messages.length - 1;
            const showDots = isLastAssistant && lastIsTyping;
            return (
              <div
                key={i}
                data-testid={`chat-msg-${m.role}`}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`flex max-w-[92%] gap-2.5 sm:max-w-[80%] md:max-w-[72%] ${
                    isUser ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {!isUser && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint-soft text-mint-dark">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`rounded-control px-3.5 py-2.5 text-sm leading-relaxed ${
                      isUser
                        ? "bg-surface text-white"
                        : "border border-border bg-white text-ink shadow-[0_1px_0_rgba(27,54,93,0.04)]"
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    ) : showDots ? (
                      <TypingDots />
                    ) : (
                      <div className="prose prose-sm max-w-none prose-headings:text-ink prose-a:text-mint-dark">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                          {m.content || "…"}
                        </ReactMarkdown>
                        {m.failed && isLastAssistant && !busy ? (
                          <button
                            type="button"
                            data-testid="chat-retry"
                            onClick={retryLast}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-control border border-border bg-canvas px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-mint/40 hover:text-ink"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Dobara poochho
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div className="shrink-0 border-t border-border bg-canvas/40 px-3 py-3 md:px-4">
          <div className="ds-combo flex items-center gap-2 bg-white py-1.5 pl-3 pr-1.5">
            <input
              ref={inputRef}
              data-testid="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-ink-muted/70"
            />
            <Kbd keys={KEYS.focusSearch} />
            <button
              type="button"
              data-testid="chat-send"
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label="Bhejo"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-mint text-white transition-transform active:scale-95 hover:bg-mint-dark disabled:opacity-40"
            >
              <Send className="h-4 w-4 translate-x-px" />
            </button>
          </div>
          <p className="mt-2 hidden px-0.5 text-[11px] text-ink-muted lg:block">
            Enter se bhejo · Clear <Kbd keys={KEYS.chatClear} />
          </p>
        </div>
      </div>
    </div>
  );
}
