ALTER TABLE "List" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
ALTER TABLE "Task" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
CREATE INDEX "Task_fts_idx" ON "Task" USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '')));
