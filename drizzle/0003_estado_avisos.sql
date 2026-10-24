ALTER TABLE "users" ADD COLUMN "device_status" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;