CREATE TYPE "public"."deduction_reason" AS ENUM('MISSING_DOCUMENT', 'NON_PAYABLE_ITEM', 'ROOM_RENT_CAP', 'CO_PAY', 'OTHER');--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "settled_amount_paise" bigint;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "deduction_amount_paise" bigint;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "deduction_reason" "deduction_reason";--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "valid_settled_money" CHECK ("claims"."settled_amount_paise" IS NULL OR "claims"."settled_amount_paise" >= 0);--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "valid_settlement_deduction" CHECK (("claims"."deduction_amount_paise" IS NULL AND "claims"."deduction_reason" IS NULL) OR ("claims"."deduction_amount_paise" IS NOT NULL AND "claims"."deduction_amount_paise" > 0 AND "claims"."deduction_reason" IS NOT NULL));