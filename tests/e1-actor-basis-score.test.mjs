import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function rows() {
  const out = [];
  let n = 0;
  const add = (language, gold, count, nominal = false) => {
    for (let i = 0; i < count; i++) out.push({ id: "R" + (++n), language, construction: "fixture", gold, predicted: gold, nominal });
  };
  add("en", "IMPLICIT_CANDIDATE", 50, false);
  add("fr", "IMPLICIT_CANDIDATE", 30, true);
  add("fr", "IMPLICIT_CANDIDATE", 20, false);
  add("en", "UNSPECIFIED", 50);
  add("fr", "UNSPECIFIED", 50);
  add("en", "EXPLICIT_OTHER", 20);
  add("fr", "EXPLICIT_OTHER", 20);
  add("en", "EXPLICIT_CANDIDATE", 20);
  add("fr", "EXPLICIT_CANDIDATE", 20);
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
