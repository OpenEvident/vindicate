import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { registerRecordingTools } from "../../src/mcp/tools/recording-tools.js";
import { FakeWorkerClient } from "../fakes/fake-worker-client.js";

const SESSION_ROOT = "/tmp/session-root";

async function connect(workerClient: FakeWorkerClient): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0" });
  registerRecordingTools(server, { workerClient, projectRoot: SESSION_ROOT });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("recording tools — project root scoping", () => {
  it("defaults browser_record_list to the session root when called with no args", async () => {
    const worker = new FakeWorkerClient();
    const client = await connect(worker);

    await client.callTool({ name: "browser_record_list", arguments: {} });

    const call = worker.calls.find((c) => c.method === "listRecordings");
    expect(call?.args[0]).toBe(SESSION_ROOT);
  });

  it("honors an explicit project_root override when supplied", async () => {
    const worker = new FakeWorkerClient();
    const client = await connect(worker);

    await client.callTool({
      name: "browser_record_list",
      arguments: { project_root: "/tmp/explicit-root" }
    });

    const call = worker.calls.find((c) => c.method === "listRecordings");
    expect(call?.args[0]).toBe("/tmp/explicit-root");
  });
});
