export default class OpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (request) => {
          if (process.env.SUPPORT_JUDGE_INCOMPLETE_TEST !== "1") {
            throw new Error("OpenAI SDK call invoked during canonical tests; provide an explicit AI integration test mock.");
          }
          const name = request?.response_format?.json_schema?.name;
          if (name === "canonical_candidate_atoms") return { choices: [{ message: { content: JSON.stringify({ atoms: [{
            id: "A1", source_quote: "I managed finance", actor: "candidate", ownership: "INDIVIDUAL", normalized_action: "managed", object: "finance",
            domain: null, jurisdiction: null, situation: null, tools_or_systems: [], standards: [], quantity: null, currency: null, team_size: null, scope: null,
            start: null, end: null, recency: null, outcome: null, assertion_type: "RESPONSIBILITY", polarity: "AFFIRMATIVE",
            has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false, extraction_confidence: 1
          }] }) } }] };
          if (name === "canonical_jd_requirements") return { choices: [{ message: { content: JSON.stringify({ requirements: [{
            id: "REQ-1", source_quote: "Manage finance", normalized_requirement: "Manage finance", category: "CAPABILITY", salience: "CORE", extraction_confidence: 1,
            facets: [{ id: "F-1", type: "FUNCTION", requirement: "Manage finance", source_quote: "Manage finance" }]
          }] }) } }] };
          if (name === "canonical_support_judgments") return { choices: [{ message: { content: JSON.stringify({ judgments: [] }) } }] };
        },
      },
    };
  }
}
