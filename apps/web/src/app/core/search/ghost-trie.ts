/** Entry for the ghost completion trie. */
export interface GhostTrieEntry {
  label: string;
  weight: number;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  bestLabel: string | null;
  bestWeight: number;
}

function createTrieNode(): TrieNode {
  return { children: new Map(), bestLabel: null, bestWeight: -1 };
}

function normalizeForTrie(input: string): string | null {
  const normalized = input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  return normalized || null;
}

function insertIntoTrie(
  root: TrieNode,
  normalized: string,
  originalLabel: string,
  weight: number,
): void {
  let node = root;
  for (const char of normalized) {
    let child = node.children.get(char);
    if (!child) {
      child = createTrieNode();
      node.children.set(char, child);
    }
    if (weight > child.bestWeight) {
      child.bestWeight = weight;
      child.bestLabel = originalLabel;
    }
    node = child;
  }
}

/**
 * Find how many characters of the original label correspond to
 * the normalized prefix length, accounting for diacritics that
 * disappear during normalization.
 */
function findOriginalPrefixLength(bestLabel: string, normalizedPrefixLen: number): number {
  const bestNormalized = normalizeForTrie(bestLabel);
  if (!bestNormalized) return 0;

  let origIdx = 0;
  let normIdx = 0;
  while (normIdx < normalizedPrefixLen && origIdx < bestLabel.length) {
    if (bestNormalized[normIdx] === normalizeForTrie(bestLabel)![normIdx]) {
      origIdx++;
      normIdx++;
    } else {
      origIdx++;
    }
  }
  return origIdx;
}

export class GhostTrie {
  private root: TrieNode = createTrieNode();

  /** Rebuild the trie from a fresh set of entries. */
  build(entries: GhostTrieEntry[]): void {
    const root = createTrieNode();
    for (const entry of entries) {
      const normalized = normalizeForTrie(entry.label);
      if (!normalized) continue;
      insertIntoTrie(root, normalized, entry.label, entry.weight);
    }
    this.root = root;
  }

  /** Return the completion suffix for the given input, or null. */
  query(input: string): string | null {
    const normalized = normalizeForTrie(input);
    if (!normalized) return null;

    const node = this.walkToNode(normalized);
    if (!node?.bestLabel) return null;

    const bestNormalized = normalizeForTrie(node.bestLabel);
    if (!bestNormalized?.startsWith(normalized)) return null;

    const origIdx = findOriginalPrefixLength(node.bestLabel, normalized.length);
    return node.bestLabel.slice(origIdx) || null;
  }

  private walkToNode(normalized: string): TrieNode | null {
    let node = this.root;
    for (const char of normalized) {
      const child = node.children.get(char);
      if (!child) return null;
      node = child;
    }
    return node;
  }
}
