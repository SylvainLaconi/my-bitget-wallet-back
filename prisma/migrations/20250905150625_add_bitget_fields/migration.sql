-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "apiKey" TEXT,
ADD COLUMN     "apiSecret" TEXT,
ADD COLUMN     "passphrase" TEXT;
