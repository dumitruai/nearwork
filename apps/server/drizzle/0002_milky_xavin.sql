ALTER TABLE "employee_preferences" DROP CONSTRAINT "location_check";--> statement-breakpoint
UPDATE "employee_preferences" SET "location_source" = NULL, "updated_at" = now() WHERE "location_source" = 'demo';--> statement-breakpoint
UPDATE "jobs" SET "is_active" = false, "updated_at" = now() WHERE "seed_key" LIKE 'london-job-%';--> statement-breakpoint
ALTER TABLE "employee_preferences" DROP COLUMN "demo_preset_key";--> statement-breakpoint
ALTER TABLE "employee_preferences" ADD CONSTRAINT "location_check" CHECK ("employee_preferences"."location_source" IS NULL OR "employee_preferences"."location_source" = 'device');
