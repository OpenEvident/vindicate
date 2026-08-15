import React from "react";

type Props = {
  readonly children: React.ReactNode;
  readonly surface: "sidebar" | "editor" | "panel" | "recording";
  readonly onError: (payload: {
    source: "react-boundary";
    message: string;
    stack?: string;
  }) => void;
};

type State = {
  hasError: boolean;
  message: string;
  stack?: string;
};

export class WebviewErrorBoundary extends React.Component<Props, State> {
  override state: State = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: unknown): State {
    if (error instanceof Error) {
      return {
        hasError: true,
        message: error.message,
        ...(error.stack !== undefined ? { stack: error.stack } : {})
      };
    }
    return { hasError: true, message: String(error) };
  }

  override componentDidCatch(error: unknown): void {
    if (error instanceof Error) {
      this.props.onError({
        source: "react-boundary",
        message: error.message,
        ...(error.stack !== undefined ? { stack: error.stack } : {})
      });
      return;
    }
    this.props.onError({
      source: "react-boundary",
      message: String(error)
    });
  }

  override render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          height: "100vh",
          width: "100%",
          boxSizing: "border-box",
          overflow: "auto",
          padding: "16px",
          color: "var(--vscode-editor-foreground)",
          background: "var(--vscode-editor-background)",
          fontFamily: "var(--vscode-font-family, sans-serif)"
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "8px" }}>Recording UI encountered an error</h2>
        <p style={{ marginTop: 0, opacity: 0.85 }}>
          Please close and reopen this recording view. If it happens again, check the extension
          logs.
        </p>
        <p style={{ marginTop: "8px", marginBottom: "8px", opacity: 0.75 }}>
          Surface: <strong>{this.props.surface}</strong>
        </p>
        <details style={{ marginTop: "8px" }}>
          <summary style={{ cursor: "pointer", opacity: 0.85 }}>Technical details</summary>
          <pre
            style={{
              marginTop: "8px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "var(--vscode-textCodeBlock-background)",
              border: "1px solid var(--vscode-panel-border)",
              borderRadius: "6px",
              padding: "10px",
              fontSize: "12px"
            }}
          >
            {this.state.stack ?? this.state.message}
          </pre>
        </details>
      </div>
    );
  }
}
