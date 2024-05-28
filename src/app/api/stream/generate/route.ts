import { NextRequest, NextResponse } from "next/server";
import { StreamingResponse } from "../StreamingResponse";
import { makeStream } from "../makeStream";
import { streamAgentFlow, streamSimpleFlow } from "../../../genkit";
import { GenerateResponseChunkData } from "@genkit-ai/ai/model";
import { Message } from "@genkit-ai/ai";

// Generate a stream of data by returning an [AsyncGenerator]
async function* generateStreamFromPrompt(
  userId: string,
  sessionId: string,
  prompt: string
): AsyncGenerator<string, any, unknown> {
  const response = await streamAgentFlow(userId, sessionId, prompt);

  let outputStreamed = false;
  for await (const chunk of response.stream()) {
    const grcd = chunk as GenerateResponseChunkData;
    outputStreamed = true;
    // yield chunk as string;
    yield new Message({ role: "model", content: grcd.content }).text();
  }

  if (!outputStreamed) {
    const output = await response.output();
    yield new Message(output.message).text();
  }
}

// Route handler for `/api/stream/generate`. Returns a [StreamingResponse]
export async function GET(req: NextRequest) {
  const prompt = req.nextUrl.searchParams.get("prompt");
  const userId = "user001";
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!prompt) {
    throw NextResponse.json("Request must include a prompt", { status: 401 });
  }
  if (!sessionId) {
    throw NextResponse.json("Request must include a sessionId", {
      status: 401,
    });
  }

  const stream = await makeStream(
    generateStreamFromPrompt(userId, sessionId, prompt)
  );
  const response = new StreamingResponse(stream);
  return response;
}
