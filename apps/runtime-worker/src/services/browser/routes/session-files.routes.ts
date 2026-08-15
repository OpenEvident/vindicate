/**
 * @file Session-scoped file I/O routes — project_root resolved from the session record.
 * Mounted at /browser/sessions/:id/files/*.
 */
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import {
  FilesTooLargeError,
  SessionNotFoundError,
  ValidationError
} from "../../../shared/errors/worker.errors.js";
import { resolveProjectPathSecure } from "../../files/path-guard.js";
import type { ISessionStore } from "../session/session.store.interface.js";

const ReadQuerySchema = z.object({
  path: z.string().min(1),
  start_line: z.coerce.number().int().positive().optional(),
  end_line: z.coerce.number().int().positive().optional()
});

const WriteBodySchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  create_dirs: z.boolean().optional()
});

const ListQuerySchema = z.object({
  path: z.string().default("."),
  max_depth: z.coerce.number().int().min(0).max(10).default(3)
});

function sliceLines(content: string, startLine?: number, endLine?: number): string {
  const lines = content.split(/\r?\n/);
  const start = startLine !== undefined ? Math.max(1, startLine) - 1 : 0;
  const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
  return lines.slice(start, end).join("\n");
}

async function listDir(root: string, rel: string, maxDepth: number, depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];
  const abs = await resolveProjectPathSecure(root, rel);
  let st;
  try {
    st = await stat(abs);
  } catch {
    return [];
  }
  if (!st.isDirectory()) return [rel];
  const out: string[] = [];
  for (const name of await readdir(abs)) {
    if (name.startsWith(".")) continue;
    const child = rel === "." ? name : path.join(rel, name);
    out.push(child);
    const childAbs = path.join(abs, name);
    if ((await stat(childAbs)).isDirectory()) {
      out.push(...(await listDir(root, child, maxDepth, depth + 1)));
    }
  }
  return out;
}

export interface SessionFilesRouteDeps {
  readonly store: ISessionStore;
  readonly maxFileBytes: number;
}

export function registerSessionFilesRoutes<L extends FastifyBaseLogger>(
  fastify: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, L>,
  deps: SessionFilesRouteDeps
): void {
  const { store, maxFileBytes } = deps;

  function getProjectRoot(sessionId: string): string {
    const rec = store.get(sessionId);
    if (rec === undefined) throw new SessionNotFoundError(sessionId);
    return rec.project_root;
  }

  fastify.get<{ Params: { id: string } }>("/sessions/:id/files/read", async (request, reply) => {
    const parsed = ReadQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError("Invalid read query — path required");
    const projectRoot = getProjectRoot(request.params.id);
    const abs = await resolveProjectPathSecure(projectRoot, parsed.data.path);
    let st;
    try {
      st = await stat(abs);
    } catch {
      throw new ValidationError(`File not found: ${parsed.data.path}`);
    }
    if (st.size > maxFileBytes) throw new FilesTooLargeError(maxFileBytes);
    const raw = await readFile(abs, "utf8");
    return reply.send({
      path: parsed.data.path,
      content: sliceLines(raw, parsed.data.start_line, parsed.data.end_line)
    });
  });

  fastify.put<{ Params: { id: string } }>("/sessions/:id/files/write", async (request, reply) => {
    const parsed = WriteBodySchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError("Invalid write body");
    if (Buffer.byteLength(parsed.data.content, "utf8") > maxFileBytes) {
      throw new FilesTooLargeError(maxFileBytes);
    }
    const projectRoot = getProjectRoot(request.params.id);
    const abs = await resolveProjectPathSecure(projectRoot, parsed.data.path);
    if (parsed.data.create_dirs !== false) {
      await mkdir(path.dirname(abs), { recursive: true });
    }
    await writeFile(abs, parsed.data.content, "utf8");
    return reply.send({ ok: true as const, path: parsed.data.path });
  });

  fastify.get<{ Params: { id: string } }>("/sessions/:id/files/list", async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ValidationError("Invalid list query");
    const projectRoot = getProjectRoot(request.params.id);
    const items = await listDir(projectRoot, parsed.data.path, parsed.data.max_depth);
    return reply.send({ items });
  });

  fastify.delete<{ Params: { id: string } }>(
    "/sessions/:id/files/delete",
    async (request, reply) => {
      const parsed = z.object({ path: z.string().min(1) }).safeParse(request.query);
      if (!parsed.success) throw new ValidationError("Invalid delete query");
      const projectRoot = getProjectRoot(request.params.id);
      const abs = await resolveProjectPathSecure(projectRoot, parsed.data.path);
      let st;
      try {
        st = await stat(abs);
      } catch {
        return reply.send({ ok: true as const, message: "already absent" });
      }
      if (st.isDirectory()) throw new ValidationError("delete only supports files");
      await unlink(abs);
      return reply.send({ ok: true as const });
    }
  );
}
