import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function rows() {
  const out = [];
  let n = 0;
  const add = (language, gold, count, construction, nominal = false) => {
    for (let i = 0; i < count; i++) out.push({ id: "R" + (++n), source_text: language + " source " + n, language, construction, gold, predicted: gold, nominal });
  };
  for (const language of ["en", "fr"]) {
    add(language, "IMPLICIT_CANDIDATE", language === "fr" ? 20 : 25, "subjectless_verb");
    add(language, "IMPLICIT_CANDIDATE", language === "fr" ? 30 : 25, "nominal", true);
    add(language, "UNSPECIFIED", 25, "passive_no_agent");
    add(language, "UNSPECIFIED", 25, "impersonal");
    add(language, "EXPLICIT_OTHER", 10, "passive_with_agent");
    add(language, "EXPLICIT_OTHER", 10, "mixed_action_actor");
    add(language, "EXPLICIT_CANDIDATE", 20, "explicit_first_person");
    add(language, "EXPLICIT_CANDIDATE", 1, "explicit_team");
  }
  return out;
}

function score(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e1-actor-score-"));
  const file = path.join(dir, "rows.json");
  fs.writeFileSync(file, JSON.stringify(data));
  const run = spawnSync(process.execPath, ["scripts/e1-actor-basis-score.mjs", file], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: run.status, report: run.stdout.trim() ? JSON.parse(run.stdout) : null, stderr: run.stderr };
}

test("qualification scorer passes a threshold-complete perfect corpus", () => {
  const result = score(rows());
  assert.equal(result.status, 0);
  assert.equal(result.report.sample_pass, true);
  assert.equal(result.report.threshold_pass, true);
  assert.equal(result.report.qualification_pass, true);
});

test("qualification scorer hard-fails explicit-other candidate misattribution", () => {
  const data = rows();
  const row = data.find(x => x.gold === "EXPLICIT_OTHER");
  row.predicted = "IMPLICIT_CANDIDATE";
  const result = score(data);
  assert.equal(result.status, 1);
  assert.equal(result.report.primary_rates.explicit_other_false_candidate, 1);
  assert.equal(result.report.qualification_pass, false);
});


test("qualification scorer rejects duplicate row IDs before sample counting", () => {
  const data = rows();
  data[1].id = data[0].id;
  const result = score(data);
  assert.equal(result.status, 1);
  assert.equal(result.report, null);
  assert.match(result.stderr, /Duplicate qualification row id/);
});


test("qualification scorer enforces the three-percent per-language guard", () => {
  const data = rows();
  const enImplicit = data.filter(x => x.language === "en" && x.gold === "IMPLICIT_CANDIDATE");
  enImplicit[0].predicted = "UNSPECIFIED";
  enImplicit[1].predicted = "UNSPECIFIED";
  const result = score(data);
  assert.equal(result.status, 1);
  assert.equal(result.report.primary_rates.false_unspecified.rate, "2.00%");
  assert.equal(result.report.by_language.en.false_unspecified_rate, "4.00%");
  assert.equal(result.report.qualification_pass, false);
});


test("qualification scorer rejects missing required construction coverage", () => {
  const data = rows().map(row => row.construction === "mixed_action_actor" ? { ...row, construction: "passive_with_agent" } : row);
  const result = score(data);
  assert.equal(result.status, 1);
  assert.equal(result.report.sample_pass, false);
  assert.equal(result.report.qualification_pass, false);
});


test("qualification scorer counts explicit-candidate predictions on unspecified gold against the frozen threshold", () => {
  const data = rows();
  const rowsToFlip = data.filter(x => x.gold === "UNSPECIFIED" && x.language === "en").slice(0, 3);
  assert.equal(rowsToFlip.length, 3);
  for (const row of rowsToFlip) row.predicted = "EXPLICIT_CANDIDATE";
  const result = score(data);
  assert.equal(result.status, 1);
  assert.equal(result.report.primary_rates.false_implicit_candidate.count, 3);
  assert.equal(result.report.primary_rates.false_implicit_candidate.rate, "3.00%");
  assert.equal(result.report.qualification_pass, false);
});


test("qualification scorer rejects malformed row shapes and nominal metadata", () => {
  for (const mutate of [
    data => { data[0] = null; },
    data => { data[0].nominal = "true"; },
    data => { data[0].nominal = true; },
    data => {
      const nominal = data.find(x => x.construction === "nominal");
      nominal.nominal = false;
    },
  ]) {
    const data = rows();
    mutate(data);
    const result = score(data);
    assert.equal(result.status, 1);
    assert.equal(result.report, null);
  }
});


test("qualification scorer rejects structured qualification IDs", () => {
  const data = rows();
  data[0].id = { sample: "R1" };
  const result = score(data);
  assert.equal(result.status, 1);
  assert.equal(result.report, null);
  assert.match(result.stderr, /Invalid row/);
});

test("qualification scorer gates explicit candidate false ambiguity", () => {
  const data = rows();
  const explicit = data.filter(x => x.gold === "EXPLICIT_CANDIDATE" && x.language === "en").slice(0, 3);
  assert.equal(explicit.length, 3);
  for (const row of explicit) row.predicted = "UNSPECIFIED";
  const result = score(data);
  assert.equal(result.status, 1);
  assert.equal(result.report.primary_rates.explicit_candidate_false_ambiguity.count, 3);
  assert.equal(result.report.primary_rates.explicit_candidate_false_ambiguity.rate, "7.50%");
  assert.equal(result.report.qualification_pass, false);
});


test("qualification scorer counts implicit candidate predicted explicit other as false ambiguity", () => {
  const data = rows();
  const implicit = data.filter(x => x.gold === "IMPLICIT_CANDIDATE").slice(0, 3);
  assert.equal(implicit.length, 3);
  for (const row of implicit) row.predicted = "EXPLICIT_OTHER";
  const result = score(data);
  assert.equal(result.status, 1);
  assert.equal(result.report.primary_rates.false_unspecified.count, 3);
  assert.equal(result.report.qualification_pass, false);
});

test("explicit candidate failures cannot be diluted by implicit rows", () => {
  const data = rows();
  const explicit = data.filter(x => x.gold === "EXPLICIT_CANDIDATE");
  for (const row of explicit) row.predicted = "UNSPECIFIED";
  const extras = [];
  for (let i = 0; i < 2000; i++) {
    const base = data.find(x => x.gold === "IMPLICIT_CANDIDATE" && x.language === (i % 2 ? "en" : "fr"));
    extras.push({ ...base, id: "EXTRA-" + i, predicted: "IMPLICIT_CANDIDATE" });
  }
  const result = score([...data, ...extras]);
  assert.equal(result.status, 1);
  assert.equal(result.report.primary_rates.explicit_candidate_false_ambiguity.rate, "100.00%");
  assert.equal(result.report.qualification_pass, false);
});


test("qualification scorer rejects duplicate source text under distinct IDs", () => {
  const data = rows();
  data[1].source_text = data[0].source_text;
  data[1].language = data[0].language;
  const result = score(data);
  assert.equal(result.status, 1);
  assert.equal(result.report, null);
  assert.match(result.stderr, /Duplicate qualification source text/);
});
