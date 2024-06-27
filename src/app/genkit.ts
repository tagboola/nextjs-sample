"use server";
import { Message, generate } from "@genkit-ai/ai";
import { GenerateResponseChunkData, MessageData } from "@genkit-ai/ai/model";
import { StreamingCallback, configureGenkit } from "@genkit-ai/core";
import { setCustomMetadataAttribute } from "@genkit-ai/core/tracing";
import { streamFlow } from "@genkit-ai/flow";
import { firebase } from "@genkit-ai/firebase";
import { googleCloud } from "@genkit-ai/google-cloud";
import {
  gemini15Flash,
  gemini15Pro,
  geminiPro,
  geminiProVision,
  googleAI,
  textEmbeddingGecko001,
} from "@genkit-ai/googleai";
import { AlwaysOnSampler } from "@opentelemetry/sdk-trace-base";
import {
  defineFirebaseAgent,
  defineFirestoreAgentMemory,
  firebaseAgent,
} from "./agent";
import { getRemoteConfig } from "firebase-admin/remote-config";
import { initializeApp } from "firebase-admin/app";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import {
  readMenuTool,
  flakyMenuTool,
  makeReservationTool,
} from "./genkit-tools";

// Force inclusion of protos needed for cloud telemtry exporter otherwise,
// bundling will strip them out, and we won't get traces!
require("google-proto-files");

// debug open telemetry issues
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const firebaseApp = initializeApp(
  { projectId: "nextjs-test-project-27ca7" },
  "nextjs-test-project",
);

configureGenkit({
  plugins: [
    googleAI({ apiVersion: ["v1beta", "v1"] }),
    firebase(),
    firebaseAgent(),
    googleCloud({
      // set to true to force telemetry export in 'dev'
      forceDevExport: true,
      // These are configured for demonstration purposes. Sensible defaults are
      // in place in the event that telemetryConfig is absent.
      telemetryConfig: {
        sampler: new AlwaysOnSampler(),
        autoInstrumentation: true,
        // autoInstrumentationConfig: {
        //   "@opentelemetry/instrumentation-fs": { enabled: false },
        //   "@opentelemetry/instrumentation-dns": { enabled: false },
        //   "@opentelemetry/instrumentation-net": { enabled: false },
        // },
      },
    }),
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

// Initialize remote config and provide defaults
const rc = getRemoteConfig(firebaseApp);
const template = rc.initServerTemplate({
  defaultConfig: {
    streaming_chunk_size: 3,
    model: "gemini15Flash",
    menu_tool: "stable",
  },
});
template.load();

// Restaurant bot

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

const tools = [readMenuTool, flakyMenuTool, makeReservationTool];

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
    tools: tools,
  },
  async (request, session, streamingCallback) => {
    // Evaluate the remote config template for the request
    const config = template.evaluate({
      randomizationId: request.sessionId,
    });
    const model = parseModel(config.getString("model"));
    const chunkSize = config.getNumber("streaming_chunk_size");
    const menuTool = config.getString("menu_tool");
    const requestTools =
      menuTool === "flaky"
        ? [flakyMenuTool, makeReservationTool]
        : [readMenuTool, makeReservationTool];
    setCustomMetadataAttribute("firebase/rc/param/menu_tool", menuTool);

    // Build buffer for streaming
    const buffer: StreamBuffer | undefined = streamingCallback
      ? new StreamBuffer(streamingCallback, chunkSize)
      : undefined;

    const modelResponse = await generate({
      model: model,
      prompt: request.message.content,
      history: session.messages,
      tools: requestTools,
      returnToolRequests: true, // agent loop will call the tools
      config: {
        temperature: 0.25,
      },
      streamingCallback: (chunk) => {
        if (buffer) {
          buffer.push(chunk);
        }
      },
    });
    if (buffer) {
      // Wait for any remaining chunks to get streamed out before resolving the flow
      await buffer.end();
    }

    return modelResponse.candidates[0].message;
  },
);

function parseModel(modelString: string) {
  switch (modelString) {
    case "gemini15Pro": {
      return gemini15Pro;
    }
    case "geminiPro": {
      return geminiPro;
    }
    case "geminiProVision": {
      return geminiProVision;
    }
    default: {
      return gemini15Flash;
    }
  }
}

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
  // Chunk text is added to the buffer
  // Data and media is ignored

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
