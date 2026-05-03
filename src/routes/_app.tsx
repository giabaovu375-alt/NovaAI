import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Loader2, LogOut, BookOpen, MessageSquarePlus, Trash2, Brain } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading, isOwner, displayName, avatarUrl, signOut } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !session) void nav({ to: "/login" });
  }, [loading, session, nav]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <Sidebar isOwner={isOwner} displayName={displayName} avatarUrl={avatarUrl} signOut={signOut} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function Sidebar({
  isOwner,
  displayName,
  avatarUrl,
  signOut,
}: {
  isOwner: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  signOut: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createConv = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("not signed in");
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: u.user.id })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void nav({ to: "/c/$id", params: { id } });
    },
    onError: (e: any) => {
      const msg = e?.message ?? "";
      if (msg.includes("policy") || msg.includes("violates")) {
        toast.error("Bạn đã đạt giới hạn 10 cuộc trò chuyện. Hãy xoá bớt nhé!");
      } else {
        toast.error("Không tạo được cuộc trò chuyện mới");
      }
    },
  });

  const deleteConv = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("conversations").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      if (pathname.includes(id)) void nav({ to: "/" });
    },
  });

  return (
    <aside className="hidden w-64 flex-col border-r border-border bg-card/30 sm:flex">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">NovaAI</h1>
          <p className="truncate text-[10px] text-muted-foreground">Game & IT Assistant</p>
        </div>
      </div>

      <button
        onClick={() => createConv.mutate()}
        disabled={createConv.isPending}
        className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Cuộc trò chuyện mới
      </button>

      <nav className="flex-1 overflow-y-auto px-2">
        <p className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Lịch sử
        </p>
        {conversations?.length ? (
          conversations.map((c) => {
            const active = pathname === `/c/${c.id}`;
            return (
              <div
                key={c.id}
                className={cn(
                  "group mb-0.5 flex items-center rounded-md text-sm",
                  active ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <Link
                  to="/c/$id"
                  params={{ id: c.id }}
                  className="min-w-0 flex-1 truncate px-2.5 py-1.5"
                >
                  {c.title}
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm("Xoá cuộc trò chuyện này?")) deleteConv.mutate(c.id);
                  }}
                  className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                  aria-label="Xoá"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        ) : (
          <p className="px-2 py-1 text-xs text-muted-foreground">Chưa có cuộc trò chuyện nào.</p>
        )}
      </nav>

      <div className="border-t border-border p-2">
        <Link
          to="/memories"
          className={cn(
            "mb-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent",
            pathname === "/memories" && "bg-accent",
          )}
        >
          <Brain className="h-4 w-4" /> Ghi nhớ
        </Link>
        {isOwner && (
          <Link
            to="/knowledge"
            className={cn(
              "mb-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent",
              pathname === "/knowledge" && "bg-accent",
            )}
          >
            <BookOpen className="h-4 w-4" /> Knowledge
          </Link>
        )}
        <div className="mt-1 flex items-center gap-2 rounded-md px-2.5 py-1.5">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-secondary" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{displayName ?? "User"}</p>
            {isOwner && <p className="text-[10px] text-primary">Chủ nhân</p>}
          </div>
          <button
            onClick={() => signOut()}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Đăng xuất"
            title="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
