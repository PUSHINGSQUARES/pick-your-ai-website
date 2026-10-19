import type {
  BuildSnapshot,
  ComponentKind,
  CostEstimate,
  EvaluationReport,
  Expression,
  Ruleset,
} from '../../contracts';
import { KIND_LABELS, withArticle } from '../../contracts';
import type { Coverage } from '../../domain/activation';
import type { Outcome } from '../../components/status';
import { worstOutcome } from '../../components/status';

export type Finding = EvaluationReport['findings'][number];

/** Findings that need attention (fail or unknown), lettered A, B, C… in report order. */
export function flaggedFindings(
  report: EvaluationReport | undefined,
): (Finding & { letter: string })[] {
  if (!report) return [];
  return report.findings
    .filter((f) => f.outcome === 'fail' || f.outcome === 'unknown')
    .sort((a, b) => (a.outcome === b.outcome ? 0 : a.outcome === 'fail' ? -1 : 1))
    .map((f, i) => ({ ...f, letter: letterFor(i) }));
}

function letterFor(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function findingsForSelection(
  report: EvaluationReport | undefined,
  selectionId: string,
  excludeRuleIds?: ReadonlySet<string>,
): Finding[] {
  return (
    report?.findings.filter(
      (f) => f.selection_ids.includes(selectionId) && !excludeRuleIds?.has(f.rule_id),
    ) ?? []
  );
}

export function selectionOutcome(
  report: EvaluationReport | undefined,
  selectionId: string,
  excludeRuleIds?: ReadonlySet<string>,
): Outcome | null {
  const applicable = findingsForSelection(report, selectionId, excludeRuleIds).filter(
    (f) => f.outcome !== 'skipped',
  );
  return worstOutcome(applicable.map((f) => f.outcome));
}

export function overall(report: EvaluationReport | undefined): Outcome | null {
  if (!report) return null;
  if (report.summary.failed) return 'fail';
  if (report.summary.unknown) return 'unknown';
  if (report.summary.passed) return 'pass';
  return 'skipped';
}

export interface IncompletePresentation {
  /** Required choices already made (enabled selections among the affected kinds). */
  made: number;
  /** Required choices in total (affected kinds of the failing required-presence rules). */
  total: number;
  /** Remediation text from the failing required-presence rules, de-duplicated. */
  remediation: string;
  /** Rule ids behind the failures — rows suppress their Fail chips for these rules only. */
  ruleIds: ReadonlySet<string>;
}

/**
 * PROVISIONAL inference (website#31, research#40): a failing rule is treated as
 * "required-presence" when its assertion consists solely of `exists` checks on selection
 * references. Until the ruleset marks such rules explicitly, the UI labels this as provisional.
 */
function isRequiredPresenceAssert(expression: Expression): boolean {
  const e = expression as Record<string, unknown> & { op: string };
  if (e.op === 'exists') {
    const v = e.value as { ref?: { scope?: string } } | undefined;
    return v?.ref?.scope === 'selection';
  }
  if (e.op === 'all') {
    const args = e.args as Expression[] | undefined;
    return Boolean(args?.length) && (args ?? []).every(isRequiredPresenceAssert);
  }
  return false;
}

/**
 * When every failing finding is a required-presence rule whose affected kinds include empty
 * slots, the build is incomplete rather than incompatible. Returns null otherwise — real
 * conflicts keep the Incompatible presentation. Contract outcomes are never altered.
 */
export function incompletePresentation(
  report: EvaluationReport | undefined,
  ruleset: Ruleset | undefined,
  build: BuildSnapshot | undefined,
): IncompletePresentation | null {
  if (!report || !ruleset || !build || !report.summary.failed) return null;
  const failing = report.findings.filter((f) => f.outcome === 'fail');
  const ruleById = new Map(ruleset.rules.map((r) => [r.id, r]));
  const hasEnabled = (kind: string) => build.selections.some((s) => s.kind === kind && s.enabled);
  const kinds = new Set<string>();
  const ruleIds = new Set<string>();
  const remediations: string[] = [];
  for (const f of failing) {
    const rule = ruleById.get(f.rule_id);
    if (!rule || !isRequiredPresenceAssert(rule.assert)) return null;
    if (!(rule.affected_kinds as string[]).some((k) => !hasEnabled(k))) return null;
    ruleIds.add(f.rule_id);
    for (const k of rule.affected_kinds as string[]) kinds.add(k);
    if (rule.remediation && !remediations.includes(rule.remediation))
      remediations.push(rule.remediation);
  }
  const made = [...kinds].filter(hasEnabled).length;
  return { made, total: kinds.size, remediation: remediations.join(' '), ruleIds };
}

export function formatMoney(amount: string, currency: string): string {
  const n = Number(amount);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function costHeadline(cost: CostEstimate | undefined): { text: string; detail: string } {
  if (!cost) return { text: 'Unknown', detail: 'No estimate yet.' };
  const total = formatMoney(cost.total.amount, cost.currency);
  if (cost.coverage === 'complete' && cost.line_items.length === 0) {
    return {
      text: 'No metered costs',
      detail: 'No selected component has a usage-priced rate yet.',
    };
  }
  if (cost.coverage === 'complete') {
    return {
      text: `${total} / ${cost.period_days} days`,
      detail: 'Synthetic estimate with complete coverage — not a quote.',
    };
  }
  if (cost.coverage === 'partial') {
    return {
      text: `≥ ${total} + unpriced`,
      detail: `${cost.unpriced_selection_ids.length} component(s) could not be priced, so the total is a lower bound.`,
    };
  }
  return { text: 'Unknown', detail: 'Nothing billable could be priced.' };
}

export function nextAction(
  build: BuildSnapshot,
  coverage: Coverage,
  report: EvaluationReport | undefined,
  cost: CostEstimate | undefined,
): string {
  const missing = coverage.missing[0];
  if (!build.selections.length) return 'Start with T0: choose the workload you want to support.';
  if (missing)
    return `Choose ${withArticle(KIND_LABELS[missing as ComponentKind])} — it is needed for this deployment mode.`;
  if (coverage.dependsOnMode.length)
    return 'Choose a deployment mode so the builder knows which infrastructure is needed.';
  const fail = report?.findings.find((f) => f.outcome === 'fail');
  if (fail) return `Resolve the failing check: ${fail.message} ${fail.remediation}`.trim();
  const unknown = report?.findings.find((f) => f.outcome === 'unknown');
  if (unknown) return `Review what is unknown: ${unknown.message}`;
  if (cost && cost.coverage !== 'complete')
    return 'Pricing is incomplete — review unpriced components in the cost breakdown.';
  return 'All configured checks pass for this revision. Review the summary, then save or share it.';
}
