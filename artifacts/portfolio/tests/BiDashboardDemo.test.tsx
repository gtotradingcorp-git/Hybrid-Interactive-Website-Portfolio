import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BiDashboardDemo from "@/components/demos/BiDashboardDemo";
import {
  buildBiCsvRows,
  computeKpis,
  seedData,
  selectPreviousRange,
  selectRange,
} from "@/components/demos/bi.logic";

let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
let clickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  createObjectURLSpy = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:mock-url");
  clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
});

afterEach(() => {
  createObjectURLSpy.mockRestore();
  clickSpy.mockRestore();
});

async function pickFromSelect(
  user: ReturnType<typeof userEvent.setup>,
  triggerName: RegExp | string,
  optionName: RegExp | string,
) {
  const trigger = screen.getByRole("combobox", { name: triggerName });
  await user.click(trigger);
  const option = await screen.findByRole("option", { name: optionName });
  await user.click(option);
}

function findKpi(label: RegExp | string): HTMLElement {
  const status = screen.getByRole("status", { name: /operations kpis/i });
  const labelEl = within(status).getByText(label);
  return labelEl.parentElement as HTMLElement;
}

describe("BiDashboardDemo (component)", () => {
  test("renders all four KPI cards", () => {
    render(<BiDashboardDemo />);

    const status = screen.getByRole("status", { name: /operations kpis/i });
    expect(within(status).getByText(/^Tickets$/i)).toBeInTheDocument();
    expect(within(status).getByText(/^Resolved$/i)).toBeInTheDocument();
    expect(within(status).getByText(/^SLA Met$/i)).toBeInTheDocument();
    expect(within(status).getByText(/^Ops Cost$/i)).toBeInTheDocument();
  });

  test("KPI values match the deterministic seed for the default range", () => {
    render(<BiDashboardDemo />);

    const data = seedData();
    const filtered = selectRange(data, 30);
    const previous = selectPreviousRange(data, 30);
    const kpis = computeKpis(filtered, previous);

    expect(findKpi(/^Tickets$/i)).toHaveTextContent(
      kpis.totalTickets.toLocaleString(),
    );
    expect(findKpi(/^Resolved$/i)).toHaveTextContent(
      kpis.totalResolved.toLocaleString(),
    );
    expect(findKpi(/^SLA Met$/i)).toHaveTextContent(`${kpis.slaPct}%`);
  });

  test("changing the date range updates the KPI values to match the new period", async () => {
    const user = userEvent.setup();
    render(<BiDashboardDemo />);

    const data = seedData();
    const before = computeKpis(selectRange(data, 30), selectPreviousRange(data, 30));
    const after = computeKpis(selectRange(data, 7), selectPreviousRange(data, 7));

    // Sanity: the seeded data should differ between 7d and 30d windows.
    expect(after.totalTickets).not.toBe(before.totalTickets);

    // Verify "before" state is rendered first
    expect(findKpi(/^Tickets$/i)).toHaveTextContent(
      before.totalTickets.toLocaleString(),
    );

    // Switch to 7-day range
    await pickFromSelect(user, /date range/i, /last 7 days/i);

    // Verify "after" state is now rendered
    expect(findKpi(/^Tickets$/i)).toHaveTextContent(
      after.totalTickets.toLocaleString(),
    );
    expect(findKpi(/^Resolved$/i)).toHaveTextContent(
      after.totalResolved.toLocaleString(),
    );
  });

  test("KPI delta indicators render when there is a previous-period comparison", () => {
    render(<BiDashboardDemo />);

    const data = seedData();
    const kpis = computeKpis(selectRange(data, 30), selectPreviousRange(data, 30));

    // SLA delta is rendered with " pts" suffix
    if (Number.isFinite(kpis.slaDelta)) {
      const slaCard = findKpi(/^SLA Met$/i);
      expect(slaCard).toHaveTextContent("pts");
    }

    // Cost delta is a percent
    if (Number.isFinite(kpis.costDelta)) {
      const costCard = findKpi(/^Ops Cost$/i);
      expect(costCard.textContent || "").toMatch(/%/);
    }
  });

  test("export CSV builds a download with the correct row count for the visible range", async () => {
    const user = userEvent.setup();
    render(<BiDashboardDemo />);

    await user.click(screen.getByRole("button", { name: /export csv/i }));

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // The Blob passed to createObjectURL should contain the header + one row per
    // selected day. Default range is 30 days.
    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blob.type).toMatch(/text\/csv/i);

    const text = await blob.text();
    const rows = text.split("\n");
    const expectedRows = buildBiCsvRows(selectRange(seedData(), 30));
    expect(rows.length).toBe(expectedRows.length);
    expect(rows[0]).toBe(expectedRows[0].join(","));
  });

  test("reset returns the date range and KPIs to the default 30-day window", async () => {
    const user = userEvent.setup();
    render(<BiDashboardDemo />);

    const data = seedData();
    const default30 = computeKpis(
      selectRange(data, 30),
      selectPreviousRange(data, 30),
    );

    // Switch to 7d, confirm KPI changed
    await pickFromSelect(user, /date range/i, /last 7 days/i);

    // Reset
    await user.click(screen.getByRole("button", { name: /reset demo/i }));

    // Back to default 30d KPI value
    expect(findKpi(/^Tickets$/i)).toHaveTextContent(
      default30.totalTickets.toLocaleString(),
    );
  });
});
