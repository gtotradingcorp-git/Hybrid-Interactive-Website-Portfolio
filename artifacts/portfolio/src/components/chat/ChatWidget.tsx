import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, RotateCcw, Square, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { AiOphnmLogo } from "./AiOphnmLogo";
import { ActionCard, type ActionRequest, type ChatToolName as ChatActionToolName } from "./ActionCard";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  isError?: boolean;
  isCancelled?: boolean;
  retryPrompt?: string;
  isRecruiterIntent?: boolean;
  jdPrefill?: string;
  actionRequest?: ActionRequest;
}

// Recruiter intent detector. Triggers on phrases that signal the visitor is a
// recruiter wanting to score John against a role — not on casual mentions of
// "job" or "role" inside an experience question. Anchored to verbs like
// match/fit/score/paste/check, or the explicit "recruiter mode"/"job
// description" phrases.
const RECRUITER_INTENT_PATTERNS: RegExp[] = [
  /\brecruiter\s+mode\b/i,
  /\bjob\s+description\b/i,
  /\b(paste|share|send|upload)\s+(a|the|my|this)\s+(jd|job)/i,
  /\b(match|fit|score|check|compare)\s+(him|john|my|the|this)\s+(against|to|for|with)\s+(a|the|my|this)?\s*(jd|job|role|position|description|opening|opportunity)/i,
  /\bfit\s+(score|brief|report)\b/i,
  /\b(score|rate|grade)\s+(this|a|my|the)\s+(jd|job|role|position)/i,
];

function detectRecruiterIntent(text: string): boolean {
  return RECRUITER_INTENT_PATTERNS.some((re) => re.test(text));
}

const SUGGESTIONS = [
  "What's John's current role?",
  "Summarize his ERP experience.",
  "Tell me about his DevOps and cloud work.",
  "Which industries has he worked in?",
];

