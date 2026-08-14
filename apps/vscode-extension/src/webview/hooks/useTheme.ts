import { useEffect } from "react";
import { applyThemeClass, watchTheme } from "../lib/theme";

export function useTheme(): void {
  useEffect(() => {
    applyThemeClass();
    return watchTheme();
  }, []);
}
