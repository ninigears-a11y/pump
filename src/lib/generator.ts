import { validateUsername } from "./checker/username";

export type GeneratorCategory =
  | "mr"
  | "the"
  | "crypto"
  | "mysterious"
  | "developer"
  | "whale"
  | "community"
  | "short";

export const CATEGORY_LABELS: Record<GeneratorCategory, { label: string; example: string }> = {
  mr: { label: "Mr + Word", example: "MrDev, MrNom, MrSol" },
  the: { label: "The + Word", example: "TheWhale, TheKing" },
  crypto: { label: "Crypto personalities", example: "DegenDan, ApeLord" },
  mysterious: { label: "Mysterious identities", example: "ShadowMint, NullCipher" },
  developer: { label: "Developer identities", example: "SolDev, ByteSmith" },
  whale: { label: "Wealthy / Whale identities", example: "GoldWhale, BagKing" },
  community: { label: "Community / Goodwill", example: "KindDegen, FrenFund" },
  short: { label: "Short one-word", example: "nom, zap, onyx" },
};

const W = {
  mrWords: [
    "nom", "dev", "sol", "kind", "king", "whale", "based", "alpha", "legend", "crypto", "degen", "moon", "pump",
    "chad", "ape", "bull", "bear", "gem", "rich", "lucky", "cool", "chill", "wise", "bold", "fast", "zen", "max",
    "boss", "chef", "fren", "gm", "wagmi", "hodl", "mint", "send", "gold", "diamond", "rocket", "pixel", "magic",
    "ninja", "wizard", "pilot", "doge", "pepe", "frog", "cat", "dog", "lion", "tiger", "shark", "wolf", "fox",
    "owl", "nova", "atlas", "echo", "flux", "byte", "code", "hash", "block", "chain", "node", "ledger", "vault",
    "yield", "stake", "swap", "liquid", "token", "coin", "bag", "stack", "brick", "jet", "neon", "solar", "lunar",
  ],
  theWords: [
    "whale", "king", "queen", "dev", "degen", "ape", "chad", "oracle", "prophet", "wizard", "architect", "builder",
    "minter", "sniper", "alpha", "legend", "shepherd", "collector", "trader", "holder", "pumper", "ghost", "monk",
    "captain", "general", "baron", "duke", "emperor", "titan", "giant", "phoenix", "dragon", "raven", "falcon",
  ],
  cryptoAdj: [
    "degen", "based", "giga", "ultra", "mega", "alpha", "sigma", "moon", "pump", "rekt", "wagmi", "ngmi", "fomo",
    "hodl", "gm", "ser", "anon", "fren", "chad", "ape", "bonk", "diamond", "paper", "laser", "turbo",
  ],
  cryptoNoun: [
    "dan", "lord", "boi", "chad", "king", "queen", "maxi", "trader", "sniper", "farmer", "flipper", "hands",
    "eyes", "ape", "whale", "shrimp", "crab", "bull", "bear", "frog", "chef", "bro", "sis", "god", "cat",
  ],
  mysteryAdj: [
    "shadow", "silent", "hidden", "null", "void", "phantom", "ghost", "dark", "secret", "veiled", "masked",
    "cipher", "unknown", "nameless", "lost", "midnight", "obsidian", "eclipse", "echo", "zero", "faceless",
  ],
  mysteryNoun: [
    "mint", "cipher", "signal", "oracle", "wanderer", "watcher", "key", "node", "hand", "figure", "agent", "monk",
    "rider", "fox", "raven", "owl", "wolf", "mirror", "veil", "rune", "glyph", "whisper", "trace",
  ],
  devAdj: ["sol", "rust", "anchor", "chain", "block", "byte", "bit", "hex", "null", "async", "stack", "kernel", "pixel", "code", "data", "web3", "zk", "evm", "cli", "git"],
  devNoun: ["dev", "smith", "hacker", "builder", "coder", "wizard", "ninja", "monk", "lord", "engineer", "ops", "maxi", "labs", "forge", "works", "craft", "lab", "devx"],
  whaleAdj: ["gold", "golden", "diamond", "platinum", "rich", "royal", "mega", "giga", "big", "fat", "heavy", "deep", "silent", "blue", "black", "lucky", "old", "prime"],
  whaleNoun: ["whale", "bag", "bags", "king", "baron", "tycoon", "money", "vault", "stack", "fund", "capital", "treasury", "holder", "wallet", "yacht", "mogul", "magnate", "bank"],
  communityAdj: ["kind", "good", "fren", "gentle", "humble", "honest", "helpful", "happy", "friendly", "lucky", "brave", "wise", "warm", "giving", "chill", "positive", "true", "fair"],
  communityNoun: ["degen", "fren", "fund", "hands", "heart", "soul", "dao", "club", "circle", "crew", "family", "squad", "guild", "tribe", "hub", "house", "neighbor", "shepherd"],
  short: [
    "nom", "zap", "onyx", "flux", "nova", "echo", "zen", "pip", "fizz", "jolt", "volt", "orb", "ion", "hex", "lux",
    "vex", "rune", "sage", "mint", "pump", "moon", "gem", "ape", "fren", "gm", "sol", "bonk", "yolo", "hodl", "wen",
    "ser", "anon", "chad", "giga", "turbo", "kiwi", "mango", "lime", "plum", "fig", "kai", "rio", "neo", "ace",
    "jax", "koi", "ozzy", "rex", "ziggy", "taco", "bao", "mochi", "pixel", "byte", "nyx", "aura", "blip", "bop",
    "quark", "zest", "dash", "swift", "spark", "glow", "drift", "loop", "beam", "pulse", "wave", "crux", "apex",
  ],
};

