// ------------------------------------------------------------------
//  Proposal engine worker: runs runEngine off the main thread.
//
//  The engine projects and hidden-line processes tens of thousands of triangles (hundreds of ms to seconds). On the
//  main thread the rAF of the 3D view would stop meanwhile and the screen would freeze. It is a pure function, so it moves to a worker as is.
//
//  Messages for one request (id) are progress* followed by done|error. The hook creates a new worker
//  per request and terminates it when finished, so the worker keeps no state.
// ------------------------------------------------------------------
import type { Candidate, EngineInput } from './engine';
import { EngineError, runEngine } from './engine';

export type WorkerRequest = { id: number; input: EngineInput };

export type WorkerResponse =
  | { id: number; kind: 'progress'; done: number; total: number }
  | { id: number; kind: 'done'; candidates: Candidate[]; ms: number }
  | { id: number; kind: 'error'; code: string; message: string };

/**
 * Worker global: the app tsconfig has the DOM lib, so `self` is typed as Window
 * (Window.postMessage requires targetOrigin). It is narrowed to the two members needed.
 */
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

ctx.onmessage = (e) => {
  const { id, input } = e.data;
  const t0 = performance.now();
  try {
    const candidates = runEngine(input, (done, total) =>
      ctx.postMessage({ id, kind: 'progress', done, total }),
    );
    ctx.postMessage({ id, kind: 'done', candidates, ms: performance.now() - t0 });
  } catch (err) {
    // Reasons the engine decided itself (empty, too_large) are passed as codes; anything else is 'failed'.
    ctx.postMessage({
      id,
      kind: 'error',
      code: err instanceof EngineError ? err.code : 'failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
