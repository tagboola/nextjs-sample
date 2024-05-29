import { index, Message, retrieve } from "@genkit-ai/ai";
import {
  defineModel,
  GenerateResponseChunkData,
  GenerateResponseChunkSchema,
  MessageData,
  Part,
} from "@genkit-ai/ai/model";
import { IndexerArgument, RetrieverArgument } from "@genkit-ai/ai/retriever";
import { defineFlow, runFlow, streamFlow } from "@genkit-ai/flow";

import {
  FirebaseAgentConfigSchema,
  FirebaseAgentCustomOptions,
  FirebaseAgentCustomOptionsSchema,
  FirebaseAgentFn,
  FirebaseAgentMessage,
  FirebaseAgentMessageSchema,
} from "./types";

// Define a Firebase agent
// Defines a flow and a model which implement the agent behavior

export function defineFirebaseAgent(
  options: {
    name: string;
    indexer: IndexerArgument<typeof FirebaseAgentCustomOptionsSchema>;
    retriever: RetrieverArgument<typeof FirebaseAgentCustomOptionsSchema>;
    preamble?: MessageData[];
  },
  fn: FirebaseAgentFn
) {
  const registryKey = `firebase-agent/${options.name}`;

  const flowAction = defineFlow(
    {
      name: registryKey,
      inputSchema: FirebaseAgentMessageSchema,
      outputSchema: FirebaseAgentMessageSchema,
      streamSchema: GenerateResponseChunkSchema,
    },
    async (
      request: FirebaseAgentMessage,
      streamingCallback
    ): Promise<FirebaseAgentMessage> => {
      // Some set of previous messages will be fetched according to the retriever's logic
      const documents = await retrieve({
        retriever: options.retriever,
        query: new Message(request.message).text(),
        options: {
          userId: request.userId,
          sessionId: request.sessionId,
        },
      });
      // The retrieved messages are appended to the preamble
      const previousMessages: MessageData[] = (options.preamble || []).concat(
        documents.map((doc) => doc.metadata?.message as MessageData)
      );
      // Ensure that the retrieved session is a valid exchange, ending with a model message
      const validSession = makeValidExchange(previousMessages);
      // Call the developer's agent function
      const agentFnResponse: Part[] = await fn(
        request,
        {
          userId: request.userId,
          sessionId: request.sessionId,
          messages: validSession,
        },
        streamingCallback
      );
      const agentMessageData: MessageData = {
        role: "model",
        content: agentFnResponse,
      };
      // Add both the user message and the agent response to the session using the indexer
      await index({
        indexer: options.indexer,
        options: {
          userId: request.userId,
          sessionId: request.sessionId,
        },
        documents: [
          {
            content: [{ text: new Message(request.message).text() }],
            metadata: {
              message: request.message,
            },
          },
          {
            content: [{ text: new Message(agentMessageData).text() }],
            metadata: {
              message: { role: "model", content: agentFnResponse },
            },
          },
        ],
      });
      // Return the agent's message
      return {
        userId: request.userId,
        sessionId: request.sessionId,
        message: agentMessageData,
      };
    }
  );

  const modelAction = defineModel(
    {
      name: registryKey,
      label: "Agent",
      configSchema: FirebaseAgentConfigSchema,
      supports: {
        multiturn: true,
        media: true,
        systemRole: true,
        tools: true,
        output: ["text"],
      },
    },
    async (request, streamingCallback) => {
      let userId: any = request.config?.agent?.userId;
      let sessionId: any = request.config?.agent?.sessionId;
      if (userId === undefined || sessionId === undefined) {
        // Hack incoming...
        // Custom params aren't supported in the model playground yet.
        // Set them in the system prompt as JSON
        // {"userId": "u1111", "sessionId": "s1111"}
        const systemMessage = request.messages[0];
        if (systemMessage.role === "system") {
          const customParams = JSON.parse(
            systemMessage.content[0].text || ""
          ) as FirebaseAgentCustomOptions;
          userId = customParams.userId;
          sessionId = customParams.sessionId;
        }
      }
      if (userId === undefined || sessionId === undefined) {
        throw new Error(
          "The userId and sessionId missing. Add them to the system prompt."
        );
      }
      const flowInput: FirebaseAgentMessage = {
        userId: userId,
        sessionId: sessionId,
        message: request.messages.at(-1) || {
          role: "user",
          content: [{ text: "" }],
        },
      };

      let resultMessage: MessageData | undefined;
      if (streamingCallback) {
        // Stream result from flow
        const streamingFlow = streamFlow(flowAction, flowInput);
        const gen = function* (chunk: GenerateResponseChunkData) {
          if (streamingCallback) {
            yield streamingCallback(chunk as GenerateResponseChunkData);
          }
        };
        for await (const chunk of streamingFlow.stream()) {
          gen(chunk as GenerateResponseChunkData);
        }
        const flowResult = await streamingFlow.output();
        resultMessage = flowResult.message;
      } else {
        // No stream
        const flowResult = await runFlow(flowAction, flowInput);
        resultMessage = flowResult.message;
      }
      return {
        candidates: [
          {
            index: 0,
            message: resultMessage,
            finishReason: "stop",
            custom: {},
          },
        ],
      };
    }
  );

  return flowAction;
}

// Some models (Gemini) require history to be a strict exchange
// user / model / user / etc.
// This modifies any partial history retrieval to be a valid exchange

function makeValidExchange(messages: MessageData[]): MessageData[] {
  type Role = "model" | "tool" | "system" | "user";
  let next: MessageData | undefined = messages.shift();
  let nextRole: Role | undefined = next?.role;
  let prev: MessageData | undefined;
  let prevRole: Role | undefined;
  const validHistory: MessageData[] = [];
  const pushOkMessage = (role: Role) => {
    validHistory.push({ role: role, content: [{ text: "OK" }] });
  };

  while (next) {
    if (prevRole === "user" && nextRole === "user") {
      pushOkMessage("model");
      validHistory.push(next);
    } else if (prevRole === "model" && nextRole === "model") {
      pushOkMessage("user");
      validHistory.push(next);
    } else if (prevRole === "tool" && nextRole === "user") {
      pushOkMessage("model");
      validHistory.push(next);
    } else if (prevRole === "system" && nextRole === "model") {
      pushOkMessage("user");
      validHistory.push(next);
    } else {
      validHistory.push(next);
    }
    prev = next;
    prevRole = nextRole;
    next = messages.shift();
    nextRole = next?.role;
  }
  if (prevRole != "model") {
    pushOkMessage("model");
  }
  return validHistory;
}
