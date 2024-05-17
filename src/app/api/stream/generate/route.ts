import { NextRequest } from "next/server";
import { StreamingResponse } from "../StreamingResponse";
import { makeStream } from "../makeStream";

// Generate a stream of data by returning an [AsyncGenerator]
async function* generateStream(
  req: NextRequest
): AsyncGenerator<string, void, unknown> {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const response = `Sorry, my agent-ing skills aren't good enough to handle the request "${req.nextUrl.searchParams.get(
    "prompt"
  )}."`;
  for (const c of response) {
    yield c;
    await new Promise((r) => setTimeout(r, 25));
  }
}

// Route handler for `/api/stream/generate`. Returns a [StreamingResponse]
export async function GET(req: NextRequest) {
  const stream = await makeStream(generateStream(req));
  const response = new StreamingResponse(stream);
  return response;
}
