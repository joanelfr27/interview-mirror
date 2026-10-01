# D15 Disposable Blind Pilot #1 — Seal Manifest

Status: SEALED — NOT AN ANNOTATION ARTIFACT

Frozen codebook commit: `cb232a97fc9c7e1f7a796744ce6ba0c5d332ff6b`
Frozen codebook SHA-256 (exact committed UTF-8 content): `13095ac257ee8ef1797c77721556dfff2c7f1aac2fb65ae0dc668ea50b27df22`

Pilot: 12 disposable cases, 6 per round.
Case designer: ChatGPT (OpenAI), not a pilot labeler.

Sealed artifact hashes:
- Round 1 blind pack: `d2b39cc9c0edd5cf359fb2cce376e15309b6f4a74d252761554f651a166cc199`
- Round 2 blind pack: `0b903b2ed1d7b20cdec36c3b1dfcd297df8c96c97f6d08d00398d13321d76131`
- Hidden administration key: `963530593403b1e70c2bcd2105f55e4681e4b91bf1ab00962d6fbbaf2d4c1137`
- Sealed designer-intent record: `c7f05fd77d51641dce56a0eb3b245a692eeee277ccd62658185b874f11b8ce7c`
- Annotation template: `c0e88d7fad0a4f5c5bed0eea04d450b204ce8a21eb8184129e64b164836c0730`
- Custodian manifest: `b1e8c082f1291dd82c8cceb05e6a70213cfdce6acd56feea3733e240274af4ee`

Handling:
- Round 1 blind pack may be supplied to both human labelers.
- Round 2 blind pack remains withheld until both Round 1 annotations are locked.
- Hidden administration key and designer-intent record remain withheld until both humans have locked both rounds.
- This public manifest records hashes only; it does not reveal pair identities, dimensions, or designer labels.
- Any byte change to a sealed artifact invalidates its recorded hash.
- Any material semantic change to the codebook invalidates this pilot and requires a fresh disposable pilot.
