import { index, Message, retrieve } from '@genkit-ai/ai';
import { defineModel, MessageData, Part } from '@genkit-ai/ai/model';
import { IndexerArgument, RetrieverArgument } from '@genkit-ai/ai/retriever';
import { defineFlow, runFlow } from '@genkit-ai/flow';
import {
  FirebaseAgentConfigSchema,
  FirebaseAgentCustomOptions,
  FirebaseAgentCustomOptionsSchema,
  FirebaseAgentFn,
  FirebaseAgentMessage,
  FirebaseAgentMessageSchema,
} from './types';

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
    },
    async (request: FirebaseAgentMessage): Promise<FirebaseAgentMessage> => {
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
      // Call the developer's agent function
      const agentFnResponse: Part[] = await fn(request, {
        userId: request.userId,
        sessionId: request.sessionId,
        messages: previousMessages,
      });
      const agentMessageData: MessageData = {
        role: 'model',
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
              message: { role: 'model', content: agentFnResponse },
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
      label: 'Agent',
      configSchema: FirebaseAgentConfigSchema,
      supports: {
        multiturn: true,
        media: true,
        systemRole: true,
        tools: true,
        output: ['text'],
      },
    },
    async (request) => {
      let userId: any = request.config?.agent?.userId;
      let sessionId: any = request.config?.agent?.sessionId;
      if (userId === undefined || sessionId === undefined) {
        // Hack incoming...
        // Custom params aren't supported in the model playground yet.
        // Set them in the system prompt as JSON
        // {"userId": "u1111", "sessionId": "s1111"}
        const systemMessage = request.messages[0];
        if (systemMessage.role === 'system') {
          const customParams = JSON.parse(
            systemMessage.content[0].text || ''
          ) as FirebaseAgentCustomOptions;
          userId = customParams.userId;
          sessionId = customParams.sessionId;
        }
      }
      if (userId === undefined || sessionId === undefined) {
        throw new Error(
          'The userId and sessionId missing. Add them to the system prompt.'
        );
      }
      const flowInput: FirebaseAgentMessage = {
        userId: userId,
        sessionId: sessionId,
        message: request.messages.at(-1) || {
          role: 'user',
          content: [{ text: '' }],
        },
      };
      const flowResult: FirebaseAgentMessage = await runFlow(
        flowAction,
        flowInput
      );
      return {
        candidates: [
          {
            index: 0,
            message: flowResult.message,
            finishReason: 'other',
            custom: {},
          },
        ],
        custom: {},
        usage: {},
      };
    }
  );

  return modelAction;
}
