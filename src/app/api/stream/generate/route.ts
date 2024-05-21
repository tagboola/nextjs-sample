import { NextRequest, NextResponse } from "next/server";
import { StreamingResponse } from "../StreamingResponse";
import { makeStream } from "../makeStream";
import { streamAgentFlow } from "../../../genkit";

// Generate a stream of data by returning an [AsyncGenerator]
async function* generateStreamFromPrompt(
  prompt: string
): AsyncGenerator<string, any, unknown> {
  const response = await streamAgentFlow(prompt);

  let outputStreamed = false;
  for await (const chunk of response.stream()) {
    console.log(`Stream chunk: ${chunk}`);
    yield chunk as string;
    outputStreamed = true;
  }

  if (!outputStreamed) {
    yield await response.output();
  }
}

// Route handler for `/api/stream/generate`. Returns a [StreamingResponse]
export async function GET(req: NextRequest) {
  const prompt = req.nextUrl.searchParams.get("prompt");
  if (!prompt) {
    throw NextResponse.json("Request must include a prompt", { status: 404 });
  }

  const stream = await makeStream(generateStreamFromPrompt(prompt));
  const response = new StreamingResponse(stream);
  return response;
}
