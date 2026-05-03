import { createFileRoute } from "@tanstack/react-router";
import { Chat } from "@/components/Chat";

export const Route = createFileRoute("/_app/c/$id")({
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  return <Chat conversationId={id} />;
}
