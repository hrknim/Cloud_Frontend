import type { Readable } from "node:stream";

// Pull instead of forwarding 'data' events: cancellation can close the Web
// controller while Readable.toWeb still has a scheduled Node resume tick.
export function responseStream(source: Readable, signal: AbortSignal): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]() as AsyncIterator<Uint8Array>;
  let stopped = false;
  let abort: () => void;
  const stop = () => {
    stopped = true;
    signal.removeEventListener("abort", abort);
    source.destroy();
  };
  const release = async () => {
    // Destroying an iterator with a pending read can reject with AbortError.
    // This is expected only after cancellation; normal read errors propagate.
    try { await iterator.return?.(); } catch { /* canceled read */ }
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        if (stopped) return;
        stop();
        controller.error(new DOMException("Request aborted", "AbortError"));
        void release();
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    },
    async pull(controller) {
      if (stopped) return;
      try {
        const result = await iterator.next();
        if (stopped) return;
        if (result.done) {
          stop();
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      } catch (error) {
        if (stopped) return;
        stop();
        controller.error(error);
      }
    },
    async cancel() {
      if (stopped) return;
      stop();
      await release();
    },
  });
}
