export { resolve } from '../tests/real-runtime-loader.mjs';
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith('/src/lib/canonical-shadow-pipeline.ts')) return result;
  const source = String(result.source);
  const anchor = '  const extraction = await extractCanonicalShadow(session);';
  if (source.split(anchor).length !== 2) throw new Error('Reporting hook anchor mismatch');
  const hook = `
  // Run-definition reporting hook: records extraction before any early return. No mutation.
  const reportFs = await import('node:fs/promises');
  const reportCrypto = await import('node:crypto');
  const reportHash = (text: string) => reportCrypto.createHash('sha256').update(text).digest('hex').slice(0,12);
  await reportFs.mkdir('actor-checkpoints', {recursive: true});
  await reportFs.writeFile('actor-checkpoints/' + reportHash(session.id) + '.json', JSON.stringify({
    session: reportHash(session.id), cv: reportHash(session.cv_text ?? ''),
    atoms: extraction.ledger.evidence.map(atom => {
      const span = extraction.ledger.source_spans.find(item => item.id === atom.source_span_id);
      return {evidence_id: atom.id, actor_basis: atom.subject.actor_basis ?? 'MISSING', actor: atom.subject.actor, language: span?.language ?? 'unknown', source_text: span?.text ?? ''};
    }), rejected_atoms: extraction.diagnostics.rejected_atoms,
  }, null, 2));
`;
  return {...result, source: source.replace(anchor, anchor + hook)};
}
