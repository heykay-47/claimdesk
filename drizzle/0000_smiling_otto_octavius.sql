CREATE TYPE "public"."claim_status" AS ENUM('PREAUTH_DRAFT', 'PREAUTH_SUBMITTED', 'QUERY', 'APPROVED', 'ENHANCEMENT', 'FINAL_BILL_SUBMITTED', 'SETTLED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('PROCESSING', 'NEEDS_REVIEW', 'CONFIRMED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."field_status" AS ENUM('PENDING', 'CONFIRMED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."payer_kind" AS ENUM('INSURER', 'TPA');--> statement-breakpoint
CREATE TYPE "public"."query_status" AS ENUM('OPEN', 'ANSWERED');--> statement-breakpoint
CREATE TYPE "public"."requirement" AS ENUM('REQUIRED', 'OPTIONAL', 'WAIVED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('EXECUTIVE', 'HEAD');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('PREAUTH', 'ENHANCEMENT', 'DISCHARGE');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_id" uuid,
	"procedure_id" uuid,
	"document_type_id" uuid NOT NULL,
	"stage" "stage" NOT NULL,
	"requirement" "requirement" NOT NULL,
	"max_age_hours" integer,
	"note" text DEFAULT '' NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_rules_scope_unique" UNIQUE NULLS NOT DISTINCT("payer_id","procedure_id","document_type_id","stage"),
	CONSTRAINT "positive_max_age" CHECK ("checklist_rules"."max_age_hours" IS NULL OR "checklist_rules"."max_age_hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "claim_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"from_status" "claim_status",
	"to_status" "claim_status" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"actor_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"patient_name" text NOT NULL,
	"patient_age" integer NOT NULL,
	"patient_gender" text NOT NULL,
	"uhid" text NOT NULL,
	"policy_number" text NOT NULL,
	"payer_id" uuid NOT NULL,
	"procedure_id" uuid NOT NULL,
	"treating_doctor" text NOT NULL,
	"admitted_at" timestamp with time zone NOT NULL,
	"estimated_amount_paise" bigint NOT NULL,
	"approved_amount_paise" bigint,
	"status" "claim_status" DEFAULT 'PREAUTH_DRAFT' NOT NULL,
	"assigned_to" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_code_unique" UNIQUE("code"),
	CONSTRAINT "valid_patient_age" CHECK ("claims"."patient_age" BETWEEN 0 AND 130),
	CONSTRAINT "valid_claim_money" CHECK ("claims"."estimated_amount_paise" >= 0 AND ("claims"."approved_amount_paise" IS NULL OR "claims"."approved_amount_paise" >= 0))
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"ai_hint" text NOT NULL,
	CONSTRAINT "document_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"blob_pathname" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"document_type_id" uuid,
	"ai_document_type_key" text,
	"ai_confidence" real,
	"ai_reason" text,
	"classified_by" text,
	"status" "doc_status" DEFAULT 'PROCESSING' NOT NULL,
	"document_date" date,
	"error" text,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "document_classified_by" CHECK ("documents"."classified_by" IS NULL OR "documents"."classified_by" IN ('AI', 'USER')),
	CONSTRAINT "document_confidence_range" CHECK ("documents"."ai_confidence" IS NULL OR "documents"."ai_confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "extracted_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"value" text NOT NULL,
	"source_snippet" text NOT NULL,
	"confidence" real NOT NULL,
	"status" "field_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "field_confidence_range" CHECK ("extracted_fields"."confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "payers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "payer_kind" NOT NULL,
	"query_reply_hours" integer DEFAULT 24 NOT NULL,
	"preauth_sla_minutes" integer DEFAULT 60 NOT NULL,
	"discharge_sla_minutes" integer DEFAULT 180 NOT NULL,
	CONSTRAINT "positive_payer_windows" CHECK ("payers"."query_reply_hours" > 0 AND "payers"."preauth_sla_minutes" > 0 AND "payers"."discharge_sla_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "procedures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"specialty" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"from_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "query_status" DEFAULT 'OPEN' NOT NULL,
	"ai_summary" jsonb,
	"ai_error" text,
	"reply_body" text,
	"answered_at" timestamp with time zone,
	"answered_by" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_rules" ADD CONSTRAINT "checklist_rules_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_rules" ADD CONSTRAINT "checklist_rules_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_rules" ADD CONSTRAINT "checklist_rules_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_rules" ADD CONSTRAINT "checklist_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_at_idx" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "checklist_rules_stage_idx" ON "checklist_rules" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "claim_events_timeline_idx" ON "claim_events" USING btree ("claim_id","at");--> statement-breakpoint
CREATE INDEX "claims_worklist_idx" ON "claims" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "claims_payer_idx" ON "claims" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "claims_procedure_idx" ON "claims" USING btree ("procedure_id");--> statement-breakpoint
CREATE INDEX "claims_assignee_idx" ON "claims" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "documents_claim_idx" ON "documents" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "documents_type_idx" ON "documents" USING btree ("document_type_id");--> statement-breakpoint
CREATE INDEX "fields_claim_idx" ON "extracted_fields" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "fields_document_idx" ON "extracted_fields" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "queries_inbox_idx" ON "queries" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "queries_claim_idx" ON "queries" USING btree ("claim_id");