export const EXTENSION_ID = "vindicateai.vindicate";

export const COMMANDS = {
  openHome: "vindicate.openHome",
  openRecordings: "vindicate.openRecordings",
  showPanel: "vindicate.showPanel",
  statusBarMenu: "vindicate.statusBarMenu"
} as const;

export const VIEW_IDS = {
  sidebar: "vindicate.sidebar",
  panel: "vindicate.panel"
} as const;

export const STATE_KEYS = {
  selectedFolder: "vindicate.selectedFolder",
  homeShown: "vindicate.homeShown",
  seenFolders: "vindicate.seenFolders"
} as const;

export const WORKSPACE_STATE_KEYS = {
  selectedMode: "vindicate.mode",
  completedSteps: "vindicate.completedSteps",
  onboardingDone: "vindicate.onboardingDone",
  toolsConfirmed: "vindicate.toolsConfirmed",
  promptTemplates: "vindicate.promptTemplates"
} as const;

export const RUNTIME_PORT = 9121;
export const MCP_PORT = 9223;
export const HEALTH_PING_INTERVAL_MS = 30_000;
export const STALE_RESULTS_DAYS = 3;
export const WATCHING_HINT_MS = 10 * 60 * 1000;
