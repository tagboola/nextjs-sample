import { Message } from "../types";
import { AgentChatMessage } from "./AgentChatMessage";
import { UserChatMessage } from "./UserChatMessage";
import { useRef, useEffect } from "react";

export interface ChatHistoryProps {
  messages: Message[];
}
export function ChatHistory({ messages }: ChatHistoryProps) {
  const messagesEndRef: any = useRef(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        <div ref={messagesEndRef}>&nbsp;</div>
      </div>
    </div>
  );
}
