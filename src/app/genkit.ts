"use server";

import { generate, generateStream } from "@genkit-ai/ai";
import { configureGenkit } from "@genkit-ai/core";
import { defineFlow, runFlow, streamFlow } from "@genkit-ai/flow";
import { geminiPro } from "@genkit-ai/googleai";
import * as z from "zod";
import { googleAI } from "@genkit-ai/googleai";

configureGenkit({
  plugins: [googleAI()],
  logLevel: "debug",
  enableTracingAndMetrics: true,
});

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
      model: geminiPro,
      config: {
        temperature: 1,
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
