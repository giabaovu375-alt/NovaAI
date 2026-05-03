import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      void nav({ to: "/" });
    }
  }, [loading, session, nav]);

  async function signIn() {
    setSigning(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Đăng nhập thất bại. Thử lại nhé!");
      setSigning(false);
      return;
    }
    if (result.redirected) return; // browser will redirect
    void nav({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Chào mừng đến NovaAI</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Đăng nhập bằng Google để lưu lịch sử trò chuyện và để AI ghi nhớ về bạn.
          </p>
        </div>
        <button
          onClick={signIn}
          disabled={signing}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {signing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon className="h-5 w-5" />
          )}
          Tiếp tục với Google
        </button>
        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Bằng việc đăng nhập, bạn đồng ý cho NovaAI lưu trò chuyện để cải thiện trải nghiệm.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.5-8.7 19.5-19.5 0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 16.3 4.5 9.7 8.8 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43.5c5.1 0 9.7-1.9 13.2-5.1l-6.1-5c-2 1.4-4.4 2.2-7.1 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.1 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.4 4.3-4.4 5.6l6.1 5C40.8 35.6 43.5 30.2 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
