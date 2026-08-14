/** Resolve built-in worker sample fixture paths for live upload exploration. */
import path from "node:path";
import { fileURLToPath } from "node:url";

export type WorkerSampleKind = "image" | "pdf" | "csv" | "txt";

const SAMPLE_FILES: Record<WorkerSampleKind, string> = {
  image: "sample.png",
  pdf: "sample.pdf",
  csv: "sample.csv",
  txt: "sample.txt"
};

const samplesDir = fileURLToPath(new URL("../../../../assets/samples/", import.meta.url));

export function resolveWorkerSamplePath(kind: WorkerSampleKind): string {
  return path.join(samplesDir, SAMPLE_FILES[kind]);
}

export function listWorkerSamplePaths(): Record<WorkerSampleKind, string> {
  return {
    image: resolveWorkerSamplePath("image"),
    pdf: resolveWorkerSamplePath("pdf"),
    csv: resolveWorkerSamplePath("csv"),
    txt: resolveWorkerSamplePath("txt")
  };
}
