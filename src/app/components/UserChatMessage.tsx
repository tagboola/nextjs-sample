import { Message } from "../types";

export interface UserChatMessage {
  message: Message;
}
export function UserChatMessage({ message }: UserChatMessage) {
  return <div className="chat-message-container">{message.value}</div>;
}
