-- Add frozenAt and expiresAt columns to FreezerItem
-- Default frozenAt to now(), expiresAt to 3 months from now for existing rows
ALTER TABLE "FreezerItem" ADD COLUMN "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FreezerItem" ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '3 months');

-- Remove the default on expiresAt so it must be set explicitly by the application
ALTER TABLE "FreezerItem" ALTER COLUMN "expiresAt" DROP DEFAULT;
