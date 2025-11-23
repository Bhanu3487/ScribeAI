/*
  Warnings:

  - You are about to drop the column `audioData` on the `TranscriptChunk` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TranscriptChunk" DROP COLUMN "audioData",
ADD COLUMN     "sequence" INTEGER;
