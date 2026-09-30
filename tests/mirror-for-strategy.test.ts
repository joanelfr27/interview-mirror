import test from "node:test";
import assert from "node:assert/strict";
import { validateMirrorForStrategy, type MirrorForStrategy } from "@/lib/mirror-for-strategy";

const base=(state:MirrorForStrategy["completion_state"]):MirrorForStrategy=>({
  version:"mirror-for-strategy-v1",
  completion_state:state,
  threads:[],
  not_said_yet:[],
  cv_question_back:null,
});

test("MirrorForStrategy permits CV question only for genuine completed restraint",()=>{
  const restraint=base("COMPLETED_NO_QUALIFYING_RELATIONSHIP");
  restraint.cv_question_back="Do any of these documented activities connect in a recurring way?";
  assert.deepEqual(validateMirrorForStrategy(restraint),[]);

  for(const state of ["ALL_REJECTED","ERROR"] as const){
    const failed=base(state);
    failed.cv_question_back="Do these form a pattern?";
    assert.ok(validateMirrorForStrategy(failed).some(x=>x.includes("allowed only")));
  }
});

test("MirrorForStrategy completed threads require canonical proof IDs and question-back",()=>{
  const mirror=base("COMPLETED_WITH_THREADS");
  mirror.threads=[{
    thread_id:"T1", headline:"Grounded relationship", cited_atom_ids:["E1","E2"],
    maturity:"EMERGING_PATTERN", question_back:"What happened next?", confirmation_status:"UNCONFIRMED",
  }];
  assert.deepEqual(validateMirrorForStrategy(mirror),[]);
  mirror.threads[0]!.cited_atom_ids=[];
  mirror.threads[0]!.question_back="";
  const errors=validateMirrorForStrategy(mirror);
  assert.ok(errors.some(x=>x.includes("requires cited atoms")));
  assert.ok(errors.some(x=>x.includes("requires question_back")));
});
