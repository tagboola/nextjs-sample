import { Message } from "../types";
import { PromptForm } from "./PromptForm";

export interface ChatHistoryProps {
  messages: Message[];
}
export function ChatHistory({ messages }: ChatHistoryProps) {
  return (
    <div className="chat-history-container">
      {messages.map((message, index) => {
        return (
          <div className="message" key={message.id}>
            {message.value}
          </div>
        );
      })}
    </div>
  );
}
