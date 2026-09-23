import test from "node:test";
import assert from "node:assert/strict";
import { validateCanonicalResearchEvent } from "@/lib/canonical-research-instrumentation";

test("D10 accepts a probe routing event",()=>{const v=validateCanonicalResearchEvent({event_id:"e1",session_id:"s1",event_name:"PROBE_ROUTE_SELECTED",occurred_at:"2026-09-23T00:00:00Z",probe_mode:"BOUNDARY"});assert.equal(v.valid,true);});
test("D10 rejects incomplete preparation events",()=>{const v=validateCanonicalResearchEvent({event_id:"e1",session_id:"s1",event_name:"PREPARATION_ROUTE_SELECTED",occurred_at:"2026-09-23T00:00:00Z"});assert.equal(v.valid,false);});
test("D10 requires failure counts for validation failures",()=>{const v=validateCanonicalResearchEvent({event_id:"e1",session_id:"s1",event_name:"CANONICAL_VALIDATION_FAILED",occurred_at:"2026-09-23T00:00:00Z",validation_error_count:0});assert.equal(v.valid,false);});
