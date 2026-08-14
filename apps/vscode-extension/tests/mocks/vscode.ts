export class EventEmitter<T = void> {
  private readonly handlers: Array<(value: T) => void> = [];

  readonly event = (listener: (value: T) => void): { dispose: () => void } => {
    this.handlers.push(listener);
    return {
      dispose: () => {
        const idx = this.handlers.indexOf(listener);
        if (idx !== -1) this.handlers.splice(idx, 1);
      }
    };
  };

  fire(value: T): void {
    for (const handler of this.handlers) handler(value);
  }

  dispose(): void {
    this.handlers.length = 0;
  }
}

export class Uri {
  static file(path: string): Uri {
    return new Uri(path);
  }

  static parse(value: string): Uri {
    return new Uri(value);
  }

  constructor(readonly fsPath: string) {}

  toString(): string {
    return this.fsPath;
  }
}

export class RelativePattern {
  constructor(
    readonly baseUri: Uri,
    readonly pattern: string
  ) {}
}

export interface WorkspaceFolder {
  uri: Uri;
  name: string;
  index: number;
}

type StatHandler = (uri: Uri) => Promise<{ type: number }>;

let workspaceFolders: WorkspaceFolder[] | undefined;
let workspaceFile: string | undefined;
let statHandler: StatHandler = async () => {
  throw Object.assign(new Error("ENOENT"), { code: "FileNotFound" });
};
let folderPickResult: WorkspaceFolder | undefined;

const watcherListeners: {
  onDidCreate: Array<() => void>;
  onDidChange: Array<() => void>;
  onDidDelete: Array<() => void>;
} = { onDidCreate: [], onDidChange: [], onDidDelete: [] };

export function __resetVscodeMock(): void {
  workspaceFolders = undefined;
  workspaceFile = undefined;
  statHandler = async () => {
    throw Object.assign(new Error("ENOENT"), { code: "FileNotFound" });
  };
  folderPickResult = undefined;
  watcherListeners.onDidCreate = [];
  watcherListeners.onDidChange = [];
  watcherListeners.onDidDelete = [];
}

export function __setWorkspaceFolders(folders: WorkspaceFolder[] | undefined): void {
  workspaceFolders = folders;
}

export function __setWorkspaceFile(path: string | undefined): void {
  workspaceFile = path;
}

export function __setStatHandler(handler: StatHandler): void {
  statHandler = handler;
}

export function __setFolderPick(folder: WorkspaceFolder | undefined): void {
  folderPickResult = folder;
}

export function __fireWatcherCreate(): void {
  for (const fn of watcherListeners.onDidCreate) fn();
}

export const window = {
  showInformationMessage: async (): Promise<string | undefined> => undefined,
  showErrorMessage: async (): Promise<string | undefined> => undefined,
  showWarningMessage: async (): Promise<string | undefined> => undefined,
  showQuickPick: async (): Promise<undefined> => undefined,
  showWorkspaceFolderPick: async (): Promise<WorkspaceFolder | undefined> => folderPickResult,
  createOutputChannel: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    show: () => {},
    dispose: () => {}
  }),
  createStatusBarItem: () => ({
    text: "",
    command: undefined,
    backgroundColor: undefined,
    show: () => {},
    dispose: () => {}
  })
};

export const env = {
  isTelemetryEnabled: true,
  appName: "Visual Studio Code",
  openExternal: async (): Promise<boolean> => true,
  clipboard: { writeText: async (): Promise<void> => {} }
};

export const workspace = {
  get workspaceFolders() {
    return workspaceFolders;
  },
  get workspaceFile() {
    return workspaceFile ? Uri.file(workspaceFile) : undefined;
  },
  onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
  createFileSystemWatcher: () => ({
    onDidCreate: (listener: () => void) => {
      watcherListeners.onDidCreate.push(listener);
      return { dispose: () => {} };
    },
    onDidChange: (listener: () => void) => {
      watcherListeners.onDidChange.push(listener);
      return { dispose: () => {} };
    },
    onDidDelete: (listener: () => void) => {
      watcherListeners.onDidDelete.push(listener);
      return { dispose: () => {} };
    },
    dispose: () => {}
  }),
  fs: {
    stat: (uri: Uri) => statHandler(uri)
  }
};

export const commands = {
  executeCommand: async (): Promise<void> => {}
};

export const StatusBarAlignment = { Right: 2 };

export class ThemeColor {
  constructor(readonly id: string) {}
}

export class LogOutputChannel {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
  show(): void {}
  dispose(): void {}
}
