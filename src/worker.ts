/// <reference lib="webworker" />
// Runs loading and conversion off the main thread, so large files don't freeze the page.
import type { ConvertOptions } from "./lib/convert";
import { LoadError } from "./lib/load";
import { ConverterSession } from "./lib/session";

export type WorkerRequest =
  | { id: number; type: "load"; files: File[] }
  | { id: number; type: "convert"; layerIndex: number; options: ConvertOptions };

export type WorkerResponse =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; message: string; loadError: boolean };

const session = new ConverterSession();

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  let response: WorkerResponse;
  try {
    const value =
      request.type === "load" ? await session.load(request.files) : session.convert(request.layerIndex, request.options);
    response = { id: request.id, ok: true, value };
  } catch (error) {
    console.error(error);
    response = {
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      loadError: error instanceof LoadError,
    };
  }
  self.postMessage(response);
};
