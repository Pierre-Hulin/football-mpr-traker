import type { MprRiskLevel } from "../../domain/enums";

export function riskText(level: MprRiskLevel, remaining: number): string {
  switch (level) {
    case "met":
      return "✓ MET";
    case "needs_plays":
      return `NEEDS ${remaining}`;
    case "at_risk":
      return "⚠ AT RISK";
    case "critical":
      return "! CRITICAL";
    case "excluded":
      return "EXCLUDED";
  }
}

export function RiskBadge({ level, remaining }: { level: MprRiskLevel; remaining: number }) {
  const cls = level === "needs_plays" ? "badge-needs" : `badge-${level}`;
  return <span className={`badge ${cls}`}>{riskText(level, remaining)}</span>;
}
