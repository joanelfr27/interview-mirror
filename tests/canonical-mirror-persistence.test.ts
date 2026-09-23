import test from "node:test";
import assert from "node:assert/strict";
import { validateCanonicalMirrorSnapshot } from "@/lib/canonical-mirror-persistence";

test("D9 accepts an append-only canonical snapshot",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"s1",schema_version:"d9-v1",source_update_ids:["u1","u2"],mirror_payload:{requirements:[]}});assert.equal(v.valid,true);});
test("D9 rejects duplicate source updates",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"s1",schema_version:"d9-v1",source_update_ids:["u1","u1"],mirror_payload:{}});assert.equal(v.valid,false);});
test("D9 rejects missing identity",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"",schema_version:"",source_update_ids:[],mirror_payload:{}});assert.equal(v.valid,false);});
