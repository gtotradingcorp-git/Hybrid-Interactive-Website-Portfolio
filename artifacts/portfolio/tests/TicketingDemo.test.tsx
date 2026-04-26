import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TicketingDemo from "@/components/demos/TicketingDemo";

// Pin the clock so SLA labels and seed-relative timestamps are deterministic.
// shouldAdvanceTime=true lets userEvent's internal delays still resolve while
// we keep control of Date.now() and the demo's setInterval.
const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function pickFromSelect(
  user: ReturnType<typeof userEvent.setup>,
  triggerName: RegExp | string,
  optionName: RegExp | string,
) {
  // Radix Select trigger renders as a combobox. Open it, then pick by option role.
  const trigger = screen.getByRole("combobox", { name: triggerName });
  await user.click(trigger);
  const option = await screen.findByRole("option", { name: optionName });
  await user.click(option);
}

describe("TicketingDemo (component)", () => {
  test("renders the four seed tickets with summary stats", () => {
    render(<TicketingDemo />);

    const summary = screen.getByRole("status", { name: /ticketing summary/i });
    expect(within(summary).getByText("Open")).toBeInTheDocument();
    expect(within(summary).getByText("Overdue")).toBeInTheDocument();
    expect(within(summary).getByText("Resolved")).toBeInTheDocument();

    const list = screen.getByRole("table", { name: /ticket list/i });
    // Seed tickets render with fixed IDs TKT-1039..TKT-1042
    expect(within(list).getByText("TKT-1042")).toBeInTheDocument();
    expect(within(list).getByText("TKT-1041")).toBeInTheDocument();
    expect(within(list).getByText("TKT-1040")).toBeInTheDocument();
    expect(within(list).getByText("TKT-1039")).toBeInTheDocument();
  });

  test("create form adds a new ticket and clears the title/requester fields", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TicketingDemo />);

    const title = screen.getByLabelText("Title") as HTMLInputElement;
    const requester = screen.getByLabelText("Requester") as HTMLInputElement;

    await user.type(title, "Printer offline in clinic 2");
    await user.type(requester, "Nurse station");
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    // INITIAL_COUNTER is 1043 → new ticket gets TKT-1043
    const list = screen.getByRole("table", { name: /ticket list/i });
    expect(within(list).getByText("TKT-1043")).toBeInTheDocument();
    expect(
      within(list).getByText("Printer offline in clinic 2"),
    ).toBeInTheDocument();

    expect(title.value).toBe("");
    expect(requester.value).toBe("");
  });

  test("advance button moves a ticket open → in progress → resolved", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TicketingDemo />);

    // TKT-1041 is the seeded "open" critical ticket
    const startBtn = screen.getByRole("button", {
      name: /advance ticket tkt-1041/i,
    });
    expect(startBtn).toHaveTextContent(/start/i);
    await user.click(startBtn);

    const resolveBtn = screen.getByRole("button", {
      name: /advance ticket tkt-1041/i,
    });
    expect(resolveBtn).toHaveTextContent(/resolve/i);
    await user.click(resolveBtn);

    // After resolved, the action cell renders an em-dash placeholder, no button.
    expect(
      screen.queryByRole("button", { name: /advance ticket tkt-1041/i }),
    ).toBeNull();
  });

  test("status filter narrows the list to matching tickets", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TicketingDemo />);

    // Pick "Resolved" — only TKT-1039 is seeded resolved
    await pickFromSelect(user, /filter status/i, /^resolved$/i);

    const list = screen.getByRole("table", { name: /ticket list/i });
    expect(within(list).getByText("TKT-1039")).toBeInTheDocument();
    expect(within(list).queryByText("TKT-1040")).toBeNull();
    expect(within(list).queryByText("TKT-1041")).toBeNull();
    expect(within(list).queryByText("TKT-1042")).toBeNull();
  });

  test("priority filter narrows the list to matching tickets", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TicketingDemo />);

    // Pick "Critical" — only TKT-1041 is critical
    await pickFromSelect(user, /filter priority/i, /^critical$/i);

    const list = screen.getByRole("table", { name: /ticket list/i });
    expect(within(list).getByText("TKT-1041")).toBeInTheDocument();
    expect(within(list).queryByText("TKT-1039")).toBeNull();
    expect(within(list).queryByText("TKT-1040")).toBeNull();
    expect(within(list).queryByText("TKT-1042")).toBeNull();
  });

  test("filters can be combined and 'no tickets' message appears when none match", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TicketingDemo />);

    // Critical AND Resolved — no seed ticket matches both
    await pickFromSelect(user, /filter priority/i, /^critical$/i);
    await pickFromSelect(user, /filter status/i, /^resolved$/i);

    expect(
      screen.getByText(/no tickets match the current filter/i),
    ).toBeInTheDocument();
  });

  test("reset clears filters, restores seed tickets and discards added ones", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TicketingDemo />);

    await user.type(screen.getByLabelText("Title"), "Temporary issue");
    await user.type(screen.getByLabelText("Requester"), "Test User");
    await user.click(screen.getByRole("button", { name: /create ticket/i }));
    expect(screen.getByText("TKT-1043")).toBeInTheDocument();

    await pickFromSelect(user, /filter status/i, /^resolved$/i);

    await user.click(screen.getByRole("button", { name: /reset demo/i }));

    // TKT-1043 is gone, all 4 seeds back
    const list = screen.getByRole("table", { name: /ticket list/i });
    expect(within(list).queryByText("TKT-1043")).toBeNull();
    expect(within(list).getByText("TKT-1039")).toBeInTheDocument();
    expect(within(list).getByText("TKT-1040")).toBeInTheDocument();
    expect(within(list).getByText("TKT-1041")).toBeInTheDocument();
    expect(within(list).getByText("TKT-1042")).toBeInTheDocument();
  });

  test("SLA cell shows 'Closed' for resolved and 'Overdue' for past-deadline tickets", () => {
    render(<TicketingDemo />);

    const list = screen.getByRole("table", { name: /ticket list/i });

    // TKT-1039 is seeded resolved → "Closed"
    const closedRow = within(list).getByText("TKT-1039").closest("tr")!;
    expect(within(closedRow).getByLabelText(/sla closed/i)).toBeInTheDocument();

    // TKT-1041 is open, critical (1h SLA), createdAt = now - 25min → still
    // on-track at render. Advance system time + a tick of the demo's interval
    // to make it overdue, then re-query.
    act(() => {
      vi.setSystemTime(FIXED_NOW + 1000 * 60 * 90);
      vi.advanceTimersByTime(1100);
    });

    const overdueRow = within(list).getByText("TKT-1041").closest("tr")!;
    expect(
      within(overdueRow).getByLabelText(/sla overdue/i),
    ).toBeInTheDocument();
  });
});
