import { test, expect } from "@playwright/test";

const SEED_TICKET_IDS = ["TKT-1042", "TKT-1041", "TKT-1040", "TKT-1039"];
const SEED_SKUS = ["BAS-100", "JER-220", "SHO-340", "BAG-410", "WAT-520"];
const KPI_LABELS = ["Tickets", "Resolved", "SLA Met", "Ops Cost"];

test.beforeEach(async ({ page }) => {
  await page.goto("/capabilities");
  await page.waitForSelector("text=Mini Ticketing System", { timeout: 15_000 });
});

test.describe("DemoFrame error boundary", () => {
  test("no demo shows the crash fallback", async ({ page }) => {
    const demoSection = page.locator("#live-demos");
    await expect(demoSection).toBeVisible();
    await expect(demoSection.getByRole("alert")).toHaveCount(0);
  });
});

test.describe("Mini Ticketing System", () => {
  test("renders heading and 4 seed tickets", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Mini Ticketing System" })).toBeVisible();

    const ticketTable = page.getByRole("table", { name: "Ticket list" });
    await expect(ticketTable).toBeVisible();

    for (const id of SEED_TICKET_IDS) {
      await expect(ticketTable.getByText(id)).toBeVisible();
    }
  });

  test("create ticket form adds a new ticket to the table", async ({ page }) => {
    const section = page.locator("article", { hasText: "Mini Ticketing System" });
    const ticketTable = page.getByRole("table", { name: "Ticket list" });
    const rows = ticketTable.locator("tbody tr");

    await expect(rows).toHaveCount(4);

    await section.getByLabel("Title", { exact: true }).fill("Broken VPN gateway");
    await section.getByLabel("Requester").fill("Maria Santos");
    await section.getByRole("button", { name: "Create ticket" }).click();

    await expect(rows).toHaveCount(5);
    await expect(ticketTable.getByText("TKT-1043")).toBeVisible();
    await expect(ticketTable.getByText("Broken VPN gateway")).toBeVisible();
    await expect(ticketTable.getByText("Maria Santos")).toBeVisible();

    const newRow = ticketTable.locator("tr", { hasText: "TKT-1043" });
    await expect(newRow.getByText("medium")).toBeVisible();
    await expect(newRow.getByText("open")).toBeVisible();
  });

  test("advancing a ticket moves it through status stages", async ({ page }) => {
    const ticketTable = page.getByRole("table", { name: "Ticket list" });
    const openRow = ticketTable.locator("tr", { hasText: "TKT-1041" });

    await expect(openRow.getByText("open")).toBeVisible();
    await openRow.getByRole("button", { name: /Advance ticket TKT-1041/i }).click();
    await expect(openRow.getByText("in progress")).toBeVisible();

    await openRow.getByRole("button", { name: /Advance ticket TKT-1041/i }).click();
    await expect(openRow.getByText("resolved")).toBeVisible();
    await expect(openRow.getByRole("button", { name: /Advance/ })).toHaveCount(0);
  });

  test("Reset demo restores baseline after mutation", async ({ page }) => {
    const section = page.locator("article", { hasText: "Mini Ticketing System" });
    const ticketTable = page.getByRole("table", { name: "Ticket list" });

    await section.getByLabel("Title", { exact: true }).fill("E2E test ticket");
    await section.getByLabel("Requester").fill("Playwright Bot");
    await section.getByRole("button", { name: "Create ticket" }).click();

    await expect(ticketTable.getByText("TKT-1043")).toBeVisible();
    await expect(ticketTable.getByText("E2E test ticket")).toBeVisible();

    const rows = ticketTable.locator("tbody tr");
    await expect(rows).toHaveCount(5);

    await section.getByRole("button", { name: "Reset demo" }).click();

    await expect(rows).toHaveCount(4);
    await expect(ticketTable.getByText("TKT-1043")).toHaveCount(0);
    await expect(ticketTable.getByText("E2E test ticket")).toHaveCount(0);

    for (const id of SEED_TICKET_IDS) {
      await expect(ticketTable.getByText(id)).toBeVisible();
    }
  });
});

