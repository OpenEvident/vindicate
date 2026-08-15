import type { Page } from "playwright-core";

import type { ElementDescriptor } from "../snapshot/element-descriptor.js";

interface OutlineStyle {
  readonly outline: string;
  readonly outlineOffset: string;
}

type CssDescriptorPayload = {
  readonly testid?: string;
  readonly testidAttr: string;
  readonly domId?: string;
};

export const EXPLORE_STYLE: OutlineStyle = {
  outline: "2px solid #3b82f6",
  outlineOffset: "2px"
};

export class HighlightService {
  private readonly loadHandlers = new Map<string, () => void>();
  private readonly lastHighlighted = new Map<string, ElementDescriptor[]>();

  async highlightRefs(
    page: Page,
    sessionId: string,
    descriptors: readonly ElementDescriptor[],
    style: OutlineStyle
  ): Promise<void> {
    this.ensureNavigationListener(page, sessionId);
    this.lastHighlighted.set(sessionId, [...descriptors]);

    const cssDescriptors = descriptors.filter((d) => d.testid || d.domId);
    const roleDescriptors = descriptors.filter((d) => !d.testid && !d.domId);

    if (cssDescriptors.length > 0) {
      const descs: CssDescriptorPayload[] = cssDescriptors.map((d) => ({
        ...(d.testid !== undefined ? { testid: d.testid } : {}),
        testidAttr: d.testidAttr,
        ...(d.domId !== undefined ? { domId: d.domId } : {})
      }));
      await page.evaluate(
        ({ descs: items, style: s }) => {
          const cssSelector = (d: CssDescriptorPayload): string => {
            if (d.testid !== undefined) {
              const escaped = d.testid.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              return `[${d.testidAttr}="${escaped}"]`;
            }
            return `#${CSS.escape(d.domId!)}`;
          };
          for (const d of items) {
            document.querySelectorAll(cssSelector(d)).forEach((el) => {
              const html = el as HTMLElement;
              html.style.outline = s.outline;
              html.style.outlineOffset = s.outlineOffset;
            });
          }
        },
        { descs, style }
      );
    }

    if (roleDescriptors.length > 0) {
      await Promise.all(
        roleDescriptors.map((d) => {
          const roleOpts = d.name.length > 0 ? { name: d.name } : {};
          return page
            .getByRole(d.role as Parameters<Page["getByRole"]>[0], roleOpts)
            .evaluate((el, s) => {
              const html = el as HTMLElement;
              html.style.outline = s.outline;
              html.style.outlineOffset = s.outlineOffset;
            }, style)
            .catch(() => {});
        })
      );
    }
  }

  async clearHighlights(page: Page, sessionId: string): Promise<void> {
    const descriptors = this.lastHighlighted.get(sessionId);
    if (descriptors === undefined || descriptors.length === 0) {
      return;
    }

    const cssDescriptors = descriptors.filter((d) => d.testid || d.domId);
    const roleDescriptors = descriptors.filter((d) => !d.testid && !d.domId);

    if (cssDescriptors.length > 0) {
      const descs: CssDescriptorPayload[] = cssDescriptors.map((d) => ({
        ...(d.testid !== undefined ? { testid: d.testid } : {}),
        testidAttr: d.testidAttr,
        ...(d.domId !== undefined ? { domId: d.domId } : {})
      }));
      await page.evaluate(
        ({ descs: items }) => {
          const cssSelector = (d: CssDescriptorPayload): string => {
            if (d.testid !== undefined) {
              const escaped = d.testid.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              return `[${d.testidAttr}="${escaped}"]`;
            }
            return `#${CSS.escape(d.domId!)}`;
          };
          for (const d of items) {
            document.querySelectorAll(cssSelector(d)).forEach((el) => {
              const html = el as HTMLElement;
              html.style.outline = "";
              html.style.outlineOffset = "";
            });
          }
        },
        { descs }
      );
    }

    if (roleDescriptors.length > 0) {
      await Promise.all(
        roleDescriptors.map((d) => {
          const roleOpts = d.name.length > 0 ? { name: d.name } : {};
          return page
            .getByRole(d.role as Parameters<Page["getByRole"]>[0], roleOpts)
            .evaluate((el) => {
              const html = el as HTMLElement;
              html.style.outline = "";
              html.style.outlineOffset = "";
            })
            .catch(() => {});
        })
      );
    }

    this.lastHighlighted.delete(sessionId);
  }

  disposeSession(page: Page | undefined, sessionId: string): void {
    const handler = this.loadHandlers.get(sessionId);
    if (handler !== undefined && page !== undefined) {
      page.off("load", handler);
    }
    this.loadHandlers.delete(sessionId);
    this.lastHighlighted.delete(sessionId);
  }

  private ensureNavigationListener(page: Page, sessionId: string): void {
    if (this.loadHandlers.has(sessionId)) {
      return;
    }
    const handler = () => void this.clearHighlights(page, sessionId).catch(() => {});
    page.on("load", handler);
    this.loadHandlers.set(sessionId, handler);
  }
}
