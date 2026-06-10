// Shared helper for import routes that report live progress to the client.
// Emits newline-delimited JSON ("ndjson") events:
//   {"type":"progress","phase":"Projects","done":120,"total":2518}
//   {"type":"done","result":{...}}
//   {"type":"error","message":"..."}
//
// Routes that don't need progress reporting (e.g. /api/import/divisions)
// can keep returning plain JSON via ok()/err() — the client's
// postWithProgress() falls back to res.json() when the response isn't ndjson.

export type ImportProgressEvent =
  | { type: "progress"; phase: string; done: number; total: number }
  | { type: "done"; result: Record<string, unknown> }
  | { type: "error"; message: string };

export type SendProgress = (event: ImportProgressEvent) => void;

export function streamImport(run: (send: SendProgress) => Promise<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send: SendProgress = (event) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        const result = await run(send);
        send({ type: "done", result });
      } catch (e: unknown) {
        send({ type: "error", message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
