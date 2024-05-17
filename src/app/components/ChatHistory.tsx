import { Message } from "../types";
import { AgentChatMessage } from "./AgentChatMessage";
import { UserChatMessage } from "./UserChatMessage";

export interface ChatHistoryProps {
  messages: Message[];
}
export function ChatHistory({ messages }: ChatHistoryProps) {
  return (
    <div className="chat-history-container">
      <div className="chat-history">
        {messages.map((message, index) => {
          if (message.role === "user") {
            return (
              <UserChatMessage
                message={message}
                key={message.id}
              ></UserChatMessage>
            );
          } else {
            return (
              <AgentChatMessage
                message={message}
                key={message.id}
              ></AgentChatMessage>
            );
          }
        })}
      </div>
    </div>
  );
}
