import { createHash } from 'node:crypto';
import { writeFile, appendFile } from 'node:fs/promises';
import { d15BGoldFixtures } from '@/lib/d15-gold-gate';
import { runD16ShadowRuntimeIntegration } from '@/lib/d16-shadow-runtime-integration';
import { AI_MODEL } from '@/lib/openai';
import { runD15ModelPreflight } from '@/lib/d15-model-preflight';
import { buildD16DependencySnapshot, buildD16Strategy, buildD16PreparationActions, buildD16PreparationFingerprint, validateD16PreparationActions, reportD16PreparationCoverage, type D16Inputs } from '@/lib/d16-personalized-interview-strategy';
import type { SessionRecord } from '@/types';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const jd = 'Experience applying international accounting standards is required.';
const fixtures = d15BGoldFixtures().filter(f => ['NANCY', 'THOMAS'].includes(f.id));
const report: { mode: string; status: string; inputs: object; cases: Array<Record<string, unknown>>; comparison?: object } = {
  mode: 'DEVELOPMENT_ASSEMBLED_GOLD_RESPONSIBILITY_TEXT_NOT_QUALIFICATION', status: 'RUNNING',
  inputs: { candidate_text: 'All responsibility lines from the familiar Gold CV fixtures; not full uploaded CV documents', jd, jd_sha256: sha(jd), selection: 'CURATED_NANCY_ACCOUNTING_ANCHORS_THOMAS_NO_RELEVANT_STANDARDS_ANCHOR', fresh_E1_D6: true, D15_GS_rerun: false, writes_performed: false, cutover: false }, cases: [],
};
const save = () => writeFile('d16-evidence-linked-report.json', JSON.stringify(report, null, 2));
await save();
try {
  const capability = await runD15ModelPreflight(AI_MODEL);
  await appendFile('provenance.txt', `model=${AI_MODEL}\ncapability=${JSON.stringify(capability)}\nsource_fixture_file=src/lib/d15-gold-gate.ts\nselection=curated_context_not_requirement_proof\n`);
  console.log('CAPABILITY ' + JSON.stringify(capability));
  for (const fixture of fixtures) {
    const entry: Record<string, unknown> = { candidate: fixture.id, status: 'RUNNING', cv_sha256: sha(fixture.lines.join('\n')), source_line_count: fixture.lines.length };
    report.cases.push(entry); await save();
    const session = { id: 'd16-comparison-shared-role', cv_text: fixture.lines.join('\n'), job_description: jd, preparation_language: 'en' } as SessionRecord;
    try {
      const assembled = await runD16ShadowRuntimeIntegration(session);
      const requirements = assembled.ledger.requirements.map(r => ({ id: r.id, normalized_requirement: r.normalized_requirement }));
      const base = {
        mirror: assembled.d15, bridge: assembled.d6, ledger: assembled.ledger, canonical_requirements: requirements,
        role_capability_model: { version: 'rcm-v1' as const, model_id: 'd16-standards-development-role', role_family: 'accounting', role_title: 'Accounting role — controlled standards comparison', requirements: requirements.map((r, i) => ({ capability_id: 'DEV-CAP-' + i, normalized_requirement: r.normalized_requirement, baseline_criticality: 'CRITICAL' as const, source: { source_type: 'ADMIN_CURATED' as const, source_id: 'd16-development-standards-design', source_version: '1' }, canonical_requirement_id: r.id })) },
        jd_present: true, jd_fingerprint: 'sha256:' + sha(jd),
      };
      const canonical: D16Inputs = { ...base, dependency_snapshot: buildD16DependencySnapshot(base) };
      const anchorLines = fixture.id === 'NANCY' ? fixture.lines.filter(l => /statutory financial reporting|acquisition accounting|implementing and improving accounting/i.test(l)) : [];
      const anchorIds = assembled.ledger.evidence.filter(atom => {
        const span = assembled.ledger.source_spans.find(s => s.id === atom.source_span_id);
        return span && anchorLines.some(line => line.includes(span.text));
      }).map(a => a.id);
      const material = { canonical, language: 'en' as const, accepted_relationships: [], selections: buildD16Strategy(canonical).tensions.map(r => ({ requirement_id: r.requirement_id, preparation_evidence_ids: anchorIds, relationship_ids: [] })) };
      const preparation = { ...material, dependency_fingerprint: buildD16PreparationFingerprint(material) };
      // Save the entire graph before dispatch so later checks need no new extraction/judgments.
      entry.preparation_input = preparation;
      await save();
      const actions = buildD16PreparationActions(preparation);
      const validation = validateD16PreparationActions(actions, preparation);
      if (!validation.valid) throw new Error(validation.errors.join(' | '));
      entry.actions = actions; entry.coverage = reportD16PreparationCoverage(actions); entry.diagnostics = assembled.diagnostics; entry.status = 'COMPLETED';
      console.log(`CV ${fixture.id}: actions=${actions.length} anchors=${anchorIds.length} proof_refs=${actions.reduce((n,a)=>n+a.requirement_proof_refs.length,0)} canonical=${actions.map(a=>a.canonical_status).join(',')}`);
      for (const action of actions) console.log(`${fixture.id} ${action.dispatcher}: ${action.instruction}`);
    } catch (e) { entry.status = 'ERROR'; entry.error = e instanceof Error ? e.message : String(e); if (e && typeof e === 'object') { if ('extraction' in e) entry.extraction_diagnostics = e.extraction; if ('reasons' in e) entry.early_return_reasons = e.reasons; } console.log(`CV ${fixture.id}: ERROR ${entry.error}`); }
    await save();
  }
  report.status = report.cases.every(c => c.status === 'COMPLETED') ? 'COMPLETED_PENDING_CONTENT_REVIEW' : 'COMPLETED_WITH_ERRORS';
  report.comparison = { content_review: 'NOT_EVALUATED', qualification: false, automatic_anchor_selection: false, requirement_extraction_is_separate_per_candidate: true, repeat_successful_model_outputs: false };
} catch (e) { report.status = 'ABORTED'; report.cases.push({ error: e instanceof Error ? e.message : String(e) }); }
await save();
console.log('RUN ' + report.status);
if (report.status !== 'COMPLETED_PENDING_CONTENT_REVIEW') process.exitCode = 1;
