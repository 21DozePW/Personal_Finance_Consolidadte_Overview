-- CreateEnum
CREATE TYPE "BudgetCarryOverRule" AS ENUM ('RESET', 'ROLLOVER_SURPLUS', 'ACCUMULATE');

-- AlterTable
ALTER TABLE "BudgetLine" ADD COLUMN     "carryOverRule" "BudgetCarryOverRule" NOT NULL DEFAULT 'RESET';
