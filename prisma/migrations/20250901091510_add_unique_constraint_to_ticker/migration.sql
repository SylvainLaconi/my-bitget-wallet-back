/*
  Warnings:

  - A unique constraint covering the columns `[ticker]` on the table `Token` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Token_ticker_key" ON "public"."Token"("ticker");
