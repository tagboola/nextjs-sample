"use client";

import { FormEvent } from "react";
import { Message } from "../types";
import { nanoid } from "nanoid";

export function PromptForm({
  input,
  setInput,
  messages,
  setMessages,
}: {
  input: string;
  setInput: (value: string) => void;
  messages: Message[];
  setMessages: (value: Message[]) => void;
}) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Prevent the browser from reloading the page
    event.preventDefault();

    setInput("");
    const prompt = input.trim();
    if (!prompt) return;

    const userMessage: Message = {
      id: nanoid(),
      value: prompt,
      role: "user",
    };
    const completedMessages = [...messages, userMessage];
    setMessages(completedMessages);

    const modelMessageId = nanoid();
    const incompleteMessage: Message = {
      id: modelMessageId,
      role: "model",
    };
    setMessages([...messages, userMessage, incompleteMessage]);

    await generateResponse(
      prompt,
      completedMessages,
      incompleteMessage,
      setMessages
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="Enter prompt here"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      ></input>
    </form>
  );
}

/**
 * Generator function that streams the response body from a fetch request.
 */
export async function* streamingFetch(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const response = await fetch(input, init);
  const reader = response!.body!.getReader();
  const decoder = new TextDecoder("utf-8");

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    try {
      yield decoder.decode(value);
    } catch (e: any) {
      console.warn(e.message);
    }
  }
}

async function generateResponse(
  prompt: string,
  completedMessages: Message[],
  incompleteMessage: Message,
  setMessages: (value: Message[]) => void
) {
  const response = await fetch(
    `/api/stream/generate?prompt=${encodeURIComponent(prompt)}`
  );

  if (!response.body) {
    // Do something!
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder("utf-8");

  incompleteMessage.value = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    try {
      incompleteMessage.value += decoder.decode(value);
      setMessages([...completedMessages, incompleteMessage]);
    } catch (e: any) {
      console.warn(e.message);
    }
  }
}
