import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { FileOutsideRootError, FileTooLargeError } from "../../src/shared/errors.js";
import { ProjectFs } from "../../src/fs/project-fs.js";

describe("ProjectFs", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function makeFs(maxBytes = 1024): Promise<{ fs: ProjectFs; root: string }> {
    const root = path.join(os.tmpdir(), `vindicate-fs-${Date.now()}`);
    dirs.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "hello.txt"), "hello", "utf8");
    return {
      root,
      fs: new ProjectFs({ projectRoot: root, maxFileBytes: maxBytes })
    };
  }

  it("reads within root", async () => {
    const { fs } = await makeFs();
    expect(await fs.read("hello.txt")).toBe("hello");
  });

  it("rejects traversal", async () => {
    const { fs } = await makeFs();
    await expect(fs.read("../etc/passwd")).rejects.toBeInstanceOf(FileOutsideRootError);
  });

  it("rejects absolute paths", async () => {
    const { fs } = await makeFs();
    await expect(fs.read("/etc/passwd")).rejects.toBeInstanceOf(FileOutsideRootError);
  });

  it("enforces max bytes on read", async () => {
    const { fs, root } = await makeFs(4);
    await writeFile(path.join(root, "big.txt"), "12345", "utf8");
    await expect(fs.read("big.txt")).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it("lists entries", async () => {
    const { fs } = await makeFs();
    const entries = await fs.list(".");
    expect(entries.some((e) => e.name === "hello.txt")).toBe(true);
  });

  it("search matches glob", async () => {
    const { fs } = await makeFs();
    const paths = await fs.search("*.txt");
    expect(paths).toContain("hello.txt");
  });

  it("falls back to CLAUDE_PROJECT_DIR", async () => {
    const root = path.join(os.tmpdir(), `vindicate-fs-claude-${Date.now()}`);
    dirs.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "from-claude.txt"), "x", "utf8");
    const fs = new ProjectFs({
      projectRoot: "",
      claudeProjectDir: root,
      maxFileBytes: 1024
    });
    expect(await fs.read("from-claude.txt")).toBe("x");
  });
});
