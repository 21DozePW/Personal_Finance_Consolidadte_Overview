import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

let createScenario: typeof import("@/server/scenarios").createScenario;
let updateScenario: typeof import("@/server/scenarios").updateScenario;
let deleteScenario: typeof import("@/server/scenarios").deleteScenario;
let cloneScenario: typeof import("@/server/scenarios").cloneScenario;
let listScenarios: typeof import("@/server/scenarios").listScenarios;
let getScenarioProjection: typeof import("@/server/scenarios").getScenarioProjection;
let ScenarioError: typeof import("@/server/scenarios").ScenarioError;

beforeAll(async () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const mod = await import("@/server/scenarios");
  createScenario = mod.createScenario;
  updateScenario = mod.updateScenario;
  deleteScenario = mod.deleteScenario;
  cloneScenario = mod.cloneScenario;
  listScenarios = mod.listScenarios;
  getScenarioProjection = mod.getScenarioProjection;
  ScenarioError = mod.ScenarioError;
});

afterAll(async () => {
  await prisma.$disconnect();
  process.env.FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
});

async function reset() {
  await prisma.auditLog.deleteMany({});
  await prisma.forecastScenario.deleteMany({});
  await prisma.goal.deleteMany({});
  await prisma.budgetLine.deleteMany({});
  await prisma.budget.deleteMany({});
  await prisma.recurringCommitment.deleteMany({});
  await prisma.loanTerms.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.accountBalance.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.institution.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.fxRate.deleteMany({});
  await prisma.user.deleteMany({});
}

async function makeUser() {
  return prisma.user.create({
    data: {
      googleSub: `sub-${Math.random()}`,
      email: `u-${Math.random()}@example.com`,
      displayName: "U",
      role: UserRole.ADMIN,
      isActive: true,
    },
  });
}

const validAssumptions = {
  startMonth: "2026-01",
  horizonMonths: 12,
  monthlyIncomeAdjustment: "0",
  monthlyExpenseAdjustment: "0",
  annualIncomeGrowthPct: "0",
  annualExpenseGrowthPct: "0",
  annualReturnPct: "0",
  lumpSums: [],
  fxDrift: [],
};

d("Forecast scenarios", () => {
  beforeEach(async () => {
    await reset();
  });

  it("creates a scenario and reads it back via listScenarios", async () => {
    const u = await makeUser();
    await createScenario(u.id, {
      name: "Baseline 2026",
      isBaseline: true,
      assumptions: validAssumptions,
    });
    const list = await listScenarios();
    expect(list).toHaveLength(1);
    expect(list[0]!.isBaseline).toBe(true);
  });

  it("setting a second baseline demotes the first", async () => {
    const u = await makeUser();
    const first = await createScenario(u.id, {
      name: "A",
      isBaseline: true,
      assumptions: validAssumptions,
    });
    const second = await createScenario(u.id, {
      name: "B",
      isBaseline: true,
      assumptions: validAssumptions,
    });
    const reloaded = await prisma.forecastScenario.findUniqueOrThrow({ where: { id: first.id } });
    expect(reloaded.isBaseline).toBe(false);
    expect(second.isBaseline).toBe(true);
  });

  it("rejects bad inputs cleanly", async () => {
    const u = await makeUser();
    await expect(
      createScenario(u.id, {
        name: "Bad",
        assumptions: { ...validAssumptions, lumpSums: [{ month: "bad", amount: "5" }] },
      }),
    ).rejects.toBeInstanceOf(ScenarioError);
  });

  it("update flips isBaseline and demotes prior baseline", async () => {
    const u = await makeUser();
    const a = await createScenario(u.id, {
      name: "A",
      isBaseline: true,
      assumptions: validAssumptions,
    });
    const b = await createScenario(u.id, {
      name: "B",
      isBaseline: false,
      assumptions: validAssumptions,
    });
    await updateScenario(u.id, b.id, { isBaseline: true });
    const aReloaded = await prisma.forecastScenario.findUniqueOrThrow({ where: { id: a.id } });
    const bReloaded = await prisma.forecastScenario.findUniqueOrThrow({ where: { id: b.id } });
    expect(aReloaded.isBaseline).toBe(false);
    expect(bReloaded.isBaseline).toBe(true);
  });

  it("clone copies assumptions with a new name", async () => {
    const u = await makeUser();
    const a = await createScenario(u.id, {
      name: "Source",
      assumptions: { ...validAssumptions, annualReturnPct: "5" },
    });
    const cloned = await cloneScenario(u.id, a.id, "Source · copy");
    expect(cloned.name).toBe("Source · copy");
    expect(cloned.isBaseline).toBe(false);
    const reloaded = await prisma.forecastScenario.findUniqueOrThrow({ where: { id: cloned.id } });
    const j = reloaded.assumptions as unknown as Record<string, unknown>;
    expect(j.annualReturnPct).toBe("5");
  });

  it("delete removes the row and writes an audit", async () => {
    const u = await makeUser();
    const s = await createScenario(u.id, { name: "X", assumptions: validAssumptions });
    await deleteScenario(u.id, s.id);
    expect(await prisma.forecastScenario.findUnique({ where: { id: s.id } })).toBeNull();
    const audits = await prisma.auditLog.findMany({ where: { entityType: "ForecastScenario" } });
    expect(audits.length).toBeGreaterThanOrEqual(2); // create + delete
  });

  it("projection runs without commitments and returns horizon-many rows", async () => {
    const u = await makeUser();
    const s = await createScenario(u.id, {
      name: "Bare",
      assumptions: { ...validAssumptions, horizonMonths: 24, monthlyIncomeAdjustment: "100" },
    });
    const proj = await getScenarioProjection(s.id);
    expect(proj.result.rows).toHaveLength(24);
    // Starting net worth is 0 (no accounts); 24 × 100 CHF = 240 000 minor units.
    expect(proj.result.endingNetWorthMinor).toBe(240_000);
  });
});
