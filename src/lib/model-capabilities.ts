export type ResponseFormatName = "json_object" | "json_schema";

export interface ModelRequestOptions {
  temperature?: number | null;
  response_format?: { type?: string } | null;
  top_p?: number | null;
  presence_penalty?: number | null;
  frequency_penalty?: number | null;
  logprobs?: boolean | null;
  top_logprobs?: number | null;
}

interface ModelCapabilities {
  temperature: "any" | "default-only";
  responseFormats: readonly ResponseFormatName[];
}

export const MODEL_CAPABILITIES: Readonly<Record<string, ModelCapabilities>> = Object.freeze({
  "gpt-4o-mini": { temperature: "any", responseFormats: ["json_object", "json_schema"] },
  "gpt-4o-mini-2024-07-18": { temperature: "any", responseFormats: ["json_object", "json_schema"] },
  "gpt-4o": { temperature: "any", responseFormats: ["json_object", "json_schema"] },
  "gpt-4o-2024-08-06": { temperature: "any", responseFormats: ["json_object", "json_schema"] },
  "o1": { temperature: "default-only", responseFormats: ["json_schema"] },
  "o1-mini": { temperature: "default-only", responseFormats: ["json_schema"] },
  "o1-preview": { temperature: "default-only", responseFormats: ["json_schema"] },
  "o3": { temperature: "default-only", responseFormats: ["json_schema"] },
  "o3-mini": { temperature: "default-only", responseFormats: ["json_schema"] },
  "o4-mini": { temperature: "default-only", responseFormats: ["json_schema"] },
  "gpt-5": { temperature: "default-only", responseFormats: ["json_schema"] },
  "gpt-5-mini": { temperature: "default-only", responseFormats: ["json_schema"] },
  "gpt-5-nano": { temperature: "default-only", responseFormats: ["json_schema"] },
});

const REASONING_ONLY_MODELS = new Set([
  "o1",
  "o1-mini",
  "o1-preview",
  "o3",
  "o3-mini",
  "o4-mini",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
]);

const REASONING_INCOMPATIBLE_PARAMETERS = [
  "top_p",
  "presence_penalty",
  "frequency_penalty",
  "logprobs",
  "top_logprobs",
] as const;

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

  if (REASONING_ONLY_MODELS.has(model)) {
    for (const parameter of REASONING_INCOMPATIBLE_PARAMETERS) {
      if ((options as Record<string, unknown>)[parameter] !== undefined) {
        errors.push(`Model "${model}" does not support "${parameter}".`);
      }
    }
  }

  if (options.response_format !== undefined && options.response_format !== null) {
    const format = options.response_format.type;
    if (typeof format !== "string" || !capabilities.responseFormats.includes(format as ResponseFormatName)) {
      errors.push(`Model "${model}" does not support response_format "${String(format)}".`);
    }
  }

  return errors;
}

export function assertModelRequestCapabilities(model: string, options: ModelRequestOptions): void {
  const errors = validateModelRequestCapabilities(model, options);
  if (errors.length) throw new Error(`Model capability validation failed: ${errors.join(" ")}`);
}
