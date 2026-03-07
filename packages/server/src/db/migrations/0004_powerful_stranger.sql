ALTER TABLE "series" DROP CONSTRAINT "series_draft_id_drafts_id_fk";
--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;