export function applyThemeClass(): void {
  const theme = document.body.dataset["vscodeThemeKind"];
  document.documentElement.classList.toggle("dark", theme !== "vscode-light");
}

export function watchTheme(): () => void {
  const observer = new MutationObserver(applyThemeClass);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-vscode-theme-kind"]
  });
  applyThemeClass();
  return () => observer.disconnect();
}
