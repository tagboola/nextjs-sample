import { embed, EmbedderArgument, embedderRef } from "@genkit-ai/ai/embedder";
import { MessageData } from "@genkit-ai/ai/model";
import { Message } from "@genkit-ai/ai";
import {
  defineIndexer,
  defineRetriever,
  DocumentData,
  IndexerAction,
  retrieve,
  RetrieverAction,
  RetrieverReference,
} from "@genkit-ai/ai/retriever";
import {
  CollectionReference,
  DocumentReference,
  FieldValue,
  Firestore,
} from "@google-cloud/firestore";
import { FirebaseAgentCustomOptionsSchema } from "./types";

interface FirebaseAgentMessageDocument {
  timestamp: number;
  message: MessageData;
  embedding?: FirebaseFirestore.VectorValue;
}

export function defineFirestoreAgentMemory(options: {
  name: string;
  firestore?: { database?: string };
}): FirestoreAgentMemory {
  return new FirestoreAgentMemory({
    name: options.name,
    firestore: {
      database: options.firestore?.database || "(default)",
    },
  });
}

export class FirestoreAgentMemory {
  private name: string;
  private db: Firestore;
  private firestoreDocumentRef: DocumentReference;

  constructor(options: { name: string; firestore: { database: string } }) {
    this.name = `firebase-agent/${options.name}`;
    this.db = new Firestore({
      databaseId: options.firestore.database,
      ignoreUndefinedProperties: true,
    });
    this.firestoreDocumentRef = this.db.collection("agents").doc(options.name);
  }

  // Defines a normal indexer which saves all messages to Firestore.

  defineIndexer(): IndexerAction<typeof FirebaseAgentCustomOptionsSchema> {
    return defineIndexer(
      {
        name: this.name,
        configSchema: FirebaseAgentCustomOptionsSchema,
      },
      async (messages, options) => {
        const messagesCollectionRef = this.messagesCollection(
          options.userId,
          options.sessionId
        );
        const batch = this.db.batch();
        let timestamp = Date.now();
        messages.forEach((message, index) => {
          const doc: FirebaseAgentMessageDocument = {
            timestamp: timestamp + index, // maintain ordering
            message: message.metadata?.message,
          };
          batch.create(messagesCollectionRef.doc(), doc as any);
        });
        await batch.commit();
      }
    );
  }

  // Defines a vector indexer which also saves an embedding vector for similarity search

  defineVectorIndexer(params: {
    embedder: EmbedderArgument;
    name?: string;
  }): IndexerAction<typeof FirebaseAgentCustomOptionsSchema> {
    return defineIndexer(
      {
        name: params.name || this.name,
        configSchema: FirebaseAgentCustomOptionsSchema,
      },
      async (indexDocs, options) => {
        const messagesCollectionRef = this.messagesCollection(
          options.userId,
          options.sessionId
        );
        const batch = this.db.batch();
        let timestamp = Date.now();
        const indexAll = indexDocs.map(
          async (indexDoc, index): Promise<void> => {
            // Call the embedder
            const embedVector = await embed({
              embedder: params.embedder,
              content: indexDoc,
            });
            // Create the document
            const doc: FirebaseAgentMessageDocument = {
              timestamp: timestamp + index,
              message: indexDoc.metadata?.message,
              embedding: FieldValue.vector(embedVector),
            };
            batch.create(messagesCollectionRef.doc(), doc as any);
          }
        );
        await Promise.all(indexAll);
        await batch.commit();
      }
    );
  }

  // Defines a retriever which returns the full session history for all requests.

  defineFullHistoryRetriever(): RetrieverAction<
    typeof FirebaseAgentCustomOptionsSchema
  > {
    return this.definePartialHistoryRetriever({ limit: 1000 });
  }

  // Defines a retriever which returns the last N messages for each session.
  // Limit can be set but defaults to 4 messages.

