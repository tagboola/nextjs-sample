export class StreamingResponse extends Response {
  write(arg0: string) {
    throw new Error("Method not implemented.");
  }
  constructor(res: ReadableStream<any>, init?: ResponseInit) {
    super(res as any, {
      ...init,
      status: 200,
      headers: {
        ...init?.headers,
      },
    });
  }
}