test.describe("Mini ERP — Inventory & Invoicing", () => {
  test("renders heading and 5 seed SKUs", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Mini ERP — Inventory & Invoicing" })
    ).toBeVisible();

    const inventoryTable = page.getByRole("table", { name: "Inventory list" });
    await expect(inventoryTable).toBeVisible();

    for (const sku of SEED_SKUS) {
      await expect(inventoryTable.getByText(sku)).toBeVisible();
    }
  });

  test("stock increase and decrease buttons update the count", async ({ page }) => {
    const inventoryTable = page.getByRole("table", { name: "Inventory list" });
    const basketballRow = inventoryTable.locator("tr", { hasText: "BAS-100" });
    const stockCell = basketballRow.locator("td").nth(3);

    const original = Number(await stockCell.textContent());

    await basketballRow.getByRole("button", { name: /Increase stock/i }).click();
    await expect(stockCell).toHaveText(String(original + 1));

    await basketballRow.getByRole("button", { name: /Increase stock/i }).click();
    await expect(stockCell).toHaveText(String(original + 2));

    await basketballRow.getByRole("button", { name: /Decrease stock/i }).click();
    await expect(stockCell).toHaveText(String(original + 1));
  });

  test("adding an invoice line appears in the invoice table", async ({ page }) => {
    const section = page.locator("article", { hasText: "Mini ERP" });
    const invoiceTable = page.getByRole("table", { name: "Invoice lines" });

    await expect(invoiceTable.locator("tbody tr", { hasText: "BAS-100" })).toBeVisible();
    await expect(invoiceTable.locator("tbody tr", { hasText: "JER-220" })).toBeVisible();

    const addLineTrigger = section.getByRole("combobox", { name: "Add line" });
    await addLineTrigger.click();
    await page.getByRole("option", { name: /SHO-340/ }).click();

    await section.getByLabel("Qty").fill("3");
    await section.getByRole("button", { name: "Add invoice line" }).click();

    const shoesRow = invoiceTable.locator("tbody tr", { hasText: "SHO-340" });
    await expect(shoesRow).toBeVisible();
    await expect(shoesRow.locator("td").nth(1)).toHaveText("3");
  });

  test("Reset demo restores baseline after mutation", async ({ page }) => {
    const section = page.locator("article", { hasText: "Mini ERP" });
    const inventoryTable = page.getByRole("table", { name: "Inventory list" });

    const basketballRow = inventoryTable.locator("tr", { hasText: "BAS-100" });
    const originalStock = await basketballRow.locator("td").nth(3).textContent();

    await basketballRow.getByRole("button", { name: /Increase stock/i }).click();
    const updatedStock = await basketballRow.locator("td").nth(3).textContent();
    expect(Number(updatedStock)).toBe(Number(originalStock) + 1);

    await section.getByRole("button", { name: "Reset demo" }).click();

    const restoredStock = await basketballRow.locator("td").nth(3).textContent();
    expect(Number(restoredStock)).toBe(Number(originalStock));

    for (const sku of SEED_SKUS) {
      await expect(inventoryTable.getByText(sku)).toBeVisible();
    }

    const inventoryRows = inventoryTable.locator("tbody tr");
    await expect(inventoryRows).toHaveCount(SEED_SKUS.length);
  });
});

test.describe("Live BI Dashboard", () => {
  test("renders heading and KPI cards", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Live BI Dashboard" })
    ).toBeVisible();

    const kpiRegion = page.getByRole("status", { name: "Operations KPIs" });
    await expect(kpiRegion).toBeVisible();

    for (const label of KPI_LABELS) {
      await expect(kpiRegion.getByText(label)).toBeVisible();
    }
  });

  test("changing date range updates KPI values", async ({ page }) => {
    const section = page.locator("article", { hasText: "Live BI Dashboard" });
    const kpiRegion = page.getByRole("status", { name: "Operations KPIs" });

    const defaultValues: string[] = [];
    for (const label of KPI_LABELS) {
      const card = kpiRegion.locator("div.rounded-lg", { hasText: label });
      const value = await card.locator(".text-2xl").textContent();
      defaultValues.push(value ?? "");
    }

    const rangeTrigger = section.getByRole("combobox", { name: "Date range" });
    await rangeTrigger.click();
    await page.getByRole("option", { name: "Last 7 days" }).click();

    const sevenDayValues: string[] = [];
    for (const label of KPI_LABELS) {
      const card = kpiRegion.locator("div.rounded-lg", { hasText: label });
      const value = await card.locator(".text-2xl").textContent();
      sevenDayValues.push(value ?? "");
    }

    expect(sevenDayValues).not.toEqual(defaultValues);

    await rangeTrigger.click();
    await page.getByRole("option", { name: "Last 90 days" }).click();

    const ninetyDayValues: string[] = [];
    for (const label of KPI_LABELS) {
      const card = kpiRegion.locator("div.rounded-lg", { hasText: label });
      const value = await card.locator(".text-2xl").textContent();
      ninetyDayValues.push(value ?? "");
    }

    expect(ninetyDayValues).not.toEqual(sevenDayValues);
  });

  test("Reset demo restores baseline after mutation", async ({ page }) => {
    const section = page.locator("article", { hasText: "Live BI Dashboard" });
    const kpiRegion = page.getByRole("status", { name: "Operations KPIs" });

    const defaultKpiValues: string[] = [];
    for (const label of KPI_LABELS) {
      const card = kpiRegion.locator("div.rounded-lg", { hasText: label });
      const value = await card.locator(".text-2xl").textContent();
      defaultKpiValues.push(value ?? "");
    }

    const rangeTrigger = section.getByRole("combobox", { name: "Date range" });
    await rangeTrigger.click();
    await page.getByRole("option", { name: "Last 7 days" }).click();

    const changedKpiValues: string[] = [];
    for (const label of KPI_LABELS) {
      const card = kpiRegion.locator("div.rounded-lg", { hasText: label });
      const value = await card.locator(".text-2xl").textContent();
      changedKpiValues.push(value ?? "");
    }

    expect(changedKpiValues).not.toEqual(defaultKpiValues);

    await section.getByRole("button", { name: "Reset demo" }).click();

    for (let i = 0; i < KPI_LABELS.length; i++) {
      const card = kpiRegion.locator("div.rounded-lg", { hasText: KPI_LABELS[i] });
      await expect(card.locator(".text-2xl")).toHaveText(defaultKpiValues[i]);
    }
  });
});
