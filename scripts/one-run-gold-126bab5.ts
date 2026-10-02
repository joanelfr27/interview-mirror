import { writeFile } from 'node:fs/promises';
import { d15BGoldFixtures, buildD15BGoldLedger, scoreRecordedD15BGoldResult } from '@/lib/d15-gold-gate';
import { runD15BSemanticThreadEngine } from '@/lib/d15-semantic-thread-engine';
const results = [];
for (const fixture of d15BGoldFixtures()) {
  try {
    const engine = await runD15BSemanticThreadEngine(buildD15BGoldLedger(fixture));
    results.push(await scoreRecordedD15BGoldResult(fixture, engine));
  } catch (error) {
    results.push({fixture_id: fixture.id, passed: false, error: String(error)});
  }
  await writeFile('gold-report.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify({fixture: fixture.id, completed: true}));
}
if (results.some(result => !result.passed)) process.exitCode = 1;
