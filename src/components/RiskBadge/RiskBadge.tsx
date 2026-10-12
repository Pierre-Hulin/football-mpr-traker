import type { MprRiskLevel } from "../../domain/enums";

export function riskText(level: MprRiskLevel, remaining: number): string {
  switch (level) {
    case "met":
      return "✓ MET";
    case "needs_plays":
      return `NEEDS ${remaining}`;
    case "behind":
      return "BEHIND";
    case "at_risk":
      return "⚠ AT RISK";
    case "critical":
      return "! CRITICAL";
    case "missed":
      return "✕ MISSED";
    case "excluded":
      return "EXCLUDED";
  }
}

const CLASS: Record<MprRiskLevel, string> = {
  met: "badge-met",
  needs_plays: "badge-needs",
  behind: "badge-behind",
  at_risk: "badge-at_risk",
  critical: "badge-critical",
  missed: "badge-critical",
  excluded: "badge-excluded",
};

export function RiskBadge({ level, remaining }: { level: MprRiskLevel; remaining: number }) {
  return <span className={`badge ${CLASS[level]}`}>{riskText(level, remaining)}</span>;
}
