export interface VindicateConfig {
  readonly testIdAttribute?: string;
  readonly baseUrl?: string;
  readonly framework?: string;
  readonly packageManager?: string;
}

const PLACEHOLDER_RESOLVERS: Record<keyof VindicateConfig, (config: VindicateConfig) => string> = {
  testIdAttribute: (config) => config.testIdAttribute ?? "",
  baseUrl: (config) => config.baseUrl ?? "",
  framework: (config) => config.framework ?? "",
  packageManager: (config) => config.packageManager ?? ""
};

export function substituteConfig(content: string, config: VindicateConfig): string {
  let result = content;
  for (const key of Object.keys(PLACEHOLDER_RESOLVERS) as Array<keyof VindicateConfig>) {
    const placeholder = `{{${key}}}`;
    if (!result.includes(placeholder)) {
      continue;
    }
    result = result.replaceAll(placeholder, PLACEHOLDER_RESOLVERS[key](config));
  }
  return result;
}
