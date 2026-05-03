import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Trash2, Plus, Upload, FileText, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_app/knowledge")({
  component: KnowledgePage,
});

function KnowledgePage() {
  const { isOwner, loading } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading && !isOwner) void nav({ to: "/" });
  }, [loading, isOwner, nav]);

  const { data: items = [] } = useQuery({
    enabled: isOwner,
    queryKey: ["knowledge"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_items")
        .select("id, kind, title, content, source_path, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("knowledge_items").insert({
        user_id: u.user!.id,
        kind: "note",
        title: title.trim().slice(0, 200) || "Untitled",
        content: body.trim().slice(0, 20000),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setBody("");
      void qc.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Đã thêm vào knowledge base");
    },
    onError: () => toast.error("Lỗi khi lưu"),
  });

  const del = useMutation({
    mutationFn: async (item: { id: string; source_path: string | null }) => {
      if (item.source_path) {
        await supabase.storage.from("knowledge").remove([item.source_path]);
      }
      const { error } = await supabase.from("knowledge_items").delete().eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge"] }),
  });

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File tối đa 10MB");
      return;
    }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = `${u.user!.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("knowledge").upload(path, file);
      if (upErr) throw upErr;

      // Extract text for txt/md
      let content = "";
      const name = file.name.toLowerCase();
      if (name.endsWith(".txt") || name.endsWith(".md")) {
        content = await file.text();
      } else {
        content = `[File ${file.name}] - Nội dung file binary đã được lưu trữ. Hãy tóm tắt thủ công vào ghi chú nếu muốn AI dùng làm ngữ cảnh.`;
      }

      const { error: dbErr } = await supabase.from("knowledge_items").insert({
        user_id: u.user!.id,
        kind: "file",
        title: file.name,
        content: content.slice(0, 20000),
        source_path: path,
      });
      if (dbErr) throw dbErr;
      void qc.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Đã upload file");
    } catch (e) {
      console.error(e);
      toast.error("Upload thất bại");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  if (loading || !isOwner) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Knowledge Base</h1>
          <p className="text-xs text-muted-foreground">
            Riêng cho chủ nhân. NovaAI sẽ tự dùng những kiến thức này khi trò chuyện với bạn.
          </p>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium">Thêm ghi chú</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tiêu đề (vd: Sở thích game)"
          className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Nội dung..."
          rows={5}
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => addNote.mutate()}
            disabled={!body.trim() || addNote.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Lưu ghi chú
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload file (PDF/TXT/MD)
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Knowledge base trống. Thêm ghi chú hoặc upload file để bắt đầu.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="group flex items-start gap-3 rounded-lg border border-border bg-card px-3.5 py-3"
            >
              <div className="mt-0.5">
                {it.kind === "file" ? (
                  <FileText className="h-4 w-4 text-primary" />
                ) : (
                  <BookOpen className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{it.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{it.content}</p>
              </div>
              <button
                onClick={() => del.mutate({ id: it.id, source_path: it.source_path })}
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                aria-label="Xoá"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
