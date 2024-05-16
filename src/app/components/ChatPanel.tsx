import { Message } from "../types";
import { PromptForm } from "./PromptForm";

export interface ChatPanelProps {
  input: string;
  setInput: (value: string) => void;
  messages: Message[];
  setMessages: (value: Message[]) => void;
}
export function ChatPanel({
  input,
  setInput,
  messages,
  setMessages,
}: ChatPanelProps) {
  return (
    <div className="chat-panel-container">
      <div className="form-container">
        <PromptForm
          input={input}
          setInput={setInput}
          messages={messages}
          setMessages={setMessages}
        />
      </div>
    </div>
  );
}
