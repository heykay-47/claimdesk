ALTER TABLE "documents" ADD COLUMN "identity_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "identity_override_by" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "identity_override_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "removed_by" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_identity_override_by_users_id_fk" FOREIGN KEY ("identity_override_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "documents" AS d
SET "identity_evidence" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object('fieldKey', f."field_key", 'value', f."value", 'sourceSnippet', f."source_snippet"))
  FROM "extracted_fields" AS f
  WHERE f."document_id" = d."id" AND f."field_key" IN ('patient_name', 'policy_number', 'uhid')
), '[]'::jsonb);
