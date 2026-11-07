import type { AiClient, AiQuerySummary, Classification } from "./client";
export class FakeAiClient implements AiClient {
  constructor(
    private readonly classification: Classification | Error = {
      document_type_key: "OTHER",
      confidence: 0.5,
      reason: "Test fixture",
      document_date: null,
      fields: [],
    },
    private readonly summary: AiQuerySummary | Error = {
      summary: "A report is requested.",
      asks: ["Provide the report"],
      requested_document_keys: [],
      deadline_iso: null,
    },
  ) {}
  async classifyAndExtract() {
    if (this.classification instanceof Error) throw this.classification;
    return this.classification;
  }
  async summariseQuery() {
    if (this.summary instanceof Error) throw this.summary;
    return this.summary;
  }
}
