/* Website#31: partial builds present as Incomplete, real conflicts stay Incompatible. */
import { describe, expect, it } from 'vitest';
import { BASELINE_RULESET } from '../../src/contracts';
import { evaluateBuild } from '../../src/domain/evaluator';
import {
  incompletePresentation,
  overall,
  selectionOutcome,
} from '../../src/features/builder/analysis';
import { CATALOG, NOW, apiChat, buildWith, contradictory } from './scenarios';

const evaluate = (build: ReturnType<typeof apiChat>) =>
  evaluateBuild({ build, catalog: CATALOG, ruleset: BASELINE_RULESET, evaluatedAt: NOW });

describe('incomplete presentation (website#31)', () => {
  it('a partial build failing only required-presence rules is Incomplete, not Incompatible', () => {
    const b = buildWith([['workload', 'support-chat']]);
    const r = evaluate(b);
    expect(overall(r)).toBe('fail');
    expect(r.findings.filter((f) => f.outcome === 'fail').map((f) => f.rule_id)).toEqual([
      'rule.required.foundation',
    ]);
    const inc = incompletePresentation(r, BASELINE_RULESET, b);
    expect(inc).not.toBeNull();
    expect(inc!.made).toBe(1);
    expect(inc!.total).toBe(4);
    expect(inc!.remediation).toContain('Choose workload');
    expect([...inc!.ruleIds]).toEqual(['rule.required.foundation']);
  });

  it('an empty build is Incomplete with 0 of 4 required choices made', () => {
    const b = buildWith([]);
    const r = evaluate(b);
    const inc = incompletePresentation(r, BASELINE_RULESET, b);
    expect(inc).not.toBeNull();
    expect(inc!.made).toBe(0);
    expect(inc!.total).toBe(4);
  });

  it('picked rows lose their Fail chip only for the required-presence rule', () => {
    const b = buildWith([['workload', 'support-chat']]);
    const r = evaluate(b);
    const selectionId = b.selections[0]!.id;
    // Contract outcome is unchanged: without the exclusion the row still fails.
    expect(selectionOutcome(r, selectionId)).toBe('fail');
    const inc = incompletePresentation(r, BASELINE_RULESET, b);
    expect(selectionOutcome(r, selectionId, inc!.ruleIds)).toBeNull();
  });

  it('a real conflict still presents as Incompatible (no incomplete presentation)', () => {
    const b = contradictory();
    const r = evaluate(b);
    expect(overall(r)).toBe('fail');
    expect(incompletePresentation(r, BASELINE_RULESET, b)).toBeNull();
    expect(selectionOutcome(r, 'sel_model')).toBe('fail');
  });

  it('a complete build has no incomplete presentation', () => {
    const b = apiChat();
    const r = evaluate(b);
    expect(r.summary.failed).toBe(0);
    expect(incompletePresentation(r, BASELINE_RULESET, b)).toBeNull();
  });

  it('a required-presence failure mixed with a real conflict stays Incompatible', () => {
    // API mode + weights-only model from another provider, context policy missing:
    // rule.required.foundation fails alongside the two conflict rules.
    const b = buildWith([
      ['workload', 'support-chat'],
      ['deployment_mode', 'api'],
      ['model_provider', 'aurora'],
      ['model', 'open-8b'],
    ]);
    const r = evaluate(b);
    const failing = r.findings.filter((f) => f.outcome === 'fail').map((f) => f.rule_id);
    expect(failing).toContain('rule.required.foundation');
    expect(failing.length).toBeGreaterThan(1);
    expect(incompletePresentation(r, BASELINE_RULESET, b)).toBeNull();
  });
});
