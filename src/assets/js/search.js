export function createSearchMatcher(query) {
  const tokens = String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return (searchIndex) => tokens.every((token) => searchIndex.includes(token));
}
