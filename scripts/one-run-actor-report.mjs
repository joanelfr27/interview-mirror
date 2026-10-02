import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const report = JSON.parse(readFileSync('combined-report.json','utf8'));
const byLanguage = {};
const cv = [];
for (const session of report.sessions) {
  const checkpoint = JSON.parse(readFileSync('actor-checkpoints/' + session.session + '.json','utf8'));
  const atoms = checkpoint.atoms;
  session.rejected_atoms = checkpoint.rejected_atoms;
  const distribution = {};
  for (const atom of atoms) {
    distribution[atom.actor_basis] = (distribution[atom.actor_basis] ?? 0) + 1;
    const language = byLanguage[atom.language] ??= {};
    language[atom.actor_basis] = (language[atom.actor_basis] ?? 0) + 1;
  }
  cv.push({cv: session.cv, session: session.session, outcome: session.outcome, distribution,
    unspecified_or_other: atoms.filter(atom => ['UNSPECIFIED','EXPLICIT_OTHER'].includes(atom.actor_basis)),
    // All IMPLICIT bullets are retained: the reader can inspect every passive and impersonal case.
    implicit_bullets: atoms.filter(atom => atom.actor_basis === 'IMPLICIT_CANDIDATE'),
    error: session.error, rejected_atoms: session.rejected_atoms});
}
writeFileSync('actor-basis-report.json',JSON.stringify({by_language: byLanguage, by_cv: cv, gold_labels_required: false, rejected_or_stopped_sessions_are_not_zero_error: true},null,2));
