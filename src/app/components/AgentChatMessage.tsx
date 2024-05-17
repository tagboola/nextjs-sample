import { Message } from "../types";

export interface AgentChatMessageProps {
  message: Message;
}
export function AgentChatMessage({ message }: AgentChatMessageProps) {
  if (message.value && message.value.length > 0) {
    return <div className="chat-message-container">{message.value}</div>;
  } else {
    return <div className="chat-message-container loading">Agent-ting</div>;
  }
}
