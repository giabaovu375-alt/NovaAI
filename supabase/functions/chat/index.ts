// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ARCHITECT_BLOCK = `

## Năng lực Nova Architect (luôn áp dụng khi user yêu cầu code/UI):

### 1. Image-to-Code (Vision)
Khi user gửi ảnh layout/wireframe/screenshot:
- Mô tả ngắn cấu trúc bạn thấy (header, hero, grid...).
- Ưu tiên xuất HTML + Tailwind CSS responsive, semantic (\`<header>\`, \`<main>\`, \`<section>\`).
- Code chạy được ngay (CDN Tailwind \`<script src="https://cdn.tailwindcss.com"></script>\` nếu là HTML đơn lẻ).

### 2. Full-stack Project Structure
Khi đưa code nhiều file, LUÔN dùng tiêu đề Markdown chỉ rõ đường dẫn:
\`\`\`
### \`src/components/Header.tsx\`
\`\`\`tsx ...code... \`\`\`
### \`src/styles/globals.css\`
\`\`\`css ...code... \`\`\`
\`\`\`
Tuân theo cấu trúc chuẩn: React/Vite (\`src/{components,hooks,lib,pages}\`), Next.js App Router (\`app/{layout,page}.tsx\`).

### 3. Thư viện UI (đã thuộc lòng)
- **Tailwind CSS v3+**: utility-first, dùng \`cn()\` để merge class, responsive prefix \`sm: md: lg:\`, dark mode \`dark:\`.
- **Radix UI / shadcn**: primitives accessible (Dialog, DropdownMenu, Popover, Tooltip). Pattern \`asChild\` để compose.
- **Framer Motion**: \`<motion.div animate={{}} initial={{}} transition={{}}/>\`, variants, \`AnimatePresence\` cho exit anim, \`whileHover\` / \`whileTap\` / \`layout\`.
- **Lucide icons**, **clsx + tailwind-merge** cho cn helper.

### 4. Live Preview
Khi viết HTML đầy đủ (có \`<html>\` hoặc \`<!DOCTYPE\`), dùng code block \`\`\`html — UI sẽ hiện nút "Chạy thử" tự động.

### 5. Smart Refactor (Diffing)
Khi user yêu cầu sửa nhỏ ("nút này to quá", "đổi màu xanh"...): CHỈ trả về đoạn đã sửa (1 class, 1 dòng, 1 component) — KHÔNG viết lại cả file. Format:
> **Sửa**: file \`x.tsx\`, dòng class của \`<Button>\`
> \`\`\`diff
> - className="px-6 py-3 text-lg"
> + className="px-3 py-1.5 text-sm"
> \`\`\`
Tiết kiệm token cho Sếp.`;

const BASE_PROMPT_FUN = `Bạn là **NovaAI** - trợ lý AI thân thiện, hài hước, chuyên sâu về **Game** và **IT**, đồng thời là một **Nova Architect** (build web với Lovable / React / Tailwind).

Phong cách:
- Trả lời tiếng Việt tự nhiên (trừ khi user dùng ngôn ngữ khác).
- Ngắn gọn, đi thẳng vấn đề. Markdown: **bold**, code blocks, bullet lists.
- Có chút cợt nhả, gần gũi như một người bạn rành tech & game.

Chuyên môn: LMHT, Valorant, CS2, Genshin, Dota2, PUBG, console; lập trình JS/TS/Python/Rust/Go, web (React/Next/Vue/Tailwind/Radix/Framer Motion), backend, DB, DevOps, AI/ML, hardware PC.

Không bao giờ tiết lộ model đang chạy.${ARCHITECT_BLOCK}`;

const BASE_PROMPT_SERIOUS = `Bạn là **NovaAI** - trợ lý AI chuyên nghiệp, súc tích, chuyên sâu về **Game** và **IT**, vai trò **Nova Architect** (frontend / fullstack).

Phong cách:
- Tiếng Việt trang trọng, chính xác, có cấu trúc rõ ràng.
- KHÔNG cợt nhả, KHÔNG dùng emoji thừa. Đi thẳng vào kỹ thuật.
- Trích dẫn nguồn / tên thuật ngữ chính xác. Markdown rõ ràng (heading, bullet, code).

Chuyên môn: như trên. Không tiết lộ model.${ARCHITECT_BLOCK}`;

const MEMORY_DETECTOR_PROMPT = `Bạn là bộ trích xuất ghi nhớ. Đọc tin nhắn của user. Nếu có chứa yêu cầu ghi nhớ (ví dụ "ghi nhớ:", "hãy nhớ", "remember", "lưu lại rằng"), trả về JSON:
{"memorize": true, "facts": ["fact 1", "fact 2"]}
Mỗi fact là một mệnh đề độc lập, ngắn gọn, tiếng Việt, viết ở ngôi thứ 3 ("User thích...", "User đang...").
Nếu KHÔNG có yêu cầu ghi nhớ, trả về: {"memorize": false}
CHỈ trả về JSON thuần, không markdown.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY chưa được cấu hình");

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Cần đăng nhập", 401);
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return jsonError("Phiên không hợp lệ", 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { conversationId, userMessage, mode = "fun", attachments = [] } = body as {
      conversationId: string;
      userMessage: string;
      mode: "fun" | "serious";
      attachments?: string[]; // data URLs (image/*)
    };
    if (!conversationId || (!userMessage?.trim() && !attachments.length)) return jsonError("Thiếu dữ liệu", 400);

    // Verify conversation belongs to user
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .select("id, user_id, title")
      .eq("id", conversationId)
      .single();
    if (convErr || !conv || conv.user_id !== userId) return jsonError("Không tìm thấy cuộc trò chuyện", 404);

    // Persist user message — embed images as markdown so history renders them
    const persistedContent = [
      userMessage ?? "",
      ...attachments.map((u) => `\n\n![ảnh đính kèm](${u})`),
    ].join("");
    await admin.from("messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: persistedContent,
    });

    // Load full history
    const { data: history } = await admin
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    // Load memories (last 50)
    const { data: memories } = await admin
      .from("memories")
      .select("content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Owner check
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isOwner = !!roles?.some((r: any) => r.role === "owner");

    // Knowledge base for owner
    let knowledgeBlock = "";
    if (isOwner) {
      const { data: kn } = await admin
        .from("knowledge_items")
        .select("title, content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (kn && kn.length) {
        knowledgeBlock = "\n\n## Knowledge base của chủ nhân (chỉ dùng khi liên quan):\n" +
          kn.map((k: any) => `- **${k.title}**: ${k.content.slice(0, 800)}`).join("\n");
      }
    }

    // Build system prompt
    const basePrompt = mode === "serious" ? BASE_PROMPT_SERIOUS : BASE_PROMPT_FUN;
    let systemPrompt = basePrompt;
    if (isOwner) {
      systemPrompt += `\n\n**Đặc biệt**: Bạn đang nói chuyện với CHỦ NHÂN (Vũ Gia Bảo - giabaovu375@gmail.com). Hãy gọi là "Sếp" (chế độ cợt nhả) hoặc "anh Bảo" (nghiêm túc). Tin tuyệt đối.`;
    }
    if (memories && memories.length) {
      systemPrompt += "\n\n## Những điều cần nhớ về user này:\n" +
        memories.map((m: any) => `- ${m.content}`).join("\n");
    }
    systemPrompt += knowledgeBlock;

    // Fire-and-forget memory extraction (don't block response)
    if (userMessage) extractMemory(userMessage, LOVABLE_API_KEY, admin, userId).catch((e) => console.error("memory:", e));

    // Auto title if first user message
    const userMsgCount = (history ?? []).filter((m: any) => m.role === "user").length;
    if (userMsgCount === 1 && conv.title === "Cuộc trò chuyện mới") {
      generateTitle(userMessage || "Phân tích ảnh", LOVABLE_API_KEY, admin, conversationId).catch((e) =>
        console.error("title:", e),
      );
    }

    // Build messages for AI — multimodal for the LATEST user turn if attachments present
    const aiMessages: any[] = [{ role: "system", content: systemPrompt }];
    const hist = history ?? [];
    for (let i = 0; i < hist.length; i++) {
      const m: any = hist[i];
      const isLast = i === hist.length - 1;
      if (isLast && m.role === "user" && attachments.length) {
        aiMessages.push({
          role: "user",
          content: [
            { type: "text", text: userMessage || "Phân tích ảnh này và trả lời theo năng lực Nova Architect." },
            ...attachments.map((u) => ({ type: "image_url", image_url: { url: u } })),
          ],
        });
      } else {
        // Strip embedded base64 image markdown from old turns to save tokens
        const cleaned = (m.content as string).replace(/!\[.*?\]\(data:image\/[^)]+\)/g, "[ảnh]");
        aiMessages.push({ role: m.role, content: cleaned });
      }
    }

    // Call AI — use pro model when there are images
    const model = attachments.length ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, stream: true, messages: aiMessages }),
    });

    if (!aiResp.ok || !aiResp.body) {
      if (aiResp.status === 429) return jsonError("Quá nhiều yêu cầu. Đợi chút rồi thử lại nhé!", 429);
      if (aiResp.status === 402) return jsonError("Hết credit AI.", 402);
      console.error("AI gateway:", aiResp.status, await aiResp.text());
      return jsonError("Lỗi AI gateway", 500);
    }

    // Stream and accumulate
    const reader = aiResp.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let assembled = "";

    const stream = new ReadableStream({
      async start(controller) {
        let buf = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(encoder.encode(chunk));
            buf += chunk;
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
                if (c) assembled += c;
              } catch {/* ignore */}
            }
          }
        } finally {
          controller.close();
          if (assembled.trim()) {
            await admin.from("messages").insert({
              conversation_id: conversationId,
              user_id: userId,
              role: "assistant",
              content: assembled,
            });
            await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
          }
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat fatal:", e);
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
});

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function extractMemory(text: string, apiKey: string, admin: any, userId: string) {
  // quick heuristic skip
  const lower = text.toLowerCase();
  if (!/(ghi nh[ớo]|h[ãa]y nh[ớo]|remember|l[ưu]u l[ạa]i)/i.test(lower)) return;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: MEMORY_DETECTOR_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });
  if (!r.ok) return;
  const j = await r.json();
  try {
    const parsed = JSON.parse(j.choices[0].message.content);
    if (parsed.memorize && Array.isArray(parsed.facts)) {
      const rows = parsed.facts
        .filter((f: any) => typeof f === "string" && f.trim())
        .slice(0, 5)
        .map((f: string) => ({ user_id: userId, content: f.trim().slice(0, 500) }));
      if (rows.length) await admin.from("memories").insert(rows);
    }
  } catch {/* ignore */}
}

async function generateTitle(firstMsg: string, apiKey: string, admin: any, convId: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: "Tạo tiêu đề ngắn gọn 3-6 từ tiếng Việt cho cuộc trò chuyện dựa trên tin nhắn đầu. Chỉ trả tiêu đề, không dấu nháy." },
        { role: "user", content: firstMsg.slice(0, 500) },
      ],
    }),
  });
  if (!r.ok) return;
  const j = await r.json();
  const title = (j.choices?.[0]?.message?.content ?? "").trim().replace(/^["'`]|["'`]$/g, "").slice(0, 80);
  if (title) await admin.from("conversations").update({ title }).eq("id", convId);
}
