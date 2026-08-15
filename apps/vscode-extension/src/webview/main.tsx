import React from "react";
import { createRoot } from "react-dom/client";
import { App, type WebviewSurface } from "./components/App";
import { WebviewErrorBoundary } from "./components/WebviewErrorBoundary";
import { postToExtension } from "./lib/bridge";
import "./styles/globals.css";

const root = document.getElementById("root")!;
const surface = root.dataset["surface"] as WebviewSurface;
const isRecordingSurface = surface === "recording";

function reportClientError(payload: {
  source: "window-error" | "unhandledrejection" | "react-boundary";
  message: string;
  stack?: string;
}): void {
  postToExtension({
    type: "webview_client_error",
    surface,
    source: payload.source,
    message: payload.message,
    ...(payload.stack !== undefined ? { stack: payload.stack } : {})
  });
}

if (isRecordingSurface) {
  window.addEventListener("error", (event) => {
    const error = event.error;
    if (error instanceof Error) {
      reportClientError({
        source: "window-error",
        message: error.message,
        ...(error.stack !== undefined ? { stack: error.stack } : {})
      });
      return;
    }
    reportClientError({
      source: "window-error",
      message: event.message || "Unknown window error"
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (reason instanceof Error) {
      reportClientError({
        source: "unhandledrejection",
        message: reason.message,
        ...(reason.stack !== undefined ? { stack: reason.stack } : {})
      });
      return;
    }
    reportClientError({
      source: "unhandledrejection",
      message: typeof reason === "string" ? reason : "Unhandled promise rejection"
    });
  });

  createRoot(root).render(
    <WebviewErrorBoundary surface={surface} onError={(payload) => reportClientError(payload)}>
      <App surface={surface} />
    </WebviewErrorBoundary>
  );
} else {
  createRoot(root).render(<App surface={surface} />);
}
