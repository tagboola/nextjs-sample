// Takes an [AsyncGenerator] and returns a [ReadableStream] which can be
export const makeStream = async <T extends string>(
  generator: AsyncGenerator<T, void, unknown>
) => {
  const encoder = new TextEncoder();
  return new ReadableStream<any>({
    async start(controller) {
      for await (let chunk of generator) {
        const chunkData = encoder.encode(await chunk);
        controller.enqueue(chunkData);
      }
      controller.close();
    },
  });
};
