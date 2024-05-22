"use server";

import { generate, generateStream } from "@genkit-ai/ai";
import { configureGenkit } from "@genkit-ai/core";
import { defineFlow, runFlow, streamFlow } from "@genkit-ai/flow";
import { MessageData } from "@genkit-ai/ai/model";
import { geminiPro } from "@genkit-ai/googleai";
import * as z from "zod";
import { googleAI } from "@genkit-ai/googleai";
import {
  firebaseAgent,
  defineFirebaseAgent,
  defineFirestoreAgentMemory,
} from "./agent";

configureGenkit({
  plugins: [googleAI(), firebaseAgent()],
  logLevel: "debug",
  enableTracingAndMetrics: true,
});

// Restaurant bot

const restaurantBotPreamblePrompt: MessageData[] = [
  {
    role: "user",
    content: [{ text: `Who are you?` }],
  },
  {
    role: "model",
    content: [
      {
        text: `
    I am Walt, the incredible restaurant bot. I can answer most questions
    about all of the resturants in town. I can read their menus and 
    even make reservations for you. How can I help you today?
    `,
      },
    ],
  },
];

const memory = defineFirestoreAgentMemory({
  name: "restaurantBotMemory",
});

const restaurantBot = defineFirebaseAgent(
  {
    name: "restaurantBot",
    indexer: memory.defineIndexer(),
    retriever: memory.definePartialHistoryRetriever({
      limit: 4,
    }),
    preamble: restaurantBotPreamblePrompt,
  },
  async (request, session) => {
    // Call gemini to handle each customer message.
    // Provide the latest message and the history from the session.
    // Make the tools available

    const modelResponse = await generate({
      model: geminiPro,
      prompt: request.message.content,
      history: session.messages,
      tools: [
        // write some tools!
      ],
    });

    // Just return the model response
    // It will automatically be added to the session history
    return [{ text: modelResponse.text() }];
  }
);

const userId = "user001";
const sessionId = "session001";

const agentFlow = defineFlow(
  {
    name: "agentFlow",
    inputSchema: z.string(),
    outputSchema: z.string(),
    streamSchema: z.string(),
  },
  async (prompt, streamingCallback) => {
    const llmResponse = await generate({
      prompt: prompt,
      model: restaurantBot,
      config: {
        temperature: 0.5,
        agent: {
          userId: userId,
          sessionId: sessionId,
        },
      },
      streamingCallback: (chunk) => {
        console.log(`Chunk: ${JSON.stringify(chunk)}`);
        if (streamingCallback) {
          streamingCallback(chunk.text());
        }
      },
    });

    return llmResponse.text();
  }
);

export async function streamAgentFlow(prompt: string) {
  return streamFlow(agentFlow, prompt);
}
