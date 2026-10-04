// ------------------------------------------------------------------
//  Hook that runs the proposal engine: candidates are recomputed in a worker whenever the selection changes.
//
//  - 400 ms debounce: the input changes repeatedly while the tree or sliders are being used.
//    Running every time only piles up useless work, so it runs once after the input settles.
//  - When a new run starts the previous worker's result is no longer needed, so it is terminated at once.
//  - A **copy** of the mesh buffers is transferred. The originals are needed again by the next
//    extraction of the 3D view, and a transferred ArrayBuffer becomes zero-length on the sender.
//
//  NOTE (caller contract): keep the reference of `input` **stable** with useMemo or similar. Passing a
//     new object on every render restarts the debounce forever.
// ------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import type { Candidate, EngineInput } from '@/lib/proposal/engine';
import type { WorkerRequest, WorkerResponse } from '@/lib/proposal/worker';

/* How long to wait for the input to settle, so one slider drag is one run. */
const DEBOUNCE_MS = 400;

export interface ProposalEngineState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: { done: number; total: number } | null;
  candidates: Candidate[];
  error: { code: string; message: string } | null;
  /* Duration of runEngine measured inside the worker (ms). */
  ms: number | null;
}

const IDLE: ProposalEngineState = {
  status: 'idle',
  progress: null,
  candidates: [],
  error: null,
  ms: null,
};

/* Selection input to the candidate list. idle when the input is null. */
export function useProposalEngine(input: EngineInput | null): ProposalEngineState {
  const [state, setState] = useState<ProposalEngineState>(IDLE);
  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    // The previous run's result is useless; cut it off without waiting.
    workerRef.current?.terminate();
    workerRef.current = null;

    if (!input) {
      setState((s) => (s === IDLE ? s : IDLE));
      return;
    }

    // Report "running" at once. The previous candidates stay until the new result arrives
    // (clearing them would blank the screen on every rerun).
    setState((s) =>
      s.status === 'running' && s.progress === null && s.error === null
        ? s
        : { ...s, status: 'running', progress: null, error: null },
    );

    const timer = setTimeout(() => {
      const id = (seqRef.current += 1);
      const worker = new Worker(new URL('../lib/proposal/worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;

      const finish = () => {
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      };

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.id !== id) return; // late response of an earlier request
        if (msg.kind === 'progress') {
          setState((s) => ({ ...s, status: 'running', progress: { done: msg.done, total: msg.total } }));
          return;
        }
        if (msg.kind === 'done') {
          setState({ status: 'done', progress: null, candidates: msg.candidates, error: null, ms: msg.ms });
        } else {
          setState({
            status: 'error',
            progress: null,
            candidates: [],
            error: { code: msg.code, message: msg.message },
            ms: null,
          });
        }
        finish();
      };
      worker.onerror = (ev) => {
        setState({
          status: 'error',
          progress: null,
          candidates: [],
          error: { code: 'failed', message: ev.message || 'worker error' },
          ms: null,
        });
        finish();
      };

      // Make a copy and transfer only its buffer; the original held by the 3D view stays intact.
      const transfer: Transferable[] = [];
      const meshes = input.meshes.map((m) => {
        const positions = m.positions.slice();
        const indices = m.indices.slice();
        transfer.push(positions.buffer as ArrayBuffer, indices.buffer as ArrayBuffer);
        return { ...m, positions, indices };
      });
      const request: WorkerRequest = { id, input: { ...input, meshes } };
      worker.postMessage(request, transfer);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [input]);

  return state;
}
