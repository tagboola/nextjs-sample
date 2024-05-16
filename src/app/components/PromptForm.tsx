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
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    // Prevent the browser from reloading the page
    event.preventDefault();

    setInput("");
    const value = input.trim();
    if (!value) return;

    setMessages([
      ...messages,
      {
        id: nanoid(),
        value: value,
      },
    ]);
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
