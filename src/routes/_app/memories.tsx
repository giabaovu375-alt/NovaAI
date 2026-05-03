import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Trash2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/memories")({
  component: MemoriesPage,
});

function MemoriesPage() {
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const { data: memories = [] } = useQuery({
    queryKey: ["memories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memories")
        .select("id, content, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async (content: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("memories")
        .insert({ user_id: u.user!.id, content: content.trim().slice(0, 500) });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      void qc.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Đã thêm ghi nhớ");
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("memories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["memories"] });
    },
  });

  return (
    <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Ghi nhớ về bạn</h1>
          <p className="text-xs text-muted-foreground">
            NovaAI dùng những ghi nhớ này khi trò chuyện. Tự động lưu khi bạn nói "ghi nhớ: ...".
          </p>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) add.mutate(text);
          }}
          placeholder="Thêm ghi nhớ thủ công..."
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-primary/50 focus:outline-none"
        />
        <button
          onClick={() => text.trim() && add.mutate(text)}
          disabled={!text.trim() || add.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Thêm
        </button>
      </div>

      {memories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Chưa có ghi nhớ nào. Thử nói với NovaAI: "ghi nhớ: tui thích chơi Yasuo".
        </p>
      ) : (
        <ul className="space-y-2">
          {memories.map((m) => (
            <li
              key={m.id}
              className="group flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5"
            >
              <p className="flex-1 text-sm leading-relaxed">{m.content}</p>
              <button
                onClick={() => del.mutate(m.id)}
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
