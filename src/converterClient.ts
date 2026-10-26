import type { ConvertOptions } from "./lib/convert";
import { LoadError } from "./lib/load";
import type { ConvertResult, LayerInfo } from "./lib/session";
import type { WorkerRequest, WorkerResponse } from "./worker";

// Omit that keeps the union apart, so each request type keeps its own fields
type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never;
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type QueuedConvert = {
  layerIndex: number;
  options: ConvertOptions;
  resolve: (value: ConvertResult | null) => void;
  reject: (error: Error) => void;
};

/**
 * Talks to the conversion worker. Conversions are coalesced: while one runs, only the most
 * recent request waits, and the ones it replaces (or that a restart cancels) resolve to null,
 * e.g. while dragging a slider.
 */
export class ConverterClient {
  private worker = this.spawn();
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private converting = false;
  private queued: QueuedConvert | null = null;

  private spawn() {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response.value);
      else pending.reject(response.loadError ? new LoadError(response.message) : new Error(response.message));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.failAll(new Error(event.message || "Worker error"));
    };
    return worker;
  }

  private send(request: RequestBody) {
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id });
    });
  }

  private failAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.queued?.resolve(null);
    this.queued = null;
    this.converting = false;
  }

  /**
   * Loads new files. Whatever the worker is still doing for the previous file is abandoned:
   * the worker is replaced, which also frees the old layers.
   */
  load(files: File[]) {
    this.restart();
    return this.send({ type: "load", files }) as Promise<LayerInfo[]>;
  }

  convert(layerIndex: number, options: ConvertOptions): Promise<ConvertResult | null> {
    return new Promise((resolve, reject) => {
      this.queued?.resolve(null);
      this.queued = { layerIndex, options, resolve, reject };
      void this.drain();
    });
  }

  private async drain() {
    if (this.converting || !this.queued) return;
    const { layerIndex, options, resolve, reject } = this.queued;
    this.queued = null;
    this.converting = true;
    const worker = this.worker;
    try {
      resolve((await this.send({ type: "convert", layerIndex, options })) as ConvertResult);
    } catch (error) {
      if (error instanceof CancelledError) resolve(null);
      else reject(error as Error);
    } finally {
      // after a restart the new worker's queue is already handled elsewhere
      if (worker === this.worker) {
        this.converting = false;
        void this.drain();
      }
    }
  }

  /** Stops whatever is running (a slow load or conversion) and starts a fresh, empty worker. */
  restart() {
    this.worker.terminate();
    this.failAll(new CancelledError());
    this.worker = this.spawn();
  }

  dispose() {
    this.worker.terminate();
    this.failAll(new CancelledError());
  }
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
  }
}
