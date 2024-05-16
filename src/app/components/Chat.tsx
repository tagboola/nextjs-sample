"use client";

import { useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { ChatHistory } from "./ChatHistory";
import { Message } from "../types";

export interface ChatProps {}
export function Chat({}: ChatProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  return (
    <div className="chat-container">
      <ChatHistory messages={messages}></ChatHistory>
      <ChatPanel
        input={input}
        setInput={setInput}
        messages={messages}
        setMessages={setMessages}
      ></ChatPanel>
    </div>
  );
}
