export type ResponseFormatName = "json_object" | "json_schema";

export interface ModelRequestOptions {
  temperature?: number | null;
  response_format?: { type?: string } | null;
}

interface ModelCapabilities {
  temperature: "any" | "default-only";
  responseFormats?: readonly ResponseFormatName[];
  provenance: string;
}

export const MODEL_CAPABILITIES: Readonly<Record<string, ModelCapabilities>> = Object.freeze({
  "gpt-5.4-mini": {
    temperature: "any",
    responseFormats: ["json_schema"],
    provenance: "Observed D15 experiment request accepted with temperature 0 and strict json_schema.",
  },
  "gpt-5.6-luna": {
    temperature: "default-only",
    provenance: "Observed D15 pre-spend investigation: temperature 0 rejected; only default 1 supported.",
  },
  "gpt-5.6-terra": {
    temperature: "default-only",
    provenance: "D15 qualification workflow run 36887606029: API rejected temperature 0; only default 1 supported.",
  },
});

export const LUNA_TERRA_CAPABILITY_FIXTURES = Object.freeze([
  { provider: "Luna", model: "gpt-5.6-luna", unsupported: { temperature: 0 } },
  { provider: "Terra", model: "gpt-5.6-terra", unsupported: { temperature: 0 } },
] as const);

export function validateModelRequestCapabilities(model: string, options: ModelRequestOptions): string[] {
  const capabilities = MODEL_CAPABILITIES[model];
  if (!capabilities) return [`Unsupported model "${model}"; add an explicit capability entry before use.`];

  const errors: string[] = [];
  if (options.temperature !== undefined && options.temperature !== null) {
    if (typeof options.temperature !== "number" || !Number.isFinite(options.temperature)) {
      errors.push("temperature must be a finite number.");
    } else if (capabilities.temperature === "default-only" && options.temperature !== 1) {
      errors.push(`Model "${model}" only supports the default temperature value (1).`);
    } else if (capabilities.temperature === "any" && (options.temperature < 0 || options.temperature > 2)) {
      errors.push(`temperature for model "${model}" must be between 0 and 2.`);
    }
  }

  if (options.response_format !== undefined && options.response_format !== null) {
    const format = options.response_format.type;
    if (capabilities.responseFormats &&
        (typeof format !== "string" || !capabilities.responseFormats.includes(format as ResponseFormatName))) {
      errors.push(`Model "${model}" does not support response_format "${String(format)}".`);
    }
  }

  return errors;
}

export function assertModelRequestCapabilities(model: string, options: ModelRequestOptions): void {
  const errors = validateModelRequestCapabilities(model, options);
  if (errors.length) throw new Error(`Model capability validation failed: ${errors.join(" ")}`);
}
