"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisReport, ChatMessage } from "@/types";

interface Props {
  report: AnalysisReport | null;
}

const SUGGESTIONS = [
  "Summarize the most critical anomalies.",
  "Why did check C5 fail and how do I fix it?",
  "Which rows have invalid step codes?",
];

export default function ChatPanel({ report }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, report }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Chat failed");
        throw new Error(errText || "Chat failed");
      }

      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Sorry — ${err instanceof Error ? err.message : "something went wrong"}.` },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="glow fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-xl"
        aria-label="Open AI assistant"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.4 7.2L4 20l1-4.6A8 8 0 1121 12z" />
        </svg>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: 440, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 440, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 240 }}
            className="glass-strong fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col sm:bottom-6 sm:right-6 sm:top-auto sm:h-[600px] sm:max-h-[85vh] sm:w-[400px] sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/40 to-cyan-400/30">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Anomaly Assistant</p>
                  <p className="text-[11px] text-white/40">Groq · RAG over your rules</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-white/60">
                    Ask me anything about your report or the 9 anomaly rules.
                    {!report && " Upload a file to ground my answers in your data."}
                  </p>
                  <div className="space-y-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="block w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/[0.08]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-indigo-500/80 text-white"
                        : "border border-white/10 bg-white/[0.05] text-white/85"
                    }`}
                  >
                    {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="border-t border-white/10 p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={1}
                  placeholder="Ask about an anomaly…"
                  className="max-h-32 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white transition-colors hover:bg-indigo-400 disabled:opacity-40"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
