-- Add database-level UUID default for AllowedEmail.id
-- Prisma generates UUIDs at the application level, but having a DB default
-- makes the schema more robust against raw SQL inserts.
ALTER TABLE "AllowedEmail" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
