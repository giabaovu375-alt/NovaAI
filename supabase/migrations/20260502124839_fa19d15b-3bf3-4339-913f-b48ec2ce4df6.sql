
-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('owner', 'user');
CREATE TYPE public.chat_mode AS ENUM ('fun', 'serious');
CREATE TYPE public.knowledge_kind AS ENUM ('note', 'file');

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============= USER ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role helper (security definer, avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_owner(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner');
$$;

-- ============= CONVERSATIONS =============
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  mode chat_mode NOT NULL DEFAULT 'fun',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_conversations_user ON public.conversations(user_id, updated_at DESC);

-- ============= MESSAGES =============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at);

-- ============= MEMORIES =============
CREATE TABLE public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_memories_user ON public.memories(user_id, created_at DESC);

-- ============= KNOWLEDGE ITEMS (owner only) =============
CREATE TABLE public.knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind knowledge_kind NOT NULL DEFAULT 'note',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_knowledge_user ON public.knowledge_items(user_id, created_at DESC);

-- ============= RLS POLICIES =============
-- profiles: anyone signed-in can read; only self can update
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- user_roles: user can read own role; only DB triggers/admin can insert
CREATE POLICY "roles_select_self" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- conversations: full CRUD self
CREATE POLICY "conv_select_self" ON public.conversations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "conv_insert_self" ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.is_owner(auth.uid())
      OR (SELECT COUNT(*) FROM public.conversations WHERE user_id = auth.uid()) < 10
    )
  );
CREATE POLICY "conv_update_self" ON public.conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "conv_delete_self" ON public.conversations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- messages: full CRUD self
CREATE POLICY "msg_select_self" ON public.messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "msg_insert_self" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "msg_delete_self" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- memories: self
CREATE POLICY "mem_select_self" ON public.memories FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "mem_insert_self" ON public.memories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mem_delete_self" ON public.memories FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- knowledge_items: only owner role
CREATE POLICY "kn_select_owner" ON public.knowledge_items FOR SELECT TO authenticated USING (public.is_owner(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "kn_insert_owner" ON public.knowledge_items FOR INSERT TO authenticated WITH CHECK (public.is_owner(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "kn_update_owner" ON public.knowledge_items FOR UPDATE TO authenticated USING (public.is_owner(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "kn_delete_owner" ON public.knowledge_items FOR DELETE TO authenticated USING (public.is_owner(auth.uid()) AND auth.uid() = user_id);

-- ============= TRIGGER: auto-create profile + role on signup =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'giabaovu375@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= update_at trigger for conversations =============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER conv_touch BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= STORAGE BUCKET for knowledge files (owner only) =============
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge', 'knowledge', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "kn_storage_owner_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'knowledge' AND public.is_owner(auth.uid()))
  WITH CHECK (bucket_id = 'knowledge' AND public.is_owner(auth.uid()));
