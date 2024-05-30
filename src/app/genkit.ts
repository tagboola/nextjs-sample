"use server";

import { Message, defineTool, generate } from "@genkit-ai/ai";
import { GenerateResponseChunkData, MessageData } from "@genkit-ai/ai/model";
import { StreamingCallback, configureGenkit } from "@genkit-ai/core";
import { defineFlow, streamFlow } from "@genkit-ai/flow";
import {
  gemini15Pro,
  googleAI,
  textEmbeddingGecko001,
} from "@genkit-ai/googleai";
import { firebase } from "@genkit-ai/firebase";
import * as z from "zod";
import {
  defineFirebaseAgent,
  defineFirestoreAgentMemory,
  firebaseAgent,
} from "./agent";
import { googleCloud } from "@genkit-ai/google-cloud";

configureGenkit({
  plugins: [
    googleAI({ apiVersion: ["v1beta", "v1"] }),
    firebase(),
    firebaseAgent(),
    googleCloud(),
  ],
  logLevel: "info",
  enableTracingAndMetrics: true,
  flowStateStore: "firebase",
  traceStore: "firebase",
  telemetry: {
    instrumentation: "googleCloud",
    logger: "googleCloud",
  },
});

// Restaurant bot

const readMenuTool = defineTool(
  {
    name: "readMenu",
    description: "Use this tool to see what is on any restaurant menu.",
    inputSchema: z.object({
      restaurant: z.string().describe("The name of the restaurant"),
    }),
    outputSchema: z.object({
      menuItems: z
        .array(z.string().describe("A food item"))
        .describe("An array of all the items on the menu"),
    }),
  },
  async (input: { restaurant: any }) => {
    // Implement the tool...
    console.log(`Reading the menu at ${input.restaurant}`);
    return {
      menuItems: ["Cheeseburger", "Fries"],
    };
  },
);

const makeReservationTool = defineTool(
  {
    name: "reserveTable",
    description: `Use this tool to reserve a table at any restaurant. 
      Make sure that you have all of the information from the customer 
      before attempting to make a reservation`,
    inputSchema: z.object({
      restaurant: z.string().describe("The name of the restaurant"),
      dateAndTime: z
        .string()
        .describe("The desired date and time of the reservation"),
      customerName: z
        .string()
        .describe("The customer name for the reservation"),
    }),
    outputSchema: z.object({
      reserved: z
        .boolean()
        .describe(
          "True if a table was reserved, or false if nothing was available",
        ),
      details: z
        .string()
        .describe("An explanantion for why the reservation was made or denied"),
    }),
  },
  async (input: { customerName: any; restaurant: any }) => {
    // Implement the tool...
    console.log(
      `Making a reservation for ${input.customerName} at ${input.restaurant}`,
    );
    return {
      reserved: false,
      details: "Busy signal",
    };
  },
);

const restaurantBotPreamblePrompt: MessageData[] = [
  {
    role: "user",
    content: [{ text: `Who are you? What can you do?` }],
  },
  {
    role: "model",
    content: [
      {
        text: `
    I am Walt, the incredible restaurant bot. I can answer most questions
    about all of the resturants in town. I can read their menus and 
    even make reservations for you using my tools. 
    
    I can also willingly answer any question at all about food, at length.
    I have a memory of what we've talked about in the past, but it's not perfect.
    `,
      },
    ],
  },
];

const memory = defineFirestoreAgentMemory({
  name: "restaurantBotMemory",
});

const restaurantBotFlow = defineFirebaseAgent(
  {
    name: "restaurantBot",
    indexer: memory.defineVectorIndexer({ embedder: textEmbeddingGecko001 }),
    retriever: memory.defineRecentAndSimilarHistoryRetriever({
      embedder: textEmbeddingGecko001,
      recentLimit: 4,
      similarLimit: 6,
    }),
    preamble: restaurantBotPreamblePrompt,
  },
  async (request, session, streamingCallback) => {
    const buffer: StreamBuffer | undefined = streamingCallback
      ? new StreamBuffer(streamingCallback, 3)
      : undefined;

    const modelResponse = await generate({
      model: gemini15Pro,
      prompt: request.message.content,
      history: session.messages,
      tools: [readMenuTool, makeReservationTool],
      config: {
        temperature: 0.25,
      },
      streamingCallback: (chunk: any) => {
        if (buffer) {
          buffer.push(chunk);
        }
      },
    });
    if (buffer) {
      // Wait for any remaining chunks to get streamed out before resolving the flow
      await buffer.end();
    }
    return modelResponse.candidates[0].message.content;
  },
);

// These need to be moved into the UI somewhere

export async function streamAgentFlow(
  userId: string,
  sessionId: string,
  prompt: string,
) {
  return streamFlow(restaurantBotFlow, {
    userId: userId,
    sessionId: sessionId,
    message: {
      role: "user",
      content: [{ text: prompt }],
    },
  });
}

const simpleFlow = defineFlow(
  {
    name: "agentFlow",
    inputSchema: z.string(),
    outputSchema: z.string(),
    streamSchema: z.string(),
  },
  async (
    prompt: string,
    streamingCallback: StreamingCallback<string> | undefined,
  ) => {
    const llmResponse = await generate({
      prompt: prompt,
      model: gemini15Pro,
      config: {
        temperature: 1,
      },
      streamingCallback: (chunk: { text: () => any }) => {
        console.log(`Chunk: ${JSON.stringify(chunk)}`);
        if (streamingCallback) {
          streamingCallback(chunk.text());
        }
      },
    });

    return llmResponse.text();
  },
);

export async function streamSimpleFlow(prompt: string) {
  return streamFlow(simpleFlow, prompt);
}

class StreamBuffer {
  private callback: StreamingCallback<GenerateResponseChunkData>;
  private buffer: Array<string>;
  private interval;
  private resolve: (() => void) | undefined;
  private index;

  constructor(
    callback: StreamingCallback<GenerateResponseChunkData>,
    chunkSize: number = 1,
  ) {
    this.callback = callback;
    this.buffer = [];
    this.interval = setInterval(() => {
      this.pop(chunkSize);
    }, 100);
    this.index = 0;
  }

  // Add a new chunk

  push(chunk: GenerateResponseChunkData) {
    const message = new Message({ role: "model", content: chunk.content });
    const words = message.text().split(" ");
    words.forEach((w: string) => this.buffer.push(w + " "));
  }

  // Pops off some number of words every interval and calls streaming callback

  private pop(chunkSize: number) {
    const nextWords = [];
    let nextWord;
    for (let c = 0; c < chunkSize; c++) {
      nextWord = this.buffer.shift();
      if (nextWord) {
        nextWords.push(nextWord);
      }
    }
    if (nextWords.length > 0) {
      this.callback({
        index: this.index,
        content: [{ text: nextWords.join(" ") }],
      });
      this.index += 1;
    } else if (this.resolve) {
      this.resolve();
      clearInterval(this.interval);
      return;
    }
  }

  // After all chunks have been added, await the promise returned before completing the flow

  end(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
    });
  }
}