const SLOW_HINT_MS = 10000;

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const [slowHint, setSlowHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstTokenRef = useRef(false);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, isStreaming, slowHint]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  const clearSlowTimer = () => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const history = messages.filter((m) => m.role !== "system");
    const intent = detectRecruiterIntent(trimmed);
    const next: ChatMessage[] = [
      ...history,
      { role: "user", content: trimmed },
      ...(intent
        ? [
            {
              role: "system" as const,
              content:
                "Sounds like you'd like to match John to a role. Recruiter Mode scores any job description against his projects in seconds.",
              isRecruiterIntent: true,
              jdPrefill: trimmed,
            },
          ]
        : []),
      { role: "assistant", content: "" },
    ];
    setMessages(next);
    setInput("");
    await streamAssistantResponse(next, trimmed);
  };

  const streamAssistantResponse = async (
    conversation: ChatMessage[],
    retryPrompt: string,
  ) => {
    setIsStreaming(true);
    setFirstTokenReceived(false);
    firstTokenRef.current = false;
    setSlowHint(false);

    clearSlowTimer();
    slowTimerRef.current = setTimeout(() => setSlowHint(true), SLOW_HINT_MS);

    const controller = new AbortController();
    abortRef.current = controller;

    const failWithSystemMessage = (msg: string) => {
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          copy.pop();
        }
        copy.push({
          role: "system",
          content: msg,
          isError: true,
          retryPrompt,
        });
        return copy;
      });
    };

    try {
      const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${apiBase}/../api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation
            .slice(0, -1)
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        const friendly =
          data?.error ||
          (res.status === 504
            ? "The assistant is taking longer than usual. Please try again."
            : "Something went wrong reaching the assistant.");
        failWithSystemMessage(friendly);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
        } else {
          buffer += decoder.decode(value, { stream: true });
        }

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = rawEvent.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6);
          let evt: {
            content?: string;
            done?: boolean;
            error?: string;
            action_request?: { tool: ChatActionToolName; arguments: Record<string, unknown> };
          };
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          if (evt.error) {
            failWithSystemMessage(evt.error);
            finished = true;
            break;
          }
          if (evt.action_request) {
            const req = evt.action_request;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              // If the assistant turned out to be a tool-call only, drop the
              // empty assistant bubble before appending the action card.
              if (last && last.role === "assistant" && !last.content) {
                copy.pop();
              }
              copy.push({
                role: "system",
                content: "",
                actionRequest: { tool: req.tool, arguments: req.arguments ?? {} },
              });
              return copy;
            });
          }
          if (evt.content) {
            if (!firstTokenRef.current) {
              firstTokenRef.current = true;
              setFirstTokenReceived(true);
              setSlowHint(false);
              clearSlowTimer();
            }
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + evt.content,
                };
              }
              return copy;
            });
          }
          if (evt.done) {
            finished = true;
            break;
          }
        }

        if (done) break;
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      failWithSystemMessage(msg);
    } finally {
      clearSlowTimer();
      setIsStreaming(false);
      setSlowHint(false);
      abortRef.current = null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleClear = () => {
    abortRef.current?.abort();
    clearSlowTimer();
    setMessages([]);
    setSlowHint(false);
  };

  const handleStop = () => {
    if (!isStreaming || !abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    clearSlowTimer();
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.role === "system" && last.isCancelled) {
        return prev;
      }
      if (last && last.role === "assistant") {
        copy.pop();
      }
      // Find the most recent user message so the visitor can re-ask the
      // exact question they abandoned with one click.
      let lastUserPrompt: string | undefined;
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "user") {
          lastUserPrompt = copy[i].content;
          break;
        }
      }
      copy.push({
        role: "system",
        content: "You stopped this response.",
        isCancelled: true,
        retryPrompt: lastUserPrompt,
      });
      return copy;
    });
    setSlowHint(false);
  };

  const handleRetry = (prompt: string) => {
    if (isStreaming) return;
    // Drop both error and cancelled system bubbles before retrying so the
    // transcript doesn't accumulate stale notices.
    const cleaned = messages.filter(
      (m) => !(m.role === "system" && (m.isError || m.isCancelled)),
    );
    const lastUserIdx = (() => {
      for (let i = cleaned.length - 1; i >= 0; i--) {
        if (cleaned[i].role === "user") return i;
      }
      return -1;
    })();

    let conversation: ChatMessage[];
    if (lastUserIdx !== -1 && cleaned[lastUserIdx].content === prompt) {
      conversation = [
        ...cleaned.slice(0, lastUserIdx + 1),
        { role: "assistant", content: "" },
      ];
    } else {
      conversation = [
        ...cleaned,
        { role: "user", content: prompt },
        { role: "assistant", content: "" },
      ];
    }
    setMessages(conversation);
    void streamAssistantResponse(conversation, prompt);
  };

  return (
    <>
      {/* Floating launcher */}
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close AI OPHNM" : "Open AI OPHNM"}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#0a0a0a] text-[#d4af37] shadow-lg shadow-black/40 ring-1 ring-[#d4af37]/40 hover:ring-[#d4af37]/70 transition-all"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="block"
            >
              <AiOphnmLogo className="h-9 w-9" decorative />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" as const }}
            className="fixed inset-0 sm:inset-auto sm:bottom-24 sm:right-5 z-50 flex sm:w-[400px] sm:max-h-[min(640px,calc(100vh-8rem))] flex-col overflow-hidden sm:rounded-xl border-0 sm:border border-border/60 bg-card shadow-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 bg-card px-4 py-3">
              <div className="flex items-center gap-3">
                <AiOphnmLogo className="h-9 w-9 shrink-0" decorative />
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-foreground tracking-wide">AI OPHNM</div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Background & Experience
                  </div>
                </div>
              </div>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-accent transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            >
              {messages.length === 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Hi — I'm AI OPHNM, an assistant trained on John's professional background. Ask me anything about his roles, projects, or capabilities.
                  </p>
                  <div className="space-y-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void sendMessage(s)}
                        className="block w-full text-left text-xs px-3 py-2 rounded-md border border-border/60 bg-background hover:border-accent/60 hover:text-accent transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => {
                if (m.role === "system" && m.actionRequest) {
                  // Build a small transcript snippet from the last few
                  // messages so the action handler can store it for John.
                  const transcript = messages
                    .slice(Math.max(0, i - 6), i)
                    .filter((x) => x.role === "user" || x.role === "assistant")
                    .map((x) => `${x.role}: ${x.content}`)
                    .join("\n")
                    .slice(0, 1800);
                  const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");
                  return (
                    <div key={i} className="flex justify-start">
                      <ActionCard
                        request={m.actionRequest}
                        apiBase={apiBase}
                        transcriptSnippet={transcript}
                        onResolved={() => {
                          // No-op for now: ActionCard handles its own
                          // success/failure state inline. We could append
                          // a follow-up assistant prompt here later.
                        }}
                      />
                    </div>
                  );
                }
                if (m.role === "system" && m.isRecruiterIntent) {
                  const matchHref = m.jdPrefill
                    ? `/match?jd=${encodeURIComponent(m.jdPrefill.slice(0, 1500))}`
                    : "/match";
                  return (
                    <div key={i} className="flex justify-start">
                      <div className="max-w-[90%] rounded-lg border border-accent/40 bg-accent/5 px-3 py-2.5 text-xs text-foreground space-y-2">
                        <div className="flex items-start gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
                          <div className="leading-relaxed">{m.content}</div>
                        </div>
                        <Link
                          href={matchHref}
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-accent/50 bg-background/60 px-2.5 py-1 font-mono uppercase tracking-wider text-[10px] text-accent hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          Open Recruiter Mode
                        </Link>
                      </div>
                    </div>
                  );
                }
                if (m.role === "system" && m.isCancelled) {
                  return (
                    <div
                      key={i}
                      role="status"
                      aria-live="polite"
                      className="flex justify-start"
                    >
                      <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground space-y-2 max-w-[85%]">
                        <div className="leading-relaxed italic">{m.content}</div>
                        {m.retryPrompt && (
                          <button
                            type="button"
                            onClick={() => handleRetry(m.retryPrompt!)}
                            disabled={isStreaming}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2 py-1 font-mono uppercase tracking-wider text-[10px] text-muted-foreground hover:text-accent hover:border-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Ask again
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                if (m.role === "system" && m.isError) {
                  return (
                    <div
                      key={i}
                      role="alert"
                      aria-live="polite"
                      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive space-y-2"
                    >
                      <div className="leading-relaxed">{m.content}</div>
                      {m.retryPrompt && (
                        <button
                          type="button"
                          onClick={() => handleRetry(m.retryPrompt!)}
                          disabled={isStreaming}
                          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background/50 px-2 py-1 font-mono uppercase tracking-wider text-[10px] text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Try again
                        </button>
                      )}
                    </div>
                  );
                }

                const isTyping =
                  m.role === "assistant" &&
                  !m.content &&
                  i === messages.length - 1 &&
                  isStreaming;

                return (
                  <div
                    key={i}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-accent text-accent-foreground"
                          : "bg-background border border-border/60 text-foreground"
                      }`}
                      aria-live={isTyping ? "polite" : undefined}
                      aria-label={
                        isTyping
                          ? slowHint
                            ? "Assistant is still thinking"
                            : "Assistant is typing"
                          : undefined
                      }
                    >
                      {m.content ? (
                        m.content
                      ) : slowHint ? (
                        <span className="text-xs text-muted-foreground italic">
                          Still thinking…
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1" aria-hidden="true">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:300ms]" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="flex items-end gap-2 border-t border-border/60 bg-card px-3 py-3"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(input);
                  }
                }}
                rows={1}
                placeholder="Ask about experience, projects, capabilities..."
                className="flex-1 resize-none max-h-32 px-3 py-2 rounded-md text-sm bg-background border border-border/60 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 disabled:opacity-60"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  aria-label="Stop response"
                  title="Stop response"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
