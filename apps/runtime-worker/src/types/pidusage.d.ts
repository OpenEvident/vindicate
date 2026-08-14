declare module "pidusage" {
  export interface PidUsageStats {
    cpu: number;
    memory: number;
    ppid: number;
    pid: number;
    ctime: number;
    elapsed: number;
    timestamp: number;
  }

  export default function pidusage(
    pid: number | string,
    callback?: (err: Error | null, stats: PidUsageStats) => void
  ): Promise<PidUsageStats>;
}
