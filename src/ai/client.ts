import { z } from "zod";
import { PREAUTH_FIELDS } from "@/domain/preauth-fields";
import { normalizeGender } from "@/domain/gender";
import { IDENTITY_FIELD_KEYS } from "@/domain/identity";

export type DocumentTypeCatalogue = readonly {
  id: string;
  key: string;
  label: string;
  aiHint: string;
}[];
export const classificationSchema = z.object({
  document_type_key: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(2000),
  document_date: z.iso.date().nullable(),
  fields: z
    .array(
      z.object({
        key: z.enum([
          ...PREAUTH_FIELDS.map((field) => field.key),
          ...IDENTITY_FIELD_KEYS,
        ]),
        value: z.string().max(5000),
        source_snippet: z.string().max(5000),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(30),
});
export const querySummarySchema = z.object({
  summary: z.string().min(1).max(5000),
  asks: z.array(z.string().max(2000)).max(30),
  requested_document_keys: z.array(z.string()).max(30),
  deadline_iso: z.iso.datetime({ offset: true }).nullable(),
});
export type Classification = z.infer<typeof classificationSchema>;
export type AiQuerySummary = z.infer<typeof querySummarySchema>;
export interface AiClient {
  classifyAndExtract(
    bytes: Uint8Array,
    mime: string,
    catalogue: DocumentTypeCatalogue,
  ): Promise<Classification>;
  summariseQuery(
    subject: string,
    body: string,
    catalogue: DocumentTypeCatalogue,
  ): Promise<AiQuerySummary>;
}
export function aiErrorText(error: unknown): string {
  if (
    error instanceof Error &&
    /timeout|timed out|abort|deadline/i.test(`${error.name} ${error.message}`)
  )
    return "The AI took too long and timed out. Sort the document yourself or try again.";
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return "The AI gave an answer that could not be used. Sort the document yourself or try again.";
  return "The AI could not read this document. Sort it yourself or try again.";
}
export async function classifyForReview(
  client: AiClient,
  bytes: Uint8Array,
  mime: string,
  catalogue: DocumentTypeCatalogue,
) {
  try {
    const result = classificationSchema.parse(
      await client.classifyAndExtract(bytes, mime, catalogue),
    );
    const type = catalogue.find(
      (entry) => entry.key === result.document_type_key,
    );
    const unsure = !type || result.confidence < 0.75;
    const fieldTypes = [
      "PREAUTH_FORM",
      "DOCTOR_NOTES",
      "POLICY_CARD",
      "PHOTO_ID",
      "COST_ESTIMATE",
    ];
    return {
      status: "NEEDS_REVIEW" as const,
      documentTypeId: unsure ? null : (type?.id ?? null),
      aiDocumentTypeKey: result.document_type_key,
      aiConfidence: result.confidence,
      aiReason: unsure ? `AI unsure. ${result.reason}` : result.reason,
      documentDate: result.document_date,
      classifiedBy: "AI" as const,
      error: null,
      identityEvidence: result.fields
        .filter((field) =>
          (IDENTITY_FIELD_KEYS as readonly string[]).includes(field.key),
        )
        .map((field) => ({
          fieldKey: field.key,
          value: field.value,
          sourceSnippet: field.source_snippet,
        })),
      fields: (fieldTypes.includes(result.document_type_key)
        ? result.fields.filter((field) => field.key !== "uhid")
        : []
      ).map((field) => ({
        fieldKey: field.key,
        value:
          field.key === "gender" ? normalizeGender(field.value) : field.value,
        sourceSnippet: field.source_snippet,
        confidence: field.confidence,
        status: "PENDING" as const,
      })),
    };
  } catch (error) {
    return {
      status: "FAILED" as const,
      documentTypeId: null,
      error: aiErrorText(error),
      fields: [],
    };
  }
}
export async function summariseForReview(
  client: AiClient,
  subject: string,
  body: string,
  catalogue: DocumentTypeCatalogue,
) {
  try {
    const result = querySummarySchema.parse(
      await client.summariseQuery(subject, body, catalogue),
    );
    return {
      summary: {
        ...result,
        requested_document_keys: result.requested_document_keys.filter((key) =>
          catalogue.some((type) => type.key === key),
        ),
      },
      error: null,
    };
  } catch (error) {
    return { summary: null, error: aiErrorText(error) };
  }
}
