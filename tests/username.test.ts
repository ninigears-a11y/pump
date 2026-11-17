import { describe, expect, it } from "vitest";
import { looksLikeWalletAddress, normalizeUsername, parseUsernameList, validateUsername } from "@/lib/checker/username";

describe("normalizeUsername", () => {
  it.each([
    ["mrnom", "mrnom"],
    ["  MrNom ", "mrnom"],
    ["@mrnom", "mrnom"],
    ["https://pump.fun/u/MrDev", "mrdev"],
    ["pump.fun/u/mrsol?tab=coins", "mrsol"],
    ["https://pump.fun/profile/mrkind", "mrkind"],
  ])("%s -> %s", (input, out) => expect(normalizeUsername(input)).toBe(out));
});

describe("validateUsername", () => {
  it("accepts letters, numbers, underscores", () => {
    expect(validateUsername("mr_dev_2").valid).toBe(true);
  });
  it.each(["", "has space", "dash-name", "emoji😀", "a".repeat(33), "dot.name"])("rejects %j", (u) => {
    expect(validateUsername(u).valid).toBe(false);
  });
});

describe("parseUsernameList", () => {
  it("dedupes case-insensitively and keeps order", () => {
    expect(parseUsernameList("mrnom\nMrDev\n\nmrnom\n@mrdev, mrsol")).toEqual(["mrnom", "mrdev", "mrsol"]);
  });
});

describe("looksLikeWalletAddress", () => {
  it("detects base58 wallets", () => {
    expect(looksLikeWalletAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe(true);
    expect(looksLikeWalletAddress("mrnom")).toBe(false);
  });
});