/** Mulberry32 seeded RNG for reproducible generation in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(arr: readonly T[], rnd: () => number): T => arr[Math.floor(rnd() * arr.length)]!;
const NUM_SUFFIXES = ["", "", "", "", "x", "sol", "1", "7", "69", "420", "_", "hq", "fun"];

function candidateFor(cat: GeneratorCategory, rnd: () => number, round: number): string {
  // Later rounds add suffixes to escape the finite combination space.
  const tail = round > 0 ? pick(NUM_SUFFIXES, rnd) : "";
  switch (cat) {
    case "mr":
      return `mr${pick(W.mrWords, rnd)}${tail}`;
    case "the":
      return `the${pick(W.theWords, rnd)}${tail}`;
    case "crypto":
      return `${pick(W.cryptoAdj, rnd)}${pick(W.cryptoNoun, rnd)}${tail}`;
    case "mysterious":
      return `${pick(W.mysteryAdj, rnd)}${pick(W.mysteryNoun, rnd)}${tail}`;
    case "developer":
      return `${pick(W.devAdj, rnd)}${pick(W.devNoun, rnd)}${tail}`;
    case "whale":
      return `${pick(W.whaleAdj, rnd)}${pick(W.whaleNoun, rnd)}${tail}`;
    case "community":
      return `${pick(W.communityAdj, rnd)}${pick(W.communityNoun, rnd)}${tail}`;
    case "short":
      return `${pick(W.short, rnd)}${round > 1 ? tail : ""}`;
  }
}

export interface GenerateOptions {
  count: number;
  categories: GeneratorCategory[];
  seed?: number;
  /** Optional keyword mixed into some ideas, e.g. "nom". */
  keyword?: string;
  exclude?: Iterable<string>;
}

/** Generate up to `count` unique, valid usernames across the chosen categories. */
export function generateUsernames(opts: GenerateOptions): string[] {
  const count = Math.max(1, Math.min(5_000, Math.floor(opts.count)));
  const cats = opts.categories.length ? opts.categories : (Object.keys(CATEGORY_LABELS) as GeneratorCategory[]);
  const rnd = seededRandom(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
  const kw = (opts.keyword ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  const seen = new Set<string>([...(opts.exclude ?? [])].map((s) => s.toLowerCase()));
  const out: string[] = [];
  let attempts = 0;
  const maxAttempts = count * 60;
  while (out.length < count && attempts < maxAttempts) {
    const round = Math.floor(attempts / (count * 8));
    const cat = cats[attempts % cats.length]!;
    attempts++;
    let name = candidateFor(cat, rnd, round);
    if (kw && rnd() < 0.5) {
      const forms = [`mr${kw}`, `the${kw}`, `${kw}${pick(W.cryptoNoun, rnd)}`, `${pick(W.cryptoAdj, rnd)}${kw}`, `${kw}${pick(NUM_SUFFIXES, rnd)}`];
      name = pick(forms, rnd);
    }
    if (seen.has(name) || !validateUsername(name).valid || name.length > 20) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
