import { normalizeUsername, validateUsername } from "./checker/username";

const PREFIXES = ["real", "its", "the", "iam", "official", "hey", "just", "only", "og"];
const SUFFIXES = ["sol", "x", "_", "fun", "pump", "hq", "dev", "eth", "og", "1", "69", "420", "official", "xyz"];

/**
 * Variations to try when a username is taken.
 * e.g. mrdev -> realmrdev, itsmrdev, themrdev, mrdevsol, mrdevx, mrdev_ ...
 */
export function suggestVariations(raw: string, limit = 24): string[] {
  const base = normalizeUsername(raw).replace(/_+$/, "");
  if (!base) return [];
  const out: string[] = [];
  const seen = new Set<string>([base]);
  const push = (s: string) => {
    if (seen.has(s)) return;
    if (!validateUsername(s).valid) return;
    seen.add(s);
    out.push(s);
  };
  // Interleave prefixes and suffixes so the top suggestions are varied.
  const max = Math.max(PREFIXES.length, SUFFIXES.length);
  for (let i = 0; i < max; i++) {
    if (PREFIXES[i]) push(`${PREFIXES[i]}${base}`);
    if (SUFFIXES[i]) push(`${base}${SUFFIXES[i]}`);
  }
  push(`${base}_sol`);
  push(`_${base}`);
  push(`${base}${base.slice(-1)}`); // double last letter: mrdevv
  if (base.length > 3) push(base.replace(/[aeiou]/g, "")); // vowel-less
  return out.slice(0, limit);
}
