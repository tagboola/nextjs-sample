import { embed, EmbedderArgument } from '@genkit-ai/ai/embedder';
import { MessageData } from '@genkit-ai/ai/model';
import {
  defineIndexer,
  defineRetriever,
  DocumentData,
  IndexerAction,
  RetrieverAction,
  RetrieverReference,
} from '@genkit-ai/ai/retriever';
import {
  CollectionReference,
  DocumentReference,
  FieldValue,
  Firestore,
} from '@google-cloud/firestore';
import { FirebaseAgentCustomOptionsSchema } from './types';

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
      database: options.firestore?.database || '(default)',
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
    this.firestoreDocumentRef = this.db.collection('agents').doc(options.name);
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
  }): IndexerAction<typeof FirebaseAgentCustomOptionsSchema> {
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
        const indexAll = messages.map(async (message, index): Promise<void> => {
          // Call the embedder
          const embedVector = await embed({
            embedder: params.embedder,
            content: message,
          });
          // Create the document
          const doc: FirebaseAgentMessageDocument = {
            timestamp: timestamp + index,
            message: message.metadata?.message,
            embedding: FieldValue.vector(embedVector),
          };
          batch.create(messagesCollectionRef.doc(), doc as any);
        });
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
  }): RetrieverAction<typeof FirebaseAgentCustomOptionsSchema> {
    return defineRetriever(
      {
        name: this.name,
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
          .orderBy('timestamp', 'desc')
          .limit(params?.limit || 4)
          .get();
        let results: DocumentData[] = [];
        queryResult.forEach((record) => {
          const doc = record.data() as FirebaseAgentMessageDocument;
          results.push({
            content: [{ text: '' }],
            metadata: { message: doc.message },
          });
        });
        return { documents: results };
      }
    );
  }

  // Defines a retriever which performs a vector similarity search and returns
  // N messages in the session which are most relevant to the current query.

  defineVectorSimilarityHistoryRetriever(params: {
    embedder: EmbedderArgument;
    limit?: number;
  }): RetrieverReference<typeof FirebaseAgentCustomOptionsSchema> {
    return defineRetriever(
      {
        name: this.name,
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
          .findNearest('embedding', embedVector, {
            limit: params.limit || 5,
            distanceMeasure: 'COSINE',
          })
          .get();
        let results: DocumentData[] = [];
        queryResult.forEach((record) => {
          const doc = record.data() as FirebaseAgentMessageDocument;
          results.push({
            content: [{ text: '' }],
            metadata: { message: doc.message },
          });
        });
        return { documents: FirestoreAgentMemory.sortByTimestamp(results) };
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
      .collection('users')
      .doc(userId)
      .collection('sessions')
      .doc(sessionId)
      .collection('messages');
  }
}
