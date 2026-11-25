import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askAssistant } from "@/lib/assistant.functions";

type Message = { role: "user" | "assistant"; content: string };

const GREETING: Message = {
  role: "assistant",
  content:
    "Hello! I am Wawa Assistant. Ask me about barangay services, requirements, fees, requests, the PWD and senior registry, or court booking.",
};
const SUGGESTIONS = [
  "What do I need for a barangay clearance?",
  "How do I track my request?",
  "How do I book the court?",
];

/** Floating help chat, shown on the public and resident pages. */
export function AssistantWidget() {
  const askFn = useServerFn(askAssistant);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open, busy]);

  // The admin panel has its own tools, and printed reports must stay clean.
  if (pathname.startsWith("/admin")) return null;

  const send = async (question: string) => {
    const content = question.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setText("");
    setBusy(true);
    try {
      // The greeting is not part of the conversation the AI needs to see.
      const result = await askFn({ data: { messages: next.slice(1).slice(-8) } });
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="print:hidden">
      {open && (
        <section
          aria-label="Wawa Assistant"
          className="fixed bottom-20 right-4 z-40 flex h-[32rem] max-h-[calc(100vh-7rem)] w-[calc(100vw-2rem)] max-w-sm flex-col border border-border bg-background shadow-xl"
        >
          <header className="flex items-center justify-between gap-2 bg-forest-deep px-4 py-3 text-primary-foreground">
            <p className="flex items-center gap-2 font-display font-semibold">
              <Bot className="size-5" aria-hidden />
              Wawa Assistant
            </p>
            <button type="button" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <X className="size-5" aria-hidden />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
            {messages.map((message, index) => (
              <p
                key={index}
                className={`max-w-[85%] whitespace-pre-wrap break-words px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "ml-auto bg-forest-deep text-primary-foreground"
                    : "bg-secondary text-foreground"
                }`}
              >
                {message.content}
              </p>
            ))}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((item) => (
                  <Button key={item} size="sm" variant="outline" onClick={() => void send(item)}>
                    {item}
                  </Button>
                ))}
              </div>
            )}
            {busy && <p className="text-xs text-muted-foreground">Wawa Assistant is typing…</p>}
            <div ref={endRef} />
          </div>
          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(text);
            }}
          >
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={500}
              placeholder="Type your question…"
              aria-label="Your question"
            />
            <Button
              type="submit"
              variant="gold"
              size="icon"
              disabled={busy || !text.trim()}
              aria-label="Send"
            >
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
          <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            AI answers can be wrong. For official matters, confirm with the barangay hall.
          </p>
        </section>
      )}
      <Button
        variant="gold"
        className="fixed bottom-4 right-4 z-40 h-12 gap-2 rounded-full px-4 shadow-lg"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Bot className="size-5" aria-hidden />
        {open ? "Close" : "Ask Wawa"}
      </Button>
    </div>
  );
}
