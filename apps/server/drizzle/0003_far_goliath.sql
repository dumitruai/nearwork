ALTER TABLE "employee_preferences" DROP CONSTRAINT "location_check";--> statement-breakpoint
ALTER TABLE "employee_preferences" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "employee_preferences" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "employee_preferences" ADD COLUMN "location_label" text;--> statement-breakpoint
ALTER TABLE "employee_preferences" ADD CONSTRAINT "manual_location_check" CHECK ("employee_preferences"."location_source" IS DISTINCT FROM 'manual' OR ("employee_preferences"."latitude" IS NOT NULL AND "employee_preferences"."longitude" IS NOT NULL AND "employee_preferences"."latitude" BETWEEN -90 AND 90 AND "employee_preferences"."longitude" BETWEEN -180 AND 180));--> statement-breakpoint
ALTER TABLE "employee_preferences" ADD CONSTRAINT "location_check" CHECK ("employee_preferences"."location_source" IS NULL OR "employee_preferences"."location_source" IN ('device', 'manual'));