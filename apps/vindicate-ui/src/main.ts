import { App } from "@modelcontextprotocol/ext-apps";

import { renderView } from "./views/router.js";

const app = new App({ name: "Vindicate", version: "1.0.0" });
app.connect();

app.ontoolresult = (result) => {
  const text = result.content?.find((c) => c.type === "text")?.text ?? "{}";
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { view: "unknown", raw: text };
  }
  renderView(data, app);
};
