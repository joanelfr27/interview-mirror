#!/usr/bin/env node
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/e1-actor-basis-score.mjs <sealed-results.json>");
  process.exit(2);
}

const rows = JSON.parse(fs.readFileSync(file, "utf8"));
const bases = ["EXPLICIT_CANDIDATE","IMPLICIT_CANDIDATE","EXPLICIT_OTHER","UNSPECIFIED"];
const languages = ["en","fr"];
const requiredConstructions = [
  "subjectless_verb",
  "nominal",
  "passive_no_agent",
  "passive_with_agent",
  "impersonal",
  "explicit_first_person",
  "explicit_team",
  "mixed_action_actor",
];

if (!Array.isArray(rows)) throw new Error("Qualification input must be a JSON array.");
const seenIds = new Set();
for (const row of rows) {
  if (!row.id || !languages.includes(row.language) || !bases.includes(row.gold) || !bases.includes(row.predicted) || !requiredConstructions.includes(row.construction)) {
    throw new Error("Invalid row: " + JSON.stringify({ id: row.id, language: row.language, gold: row.gold, predicted: row.predicted }));
  }
  if (seenIds.has(row.id)) throw new Error("Duplicate qualification row id: " + row.id);
  seenIds.add(row.id);
}

const count = (predicate) => rows.filter(predicate).length;
const rate = (num, den) => den ? num / den : null;
const pct = (v) => v === null ? "N/A" : (v * 100).toFixed(2) + "%";

const implicit = count(r => r.gold === "IMPLICIT_CANDIDATE");
const unspecified = count(r => r.gold === "UNSPECIFIED");
const explicitOther = count(r => r.gold === "EXPLICIT_OTHER");
const explicitCandidate = count(r => r.gold === "EXPLICIT_CANDIDATE");
const nominal = count(r => r.gold === "IMPLICIT_CANDIDATE" && r.nominal === true);
const frNominal = count(r => r.gold === "IMPLICIT_CANDIDATE" && r.nominal === true && r.language === "fr");

const fu = count(r => r.gold === "IMPLICIT_CANDIDATE" && r.predicted === "UNSPECIFIED");
const fi = count(r => r.gold === "UNSPECIFIED" && r.predicted === "IMPLICIT_CANDIDATE");
const explicitOtherFalseCandidate = count(r => r.gold === "EXPLICIT_OTHER" && ["IMPLICIT_CANDIDATE","EXPLICIT_CANDIDATE"].includes(r.predicted));

const byLanguage = Object.fromEntries(languages.map(language => {
  const implicitN = count(r => r.language === language && r.gold === "IMPLICIT_CANDIDATE");
  const unspecifiedN = count(r => r.language === language && r.gold === "UNSPECIFIED");
  return [language, {
    implicit: implicitN,
    unspecified: unspecifiedN,
    false_unspecified: count(r => r.language === language && r.gold === "IMPLICIT_CANDIDATE" && r.predicted === "UNSPECIFIED"),
    false_implicit_candidate: count(r => r.language === language && r.gold === "UNSPECIFIED" && r.predicted === "IMPLICIT_CANDIDATE"),
  }];
}));

const confusion = Object.fromEntries(bases.map(gold => [
  gold,
  Object.fromEntries(bases.map(predicted => [predicted, count(r => r.gold === gold && r.predicted === predicted)])),
]));

const samplePass =
  implicit >= 100 &&
  unspecified >= 100 &&
  explicitOther >= 40 &&
  explicitCandidate >= 40 &&
  languages.every(l => count(r => r.language === l && r.gold === "IMPLICIT_CANDIDATE") >= 40) &&
  languages.every(l => count(r => r.language === l && r.gold === "UNSPECIFIED") >= 40) &&
  languages.every(l => count(r => r.language === l && r.gold === "EXPLICIT_OTHER") >= 15) &&
  nominal >= 30 && frNominal >= 20 &&
  languages.every(language => requiredConstructions.every(construction =>
    count(r => r.language === language && r.construction === construction) >= 1
  ));

const thresholdPass =
  rate(fu, implicit) !== null && rate(fu, implicit) <= 0.02 &&
  rate(fi, unspecified) !== null && rate(fi, unspecified) <= 0.02 &&
  languages.every(l => rate(byLanguage[l].false_unspecified, byLanguage[l].implicit) !== null && rate(byLanguage[l].false_unspecified, byLanguage[l].implicit) <= 0.03) &&
  languages.every(l => rate(byLanguage[l].false_implicit_candidate, byLanguage[l].unspecified) !== null && rate(byLanguage[l].false_implicit_candidate, byLanguage[l].unspecified) <= 0.03) &&
  explicitOtherFalseCandidate === 0;

const report = {
  rows: rows.length,
  sample: { implicit, unspecified, explicit_other: explicitOther, explicit_candidate: explicitCandidate, nominal, fr_nominal: frNominal },
  construction_coverage: Object.fromEntries(languages.map(language => [
    language,
    Object.fromEntries(requiredConstructions.map(construction => [
      construction,
      count(r => r.language === language && r.construction === construction),
    ])),
  ])),
  primary_rates: {
    false_unspecified: { count: fu, denominator: implicit, rate: pct(rate(fu, implicit)) },
    false_implicit_candidate: { count: fi, denominator: unspecified, rate: pct(rate(fi, unspecified)) },
    explicit_other_false_candidate: explicitOtherFalseCandidate,
  },
  by_language: Object.fromEntries(languages.map(l => [l, {
    ...byLanguage[l],
    false_unspecified_rate: pct(rate(byLanguage[l].false_unspecified, byLanguage[l].implicit)),
    false_implicit_candidate_rate: pct(rate(byLanguage[l].false_implicit_candidate, byLanguage[l].unspecified)),
  }])),
  confusion,
  sample_pass: samplePass,
  threshold_pass: thresholdPass,
  qualification_pass: samplePass && thresholdPass,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.qualification_pass ? 0 : 1);
