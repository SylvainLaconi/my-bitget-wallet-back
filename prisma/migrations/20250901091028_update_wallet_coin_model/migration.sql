/*
  Warnings:

  - Added the required column `available` to the `WalletCoin` table without a default value. This is not possible if the table is not empty.
  - Added the required column `frozen` to the `WalletCoin` table without a default value. This is not possible if the table is not empty.
  - Added the required column `limitAvailable` to the `WalletCoin` table without a default value. This is not possible if the table is not empty.
  - Added the required column `locked` to the `WalletCoin` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uTime` to the `WalletCoin` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."WalletCoin" ADD COLUMN     "available" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "frozen" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "limitAvailable" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "locked" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "uTime" TEXT NOT NULL;
