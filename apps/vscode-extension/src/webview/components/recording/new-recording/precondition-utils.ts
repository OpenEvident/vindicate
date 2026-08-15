export function reorderItems<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

export function appendUniqueNames(
  existing: readonly string[],
  incoming: readonly string[]
): string[] {
  const seen = new Set(existing);
  const next = [...existing];
  for (const name of incoming) {
    if (!seen.has(name)) {
      seen.add(name);
      next.push(name);
    }
  }
  return next;
}

export function removeName(names: readonly string[], name: string): string[] {
  return names.filter((entry) => entry !== name);
}
