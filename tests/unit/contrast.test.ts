import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** WCAG 2.x relative luminance contrast ratio. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(resolve(process.cwd(), "src/styles/live-game.css"), "utf8");

describe("live-game colour contrast", () => {
  it("uses the specified red for RECORD PLAY", () => {
    expect(css).toMatch(/--record:\s*#d32f2f/i);
  });

  it.each([
    ["RECORD PLAY label on red", "#ffffff", "#d32f2f"],
    ["label on hover red", "#ffffff", "#c62828"],
    ["label on pressed/processing red", "#ffffff", "#b71c1c"],
    ["success label on green", "#ffffff", "#1b6e34"],
    ["error label on slate", "#ffffff", "#3d4757"],
    ["lineup warning text on amber", "#7a4a00", "#ffe9a8"],
    ["selected Focus/All segment", "#ffffff", "#1f2937"],
    ["summary text on surface", "#3d4757", "#ffffff"],
  ])("%s meets WCAG AA for text (4.5:1)", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["red button against the light page surface", "#d32f2f", "#ffffff"],
    ["red button against a dark surface", "#d32f2f", "#0a0f1a"],
    ["amber warning border on light surface", "#7a4a00", "#ffffff"],
  ])("%s is distinguishable as a UI component (3:1)", (_name, a, b) => {
    expect(contrast(a, b)).toBeGreaterThanOrEqual(3);
  });
});
