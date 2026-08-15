#!/usr/bin/env node
/**
 * Validates MCP tool names and descriptions under apps/runtime-mcp/src/mcp/tools.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolsDir = path.join(root, "src", "mcp", "tools");

const MAX_NAME_LEN = 30;
const MAX_DESC_WORDS = 120;
const FORBIDDEN = ["workflowId", "sectionId", "phase pack", "workflow_id", "section_id"];

const namePattern = /^[a-z][a-z0-9_]*$/;
const toolStartRegex = /registerTool\s*\(\s*["'`]([^"'`]+)["'`]\s*,/g;

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function readQuotedString(content, startIndex) {
  const quote = content[startIndex];
  if (quote !== '"' && quote !== "'" && quote !== "`") {
    return null;
  }
  let i = startIndex + 1;
  let value = "";
  while (i < content.length) {
    const ch = content[i];
    if (ch === "\\") {
      value += content[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (ch === quote) {
      return { value, end: i + 1 };
    }
    value += ch;
    i += 1;
  }
  return null;
}

/**
 * Reads the full `description:` value, including multi-part string
 * concatenations (`"a" + "b" + "c"`) — a single quoted literal is not enough,
 * since several tools split long descriptions across `+`-joined strings.
 */
function extractDescription(content, fromIndex) {
  const keyIdx = content.indexOf("description:", fromIndex);
  if (keyIdx < 0) {
    return null;
  }
  let i = keyIdx + "description:".length;
  let value = "";
  for (;;) {
    while (i < content.length && /\s/.test(content[i])) {
      i += 1;
    }
    const parsed = readQuotedString(content, i);
    if (parsed === null) {
      break;
    }
    value += parsed.value;
    i = parsed.end;
    while (i < content.length && /\s/.test(content[i])) {
      i += 1;
    }
    if (content[i] === "+") {
      i += 1;
      continue;
    }
    break;
  }
  if (value.length === 0) {
    return null;
  }
  return value.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
}

const errors = [];

for (const file of readdirSync(toolsDir).filter((f) => f.endsWith(".ts"))) {
  const content = readFileSync(path.join(toolsDir, file), "utf8");
  let match;
  while ((match = toolStartRegex.exec(content)) !== null) {
    const name = match[1];
    const description = extractDescription(content, match.index + match[0].length);
    const label = `${file} → ${name}`;

    if (name.length > MAX_NAME_LEN) {
      errors.push(`${label}: name exceeds ${MAX_NAME_LEN} characters`);
    }
    if (!namePattern.test(name)) {
      errors.push(`${label}: name must be snake_case`);
    }
    if (description === null) {
      errors.push(`${label}: missing description`);
      continue;
    }
    const words = wordCount(description);
    if (words > MAX_DESC_WORDS) {
      errors.push(`${label}: description has ${words} words (max ${MAX_DESC_WORDS})`);
    }
    const sentences = description.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length < 2) {
      errors.push(`${label}: description should have at least 2 sentences`);
    }
    for (const term of FORBIDDEN) {
      if (description.toLowerCase().includes(term.toLowerCase())) {
        errors.push(`${label}: description mentions forbidden term "${term}"`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Tool description lint failed:\n");
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log("Tool description lint passed.");
