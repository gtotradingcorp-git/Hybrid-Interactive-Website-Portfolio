import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErpDemo from "@/components/demos/ErpDemo";
import { SEED_PRODUCTS } from "@/components/demos/erp.logic";

beforeEach(() => {
  localStorage.clear();
});

function rx(text: string, flags = "i"): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, flags);
}

// Helper: locate the inventory row for a given SKU.
function inventoryRowFor(sku: string): HTMLTableRowElement {
  const inventory = screen.getByRole("table", { name: /inventory list/i });
  const cell = within(inventory).getByText(sku);
  return cell.closest("tr") as HTMLTableRowElement;
}

function invoiceTable(): HTMLElement {
  return screen.getByRole("table", { name: /invoice lines/i });
}

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

describe("ErpDemo (component)", () => {
  test("renders the seed inventory and the seed invoice with totals", () => {
    render(<ErpDemo />);

    // All seed SKUs render in the inventory
    for (const p of SEED_PRODUCTS) {
      const row = inventoryRowFor(p.sku);
      expect(within(row).getByText(p.name)).toBeInTheDocument();
      expect(within(row).getByText(String(p.stock))).toBeInTheDocument();
    }

    // SKU count badge reflects the seed length
    expect(screen.getByText(`${SEED_PRODUCTS.length} SKUs`)).toBeInTheDocument();

    // Subtotal / VAT / Total are rendered (value labels are formatted as PHP).
    expect(screen.getByText(/^Subtotal$/i)).toBeInTheDocument();
    expect(screen.getByText(/^VAT \(12%\)$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Total Due$/i)).toBeInTheDocument();
  });

  test("stock + and − buttons adjust the displayed stock", async () => {
    const user = userEvent.setup();
    render(<ErpDemo />);

    const firstSku = SEED_PRODUCTS[0];
    const initialStock = firstSku.stock;
    let row = inventoryRowFor(firstSku.sku);
    expect(within(row).getByText(String(initialStock))).toBeInTheDocument();

    // Increase by one
    await user.click(
      within(row).getByRole("button", {
        name: rx(`increase stock for ${firstSku.name}`),
      }),
    );
    row = inventoryRowFor(firstSku.sku);
    expect(within(row).getByText(String(initialStock + 1))).toBeInTheDocument();

    // Decrease back
    await user.click(
      within(row).getByRole("button", {
        name: rx(`decrease stock for ${firstSku.name}`),
      }),
    );
    row = inventoryRowFor(firstSku.sku);
    expect(within(row).getByText(String(initialStock))).toBeInTheDocument();
  });

  test("stock decrement clamps at zero (cannot go negative)", async () => {
    const user = userEvent.setup();
    render(<ErpDemo />);

    const sku = SEED_PRODUCTS[0];
    const decBtn = within(inventoryRowFor(sku.sku)).getByRole("button", {
      name: rx(`decrease stock for ${sku.name}`),
    });

    for (let i = 0; i < sku.stock + 5; i += 1) {
      await user.click(decBtn);
    }

    const row = inventoryRowFor(sku.sku);
    expect(within(row).getByText("0")).toBeInTheDocument();
  });

  test("adding an invoice line and removing it updates the line table", async () => {
    const user = userEvent.setup();
    render(<ErpDemo />);

    // SHO-340 is not part of the seed invoice lines.
    const target = SEED_PRODUCTS[2];
    expect(within(invoiceTable()).queryByText(target.sku)).toBeNull();

    // Match the option by its SKU prefix only (avoid escaping product-name parens).
    await pickFromSelect(user, /add line/i, rx(target.sku));

    const qty = screen.getByLabelText("Qty") as HTMLInputElement;
    await user.clear(qty);
    await user.type(qty, "3");
    await user.click(screen.getByRole("button", { name: /add invoice line/i }));

    expect(within(invoiceTable()).getByText(target.sku)).toBeInTheDocument();

    // Remove via the trash icon
    await user.click(
      within(invoiceTable()).getByRole("button", {
        name: rx(`remove ${target.name}`),
      }),
    );
    expect(within(invoiceTable()).queryByText(target.sku)).toBeNull();
  });

  test("subtotal, VAT 12% and total reflect the current invoice lines", async () => {
    const user = userEvent.setup();
    render(<ErpDemo />);

    const fmt = (n: number) =>
      new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(n);

    // Remove the two seed lines so we start from a known-empty invoice.
    for (const seed of [SEED_PRODUCTS[0], SEED_PRODUCTS[1]]) {
      const removeBtn = within(invoiceTable()).queryByRole("button", {
        name: rx(`remove ${seed.name}`),
      });
      if (removeBtn) await user.click(removeBtn);
    }
    expect(
      within(invoiceTable()).getByText(/add a line to start an invoice/i),
    ).toBeInTheDocument();

    // Now add 5 x SHO-340 (price 3450)
    const target = SEED_PRODUCTS[2];
    await pickFromSelect(user, /add line/i, rx(target.sku));
    const qty = screen.getByLabelText("Qty") as HTMLInputElement;
    await user.clear(qty);
    await user.type(qty, "5");
    await user.click(screen.getByRole("button", { name: /add invoice line/i }));

    const subtotal = target.price * 5; // 17,250
    const vat = subtotal * 0.12; //  2,070
    const total = subtotal + vat; // 19,320

    const subtotalRow = screen.getByText(/^Subtotal$/i).parentElement!;
    expect(subtotalRow).toHaveTextContent(fmt(subtotal));

    const vatRow = screen.getByText(/^VAT \(12%\)$/i).parentElement!;
    expect(vatRow).toHaveTextContent(fmt(vat));

    const totalRow = screen.getByText(/^Total Due$/i).parentElement!;
    expect(totalRow).toHaveTextContent(fmt(total));
  });

  test("reset restores seed inventory and seed invoice lines", async () => {
    const user = userEvent.setup();
    render(<ErpDemo />);

    const sku = SEED_PRODUCTS[0];

    // Mutate stock and add a different line.
    const incBtn = within(inventoryRowFor(sku.sku)).getByRole("button", {
      name: rx(`increase stock for ${sku.name}`),
    });
    await user.click(incBtn);
    await user.click(incBtn);

    const target = SEED_PRODUCTS[3];
    await pickFromSelect(user, /add line/i, rx(target.sku));
    await user.click(screen.getByRole("button", { name: /add invoice line/i }));

    // Reset
    await user.click(screen.getByRole("button", { name: /reset demo/i }));

    // Inventory stock back to seed value
    const row = inventoryRowFor(sku.sku);
    expect(within(row).getByText(String(sku.stock))).toBeInTheDocument();

    // Invoice has only the seed lines (the added SKU is not a seed line)
    expect(within(invoiceTable()).queryByText(target.sku)).toBeNull();
  });
});
