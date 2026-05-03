import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_app/")({
  component: HomeRedirect,
});

function HomeRedirect() {
  const { session } = useAuth();
  const nav = useNavigate();

  // Find most recent conversation (or create one)
  const { data: latest, isLoading } = useQuery({
    enabled: !!session,
    queryKey: ["latest-conv"],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.id ?? null;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: u.user!.id })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
  });

  useEffect(() => {
    if (isLoading) return;
    if (latest) {
      void nav({ to: "/c/$id", params: { id: latest }, replace: true });
    } else if (!create.isPending && !create.data) {
      create.mutate(undefined, {
        onSuccess: (id) => nav({ to: "/c/$id", params: { id }, replace: true }),
      });
    }
  }, [isLoading, latest]); // eslint-disable-line

  return (
    <div className="flex h-full flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Sparkles className="h-8 w-8 text-primary" />
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    </div>
  );
}
