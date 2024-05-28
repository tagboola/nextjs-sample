import {
  GenerateResponseChunkData,
  GenerationCommonConfigSchema,
  MessageSchema,
  Part,
} from "@genkit-ai/ai/model";
import { StreamingCallback } from "@genkit-ai/core";
import * as z from "zod";

export const FirebaseAgentMessageSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  message: MessageSchema,
});

export type FirebaseAgentMessage = z.infer<typeof FirebaseAgentMessageSchema>;

export const FirebaseAgentSessionSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  messages: z.array(MessageSchema),
});

export type FirebaseAgentSession = z.infer<typeof FirebaseAgentSessionSchema>;

// The customer implements an agent function, which accepts the request
// along with a session fetched from the memory, and returns message content.

export type FirebaseAgentFn = (
  request: FirebaseAgentMessage,
  session: FirebaseAgentSession,
  streamingCallback: StreamingCallback<GenerateResponseChunkData> | undefined
) => Promise<Part[]>;

// Agent model custom options

export const FirebaseAgentCustomOptionsSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
});

export type FirebaseAgentCustomOptions = z.infer<
  typeof FirebaseAgentCustomOptionsSchema
>;

export const FirebaseAgentConfigSchema = GenerationCommonConfigSchema.extend({
  agent: FirebaseAgentCustomOptionsSchema,
});
