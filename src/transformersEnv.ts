/**
 * Configure @xenova/transformers for Chrome extension content scripts.
 *
 * Without this, ONNX WASM / model config fetches often resolve against the
 * host page (e.g. docs.google.com) and return HTML — which surfaces as:
 *   SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * NOTE: Local ONNX models are OFF by default (see enableLocalModels). Loading
 * them in a content script floods chrome://extensions with WASM graph noise.
 */

let configured = false;

export async function configureTransformersEnv(): Promise<void> {
  if (configured) return;

  const transformers = await import("@xenova/transformers");
  const { env } = transformers;

  // Always pull model weights from Hugging Face (never the page origin)
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.remoteHost = "https://huggingface.co";
  env.remotePathTemplate = "{model}/resolve/{revision}/";

  // ONNX Runtime WASM must not load from docs.google.com / etc.
  const wasmCdn =
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/";
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = wasmCdn;
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
  }

  // Suppress graph-optimizer spam (CleanUnusedInitializers…) in extension UI
  try {
    const onnx = env.backends?.onnx as {
      logLevel?: string;
      wasm?: { logLevel?: string };
    };
    if (onnx) {
      onnx.logLevel = "error";
      if (onnx.wasm) onnx.wasm.logLevel = "error";
    }
  } catch {
    /* older transformers builds may not expose logLevel */
  }

  configured = true;
}

/** Dynamic import of pipeline after env is configured. */
export async function getTransformersPipeline() {
  await configureTransformersEnv();
  const { pipeline } = await import("@xenova/transformers");
  return pipeline;
}
