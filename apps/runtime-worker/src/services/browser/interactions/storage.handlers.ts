/**
 * @file Cookie and storage handlers (BROWSER-SERVICE §7).
 */
import type { Page } from "playwright-core";

import { ValidationError } from "../../../shared/errors/worker.errors.js";
import type {
  ClearCookiesStep,
  ClearStorageStep,
  GetCookiesStep,
  GetStorageStep,
  SetCookiesStep,
  SetStorageStep
} from "./storage.params.js";

export async function handleGetCookies(page: Page, step: GetCookiesStep): Promise<{ cookies: unknown[] }> {
  const cookies = await page.context().cookies(step.url);
  return { cookies };
}

export async function handleSetCookies(page: Page, step: SetCookiesStep): Promise<{ ok: true }> {
  const cookies = step.cookies.map((c) => ({
    name: c.name,
    value: c.value,
    ...(c.url !== undefined ? { url: c.url } : {}),
    ...(c.domain !== undefined ? { domain: c.domain } : {}),
    ...(c.path !== undefined ? { path: c.path } : {}),
    ...(c.expires !== undefined ? { expires: c.expires } : {}),
    ...(c.httpOnly !== undefined ? { httpOnly: c.httpOnly } : {}),
    ...(c.secure !== undefined ? { secure: c.secure } : {}),
    ...(c.sameSite !== undefined ? { sameSite: c.sameSite } : {})
  }));
  await page.context().addCookies(cookies);
  return { ok: true as const };
}

export async function handleClearCookies(page: Page, step: ClearCookiesStep): Promise<{ ok: true }> {
  await page.context().clearCookies();
  if (step.url !== undefined) {
    void step.url;
  }
  return { ok: true as const };
}

export async function handleGetStorage(page: Page, step: GetStorageStep): Promise<{ entries: Record<string, string> }> {
  const entries = await page.evaluate(
    ({ origin, type, key }) => {
      /* __VINDICATE_EVAL__:get_storage__ */
      const storage = type === "local" ? window.localStorage : window.sessionStorage;
      if (key !== undefined && key.length > 0) {
        const v = storage.getItem(key);
        return v === null ? {} : { [key]: v };
      }
      const out: Record<string, string> = {};
      for (let i = 0; i < storage.length; i += 1) {
        const k = storage.key(i);
        if (k !== null) {
          out[k] = storage.getItem(k) ?? "";
        }
      }
      void origin;
      return out;
    },
    { origin: step.origin, type: step.type, key: step.key }
  );
  return { entries };
}

export async function handleSetStorage(page: Page, step: SetStorageStep): Promise<{ ok: true }> {
  await page.evaluate(
    ({ type, key, value }) => {
      /* __VINDICATE_EVAL__:set_storage__ */
      const storage = type === "local" ? window.localStorage : window.sessionStorage;
      storage.setItem(key, value);
    },
    { type: step.type, key: step.key, value: step.value }
  );
  return { ok: true as const };
}

export async function handleClearStorage(page: Page, step: ClearStorageStep): Promise<{ ok: true }> {
  await page.evaluate(
    ({ type }) => {
      /* __VINDICATE_EVAL__:clear_storage__ */
      const storage = type === "local" ? window.localStorage : window.sessionStorage;
      storage.clear();
    },
    { type: step.type }
  );
  return { ok: true as const };
}

export function handlePauseForHuman(step: {
  readonly message: string;
  readonly record?: boolean | undefined;
}): { paused: true; message: string } {
  if (step.record === true) {
    throw new ValidationError("pause_for_human recording is deferred to Phase 2");
  }
  return { paused: true as const, message: step.message };
}