  definePartialHistoryRetriever(params?: {
    limit?: number;
    name?: string;
  }): RetrieverAction<typeof FirebaseAgentCustomOptionsSchema> {
    return defineRetriever(
      {
        name: params?.name || this.name,
        configSchema: FirebaseAgentCustomOptionsSchema,
        info: {
          label: `${this.name} Agent Memory Full History`,
        },
      },
      async (input, options) => {
        const queryResult = await this.messagesCollection(
          options.userId,
          options.sessionId
        )
          .orderBy("timestamp", "desc")
          .limit(params?.limit || 10)
          .get();
        let results: DocumentData[] = [];
        queryResult.forEach((record) => {
          const doc = record.data() as FirebaseAgentMessageDocument;
          results.push({
            content: [{ text: new Message(doc.message).text() }],
            metadata: { message: doc.message, timestamp: doc.timestamp },
          });
        });
        return { documents: FirestoreAgentMemory.sortByTimestamp(results) };
      }
    );
  }

  // Defines a retriever which performs a vector similarity search and returns
  // N messages in the session which are most relevant to the current query.

  defineVectorSimilarityHistoryRetriever(params: {
    embedder: EmbedderArgument;
    limit?: number;
    name?: string;
  }): RetrieverReference<typeof FirebaseAgentCustomOptionsSchema> {
    return defineRetriever(
      {
        name: params?.name || this.name,
        configSchema: FirebaseAgentCustomOptionsSchema,
        info: {
          label: `${this.name} Agent Memory Vector`,
        },
      },
      async (input, options) => {
        const embedVector = await embed({
          embedder: params.embedder,
          content: input,
        });
        const queryResult = await this.messagesCollection(
          options.userId,
          options.sessionId
        )
          .findNearest("embedding", embedVector, {
            limit: params.limit || 10,
            distanceMeasure: "COSINE",
          })
          .get();
        let results: DocumentData[] = [];
        queryResult.forEach((record) => {
          const doc = record.data() as FirebaseAgentMessageDocument;
          results.push({
            content: [{ text: new Message(doc.message).text() }],
            metadata: { message: doc.message, timestamp: doc.timestamp },
          });
        });
        return { documents: FirestoreAgentMemory.sortByTimestamp(results) };
      }
    );
  }

  // Define a complex retriever which always returns the most recent N messages
  // and an additional M message which are semantically similar to the prompt.
  // This works by defining the two above retrievers and combining their results.

  defineRecentAndSimilarHistoryRetriever(params: {
    embedder: EmbedderArgument;
    recentLimit?: number;
    similarLimit?: number;
    name?: string;
  }) {
    const recentRetriever = this.definePartialHistoryRetriever({
      limit: params.recentLimit || 4,
      name: (params.name || this.name) + "Recent",
    });
    const similarityRetriever = this.defineVectorSimilarityHistoryRetriever({
      embedder: params.embedder,
      limit: params.similarLimit || 6,
      name: (params.name || this.name) + "Similar",
    });

    return defineRetriever(
      {
        name: params?.name || this.name,
        configSchema: FirebaseAgentCustomOptionsSchema,
        info: {
          label: `${this.name} Agent Memory Recent and Similar`,
        },
      },
      async (input, options) => {
        const recentResults = await retrieve({
          retriever: recentRetriever,
          query: input,
          options: options,
        });
        const similarResults = await retrieve({
          retriever: similarityRetriever,
          query: input,
          options: options,
        });
        // Use the timestamps to deduplicate the messages
        // since there could be overlap in the result sets
        const messages: Record<number, DocumentData> = {};
        recentResults.forEach((doc) => {
          messages[doc.metadata?.timestamp] = doc;
        });
        similarResults.forEach((doc) => {
          messages[doc.metadata?.timestamp] = doc;
        });
        return {
          documents: FirestoreAgentMemory.sortByTimestamp(
            Object.values(messages)
          ),
        };
      }
    );
  }

  private static sortByTimestamp(messages: DocumentData[]) {
    return messages.sort((m1, m2) => {
      return (m1.metadata?.timestamp || 0) > (m2.metadata?.timestamp || 0)
        ? 1
        : -1;
    });
  }

  // Messages are stored in a collection at
  // {database}/agents/{name}/users/{userId}/sessions/{sessionId}/messages

  private messagesCollection(
    userId: string,
    sessionId: string
  ): CollectionReference {
    return this.firestoreDocumentRef
      .collection("users")
      .doc(userId)
      .collection("sessions")
      .doc(sessionId)
      .collection("messages");
  }
}
