import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Loader2, Smile, BookText, Image as ImageIcon, X, Play } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Msg = { id?: string; role: "user" | "assistant"; content: string };
type Mode = "fun" | "serious";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const SUGGESTIONS = [
  "Build PC gaming 30 triệu",
  "Vẽ cho tui landing page Tailwind",
  "Meta Yasuo mid LMHT 2025",
  "Hiệu ứng Framer Motion cho card",
];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function Chat({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: conv } = useQuery({
    queryKey: ["conv", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations").select("id, title, mode").eq("id", conversationId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages").select("id, role, content")
        .eq("conversation_id", conversationId).order("created_at", { ascending: true });
      if (error) throw error;
      return data as Msg[];
    },
  });

  const mode: Mode = (conv?.mode as Mode) ?? "fun";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamBuffer]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  async function toggleMode() {
    const next: Mode = mode === "fun" ? "serious" : "fun";
    await supabase.from("conversations").update({ mode: next }).eq("id", conversationId);
    void qc.invalidateQueries({ queryKey: ["conv", conversationId] });
    toast.success(next === "serious" ? "Đã bật chế độ Nghiêm túc" : "Quay lại chế độ Cợt nhả");
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const imgs: string[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 4 * 1024 * 1024) {
        toast.error(`${f.name} > 4MB, bỏ qua`);
        continue;
      }
      imgs.push(await fileToDataUrl(f));
    }
    setPendingImages((p) => [...p, ...imgs].slice(0, 4));
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    const imgs = pendingImages;
    if ((!content && !imgs.length) || streaming) return;
    setError(null);
    setInput("");
    setPendingImages([]);
    setStreaming(true);
    setStreamBuffer("");

    const optimistic = [content, ...imgs.map((u) => `\n\n![ảnh đính kèm](${u})`)].join("");
    qc.setQueryData<Msg[]>(["messages", conversationId], (prev = []) => [
      ...prev,
      { role: "user", content: optimistic },
    ]);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("not signed in");

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId, userMessage: content, mode, attachments: imgs }),
      });

      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({}));
        if (resp.status === 429) setError("Quá nhiều yêu cầu. Đợi chút rồi thử lại nhé!");
        else if (resp.status === 402) setError("Hết credit AI.");
        else setError(j.error || "Có lỗi xảy ra. Thử lại nhé!");
        setStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assembled = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, "");
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") continue;
          try {
            const p = JSON.parse(j);
            const c = p.choices?.[0]?.delta?.content;
            if (c) {
              assembled += c;
              setStreamBuffer(assembled);
            }
          } catch {/* ignore */}
        }
      }
    } catch (e) {
      console.error(e);
      setError("Không kết nối được tới AI. Kiểm tra mạng và thử lại.");
    } finally {
      setStreaming(false);
      setStreamBuffer("");
      void qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["conv", conversationId] });
    }
  }

  return (
    <div
      className="flex h-full flex-col bg-background text-foreground"
      onPaste={(e) => {
        const items = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith("image/"));
        if (!items.length) return;
        e.preventDefault();
        const dt = new DataTransfer();
        items.forEach((i) => { const f = i.getAsFile(); if (f) dt.items.add(f); });
        void handleFiles(dt.files);
      }}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-none">{conv?.title ?? "NovaAI"}</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {mode === "fun" ? "Chế độ cợt nhả" : "Chế độ nghiêm túc"} · Nova Architect
            </p>
          </div>
        </div>
        <button
          onClick={toggleMode}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-secondary",
            mode === "serious" && "border-primary/40 bg-primary/10 text-primary",
          )}
        >
          {mode === "fun" ? <Smile className="h-3.5 w-3.5" /> : <BookText className="h-3.5 w-3.5" />}
          {mode === "fun" ? "Cợt nhả" : "Nghiêm túc"}
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && !streaming ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 py-12">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Chào! Tui là NovaAI</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Game · IT · Build web. Gửi ảnh layout, tui dựng code Tailwind ngay.
            </p>
            <div className="mt-8 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="rounded-lg border border-border bg-card px-3.5 py-3 text-left text-sm text-foreground/80 transition-all hover:border-primary/40 hover:bg-accent hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl px-4 py-6">
            {messages.map((m, i) => <MessageBubble key={m.id ?? i} message={m} />)}
            {streaming && streamBuffer && (
              <MessageBubble message={{ role: "assistant", content: streamBuffer }} />
            )}
            {streaming && !streamBuffer && (
              <div className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang suy nghĩ...
              </div>
            )}
            {error && (
              <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-2xl">
          {pendingImages.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pendingImages.map((src, i) => (
                <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-foreground hover:bg-destructive hover:text-destructive-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 transition-colors focus-within:border-primary/50">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={streaming}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Đính ảnh">
              <ImageIcon className="h-4 w-4" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Hỏi NovaAI, hoặc kéo/dán ảnh layout..."
              rows={1}
              className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-sm placeholder:text-muted-foreground focus:outline-none"
              disabled={streaming}
            />
            <button onClick={() => send()} disabled={(!input.trim() && !pendingImages.length) || streaming}
              className={cn("flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                (input.trim() || pendingImages.length) && !streaming
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-secondary text-muted-foreground")}>
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            NovaAI có thể nhầm lẫn. Hãy kiểm chứng thông tin quan trọng.
          </p>
        </div>
      </div>
    </div>
  );
}

function CodePreview({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const isFull = /<!doctype|<html/i.test(code);
  const html = isFull
    ? code
    : `<!doctype html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"></script></head><body>${code}</body></html>`;
  return (
    <div className="my-2">
      <button onClick={() => setOpen((v) => !v)}
        className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary hover:bg-primary/20">
        <Play className="h-3 w-3" /> {open ? "Ẩn preview" : "Chạy thử"}
      </button>
      {open && (
        <iframe
          sandbox="allow-scripts"
          srcDoc={html}
          className="h-[420px] w-full rounded-lg border border-border bg-white"
          title="Preview"
        />
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Msg }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex w-full py-3", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
        isUser ? "bg-primary text-primary-foreground" : "bg-card text-foreground")}>
        {isUser ? (
          <UserContent content={message.content} />
        ) : (
          <div className="prose-chat">
            <ReactMarkdown
              components={{
                img: ({ src }) => (
                  <img src={src as string} alt="" className="my-2 max-h-72 rounded-lg border border-border" />
                ),
                code({ className, children, ...props }) {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.85em] text-primary" {...props}>
                        {children}
                      </code>
                    );
                  }
                  const lang = (className || "").replace("language-", "");
                  const code = String(children).replace(/\n$/, "");
                  const previewable = /^html?$/i.test(lang) || /<!doctype|<html|<body/i.test(code);
                  return (
                    <>
                      {previewable && <CodePreview code={code} />}
                      <pre className="my-2 overflow-x-auto rounded-lg bg-secondary p-3">
                        <code className={cn("font-mono text-xs", className)} {...props}>{children}</code>
                      </pre>
                    </>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function UserContent({ content }: { content: string }) {
  // Split text and images
  const parts = content.split(/(!\[[^\]]*\]\([^)]+\))/g);
  return (
    <div className="space-y-2">
      {parts.map((p, i) => {
        const m = p.match(/!\[[^\]]*\]\(([^)]+)\)/);
        if (m) return <img key={i} src={m[1]} alt="" className="max-h-60 rounded-lg" />;
        return p ? <p key={i} className="whitespace-pre-wrap">{p}</p> : null;
      })}
    </div>
  );
}
