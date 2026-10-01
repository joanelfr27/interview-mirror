import type { AtomicEvidence, EvidenceLedger } from "@/lib/canonical-evidence-model";

const GENERIC_TOKENS = new Set([
  "team","teams","process","processes","system","systems","data","work","business","project","projects",
  "function","functions","area","areas","role","roles","group","groups","activity","activities","person","persons",
  "equipe","equipes","équipe","équipes","processus","systeme","systemes","système","systèmes",
  "projet","projets","fonction","fonctions","groupe","groupes","activite","activites","activité","activités",
  "personne","personnes",
]);
const FUNCTION_STOP_WORDS = new Set([
  "with","from","into","during","through","over","under","upon","between","among","within","without",
  "about","after","before","across","around","toward","towards","such","than","then","this","that",
  "their","they","them","your","our","have","been","were","will","would","could","should",
  "dans","pour","avec","leur","leurs","sans","sous","entre","parmi","chez","vers","depuis","après",
  "avant","pendant","durant","selon","comme","cette","cette","ceux","elles","elle","nous","vous",
]);

function normalizeClaimToken(value: string): string {
  const token = value.normalize("NFKC").toLowerCase();
  const aliases: Record<string,string> = {
    managed:"lead",manage:"lead",managing:"lead",led:"lead",leadership:"lead",
    group:"team",groups:"team",team:"team",teams:"team",
    engineering:"engineer",engineers:"engineer",
    five:"5",four:"4",three:"3",two:"2",one:"1",
  };
  return aliases[token] ?? token;
}
function tokens(value: string): Set<string> {
  const rawTokens = value.normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return new Set(rawTokens.map((raw)=>({raw,normalized:normalizeClaimToken(raw)}))
    .filter(({raw,normalized})=>{
      const isNumeric=/^\d+$/.test(normalized);
      const isShortProfessionalToken=/^[A-Z0-9]{2,}$/.test(raw);
      const isStandardToken=normalized.length>=4;
      return (isStandardToken||isNumeric||isShortProfessionalToken)
        && !GENERIC_TOKENS.has(normalized) && !FUNCTION_STOP_WORDS.has(normalized);
    }).map(({normalized})=>normalized));
}
function spanFor(ledger: EvidenceLedger, atom: AtomicEvidence) {
  return ledger.source_spans.find((span)=>span.id===atom.source_span_id);
}
function contradictionKey(atom: AtomicEvidence): string {
  return [atom.action.normalized_action,atom.action.object,atom.context.domain??"",atom.context.jurisdiction??""]
    .join("|").normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim();
}
function dedupeKey(ledger: EvidenceLedger, atom: AtomicEvidence): string {
  const span=spanFor(ledger,atom);
  return [span?.text??"",atom.action.normalized_action,atom.action.object,atom.context.domain??"",
    ...(atom.context.tools_or_systems??[]),...(atom.context.standards??[])]
    .join("|").normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim();
}
function semanticDuplicate(ledger:EvidenceLedger,a:AtomicEvidence,b:AtomicEvidence):boolean {
  if(normalizeClaimToken(a.action.normalized_action)!==normalizeClaimToken(b.action.normalized_action)) return false;
  const leftObject=tokens(a.action.object),rightObject=tokens(b.action.object);
  if(!leftObject.size||!rightObject.size) return false;
  const objectShared=[...leftObject].filter((token)=>rightObject.has(token)).length;
  if(objectShared/Math.max(leftObject.size,rightObject.size)<0.8) return false;
  const leftSpan=spanFor(ledger,a),rightSpan=spanFor(ledger,b);
  if(!leftSpan||!rightSpan) return false;
  const leftSource=tokens(leftSpan.text),rightSource=tokens(rightSpan.text);
  if(!leftSource.size||!rightSource.size) return false;
  const sourceShared=[...leftSource].filter((token)=>rightSource.has(token)).length;
  return sourceShared/Math.max(leftSource.size,rightSource.size)>=0.8;
}

/**
 * Canonical D15 atom eligibility/deduplication boundary.
 * This is an exact extraction of the pre-existing professional-mirror.ts
 * affirmativeAtoms() + independentAtoms() behavior. Do not add policy here
 * as part of the extraction refactor.
 */
export function d15EligibleIndependentAtoms(ledger: EvidenceLedger): AtomicEvidence[] {
  const contradictoryKeys=new Set(
    ledger.evidence.filter((atom)=>atom.assertion.polarity==="NEGATED")
      .map(contradictionKey).filter(Boolean),
  );
  const affirmative=ledger.evidence
    .filter((atom)=>atom.assertion.polarity==="AFFIRMATIVE")
    .filter((atom)=>!contradictoryKeys.has(contradictionKey(atom)))
    .filter((atom)=>atom.provenance.source_type!=="CANDIDATE_ELICITED")
    .filter((atom)=>ledger.source_spans.some((span)=>span.id===atom.source_span_id))
    .sort((a,b)=>a.id.localeCompare(b.id));

  const accepted:AtomicEvidence[]=[];
  const seen=new Set<string>();
  for(const atom of affirmative){
    const key=dedupeKey(ledger,atom);
    if(!key||seen.has(key)) continue;
    if(accepted.some((candidate)=>semanticDuplicate(ledger,candidate,atom))) continue;
    seen.add(key);
    accepted.push(atom);
  }
  return accepted;
}


/**
 * Canonical D15 pre-connection atom boundary.
 * Exact extraction of the existing Professional Mirror rule: role-overview
 * EXPERIENCE_NON_BULLET atoms remain traceable Mirror evidence/facts but cannot
 * participate in D15 thread connections or maturity.
 */
export function d15ThreadEligibleAtoms(
  ledger: EvidenceLedger,
  atoms: AtomicEvidence[] = d15EligibleIndependentAtoms(ledger),
): AtomicEvidence[] {
  return atoms.filter(
    (atom) => spanFor(ledger, atom)?.source_section !== "EXPERIENCE_NON_BULLET",
  );
}
