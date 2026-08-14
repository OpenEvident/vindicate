import type { ExtensionMessage, WebviewMessage } from "./types";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
};

const vscodeApi = typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;

export function postToExtension(message: WebviewMessage): void {
  vscodeApi?.postMessage(message);
}

export function onExtensionMessage(handler: (msg: ExtensionMessage) => void): () => void {
  const listener = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (!data || typeof (data as Record<string, unknown>).type !== "string") return;
    handler(data as ExtensionMessage);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
