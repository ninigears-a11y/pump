import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(csvEscape('a "b", c')).toBe('"a ""b"", c"');
    expect(csvEscape("line\nbreak")).toBe('"line\nbreak"');
  });
  it("neutralises formula injection", () => {
    expect(csvEscape("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });
  it("builds rows", () => {
    expect(toCsv(["u", "s"], [["mrnom", "taken"]])).toBe("u,s\r\nmrnom,taken\r\n");
  });
});
