import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isOwner: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    // 1) listener first
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      if (sess?.user) {
        // defer DB lookups so we don't deadlock the listener
        setTimeout(() => {
          void loadRoleAndProfile(sess.user.id);
        }, 0);
      } else {
        setIsOwner(false);
        setProfile(null);
      }
    });
    // 2) initial session
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        void loadRoleAndProfile(data.session.user.id);
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadRoleAndProfile(uid: string) {
    const [{ data: roles }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("display_name, avatar_url").eq("id", uid).maybeSingle(),
    ]);
    setIsOwner(!!roles?.some((r) => r.role === "owner"));
    setProfile(prof ?? null);
  }

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    loading,
    isOwner,
    displayName: profile?.display_name ?? session?.user?.user_metadata?.full_name ?? null,
    avatarUrl: profile?.avatar_url ?? session?.user?.user_metadata?.avatar_url ?? null,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
