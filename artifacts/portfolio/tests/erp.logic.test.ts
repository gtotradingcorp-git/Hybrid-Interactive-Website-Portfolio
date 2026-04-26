import { test } from "vitest";
import assert from "node:assert/strict";
import {
  type InvoiceLine,
  type Product,
  SEED_PRODUCTS,
  VAT_RATE,
  addInvoiceLine,
  addProduct,
  adjustStock,
  computeTotals,
  getSeedInvoiceLines,
  getSeedProducts,
  removeInvoiceLine,
} from "@/components/demos/erp.logic";

test("getSeedProducts returns clones (mutating result does not affect SEED)", () => {
  const a = getSeedProducts();
  const b = getSeedProducts();
  assert.notEqual(a, b);
  a[0].stock = 999;
  assert.notEqual(SEED_PRODUCTS[0].stock, 999);
});

test("adjustStock increases stock by positive delta", () => {
  const products = getSeedProducts();
  const result = adjustStock(products, "BAS-100", 3);
  const original = products.find((p) => p.sku === "BAS-100")!.stock;
  assert.equal(result.find((p) => p.sku === "BAS-100")!.stock, original + 3);
});

test("adjustStock decreases stock by negative delta", () => {
  const products = getSeedProducts();
  const original = products.find((p) => p.sku === "JER-220")!.stock;
  const result = adjustStock(products, "JER-220", -5);
  assert.equal(result.find((p) => p.sku === "JER-220")!.stock, original - 5);
});

test("adjustStock clamps stock at zero (cannot go negative)", () => {
  const products: Product[] = [{ sku: "X", name: "x", price: 10, stock: 2 }];
  const result = adjustStock(products, "X", -5);
  assert.equal(result[0].stock, 0);
});

test("adjustStock does not mutate the input array or items", () => {
  const products = getSeedProducts();
  const before = products.map((p) => p.stock);
  const result = adjustStock(products, "BAS-100", 1);
  assert.deepEqual(
    products.map((p) => p.stock),
    before,
  );
  // Also check the modified item is a new object reference
  const original = products.find((p) => p.sku === "BAS-100")!;
  const modified = result.find((p) => p.sku === "BAS-100")!;
  assert.notEqual(original, modified);
});

test("adjustStock returns unchanged products for unknown SKU", () => {
  const products = getSeedProducts();
  const result = adjustStock(products, "DOES-NOT-EXIST", 5);
  assert.deepEqual(
    result.map((p) => p.stock),
    products.map((p) => p.stock),
  );
});

test("addProduct adds a new product (uppercased SKU, trimmed name)", () => {
  const products = getSeedProducts();
  const result = addProduct(products, {
    sku: " new-99 ",
    name: "  Sample  ",
    price: "99.50",
    stock: "10",
  });
  assert.ok(result.added);
  assert.equal(result.added!.sku, "NEW-99");
  assert.equal(result.added!.name, "Sample");
  assert.equal(result.added!.price, 99.5);
  assert.equal(result.added!.stock, 10);
  assert.equal(result.products.length, products.length + 1);
});

test("addProduct rejects duplicate SKUs", () => {
  const products = getSeedProducts();
  const result = addProduct(products, {
    sku: "bas-100",
    name: "Dup",
    price: "1",
    stock: "1",
  });
  assert.equal(result.added, null);
  assert.equal(result.products, products);
});

test("addProduct rejects invalid price/stock or empty fields", () => {
  const products = getSeedProducts();
  assert.equal(
    addProduct(products, { sku: "", name: "x", price: "1", stock: "1" }).added,
    null,
  );
  assert.equal(
    addProduct(products, { sku: "X", name: "", price: "1", stock: "1" }).added,
    null,
  );
  assert.equal(
    addProduct(products, { sku: "X", name: "x", price: "abc", stock: "1" })
      .added,
    null,
  );
  assert.equal(
    addProduct(products, { sku: "X", name: "x", price: "1", stock: "abc" })
      .added,
    null,
  );
});

test("addInvoiceLine adds a new line when SKU is not present", () => {
  const lines: InvoiceLine[] = [{ sku: "BAS-100", qty: 2 }];
  const result = addInvoiceLine(lines, "JER-220", 3);
  assert.equal(result.length, 2);
  assert.deepEqual(result[1], { sku: "JER-220", qty: 3 });
});

test("addInvoiceLine increments qty when SKU already exists", () => {
  const lines: InvoiceLine[] = [{ sku: "BAS-100", qty: 2 }];
  const result = addInvoiceLine(lines, "BAS-100", 5);
  assert.equal(result.length, 1);
  assert.equal(result[0].qty, 7);
});

test("addInvoiceLine ignores invalid quantity (zero, negative, NaN)", () => {
  const lines: InvoiceLine[] = [{ sku: "BAS-100", qty: 2 }];
  assert.equal(addInvoiceLine(lines, "BAS-100", 0), lines);
  assert.equal(addInvoiceLine(lines, "BAS-100", -1), lines);
  assert.equal(addInvoiceLine(lines, "BAS-100", Number.NaN), lines);
  assert.equal(addInvoiceLine(lines, "", 1), lines);
});

test("removeInvoiceLine removes the matching SKU and keeps the rest", () => {
  const lines: InvoiceLine[] = [
    { sku: "A", qty: 1 },
    { sku: "B", qty: 2 },
    { sku: "C", qty: 3 },
  ];
  const result = removeInvoiceLine(lines, "B");
  assert.deepEqual(result, [
    { sku: "A", qty: 1 },
    { sku: "C", qty: 3 },
  ]);
});

test("removeInvoiceLine is a no-op for unknown SKU", () => {
  const lines: InvoiceLine[] = [{ sku: "A", qty: 1 }];
  assert.deepEqual(removeInvoiceLine(lines, "missing"), lines);
});

test("computeTotals: subtotal, VAT, and total for the seed invoice", () => {
  const products = getSeedProducts();
  const lines = getSeedInvoiceLines(); // BAS-100 x2 + JER-220 x5
  const totals = computeTotals(lines, products);
  // 1490 * 2 = 2980; 890 * 5 = 4450; subtotal = 7430
  const expectedSubtotal = 1490 * 2 + 890 * 5;
  assert.equal(totals.subtotal, expectedSubtotal);
  assert.equal(totals.vat, expectedSubtotal * VAT_RATE);
  assert.equal(totals.total, expectedSubtotal * (1 + VAT_RATE));
  assert.equal(totals.items.length, 2);
  assert.equal(totals.items[0].lineTotal, 1490 * 2);
  assert.equal(totals.items[1].lineTotal, 890 * 5);
});

test("computeTotals: empty lines yield zeroed totals", () => {
  const totals = computeTotals([], getSeedProducts());
  assert.deepEqual(totals.items, []);
  assert.equal(totals.subtotal, 0);
  assert.equal(totals.vat, 0);
  assert.equal(totals.total, 0);
});

test("computeTotals: VAT is 12% of subtotal", () => {
  const products: Product[] = [{ sku: "X", name: "X", price: 100, stock: 0 }];
  const totals = computeTotals([{ sku: "X", qty: 1 }], products);
  assert.equal(totals.subtotal, 100);
  assert.equal(totals.vat, 12);
  assert.equal(totals.total, 112);
});

test("computeTotals: missing product makes the line zero but keeps the entry", () => {
  const totals = computeTotals(
    [{ sku: "GHOST", qty: 5 }],
    [{ sku: "X", name: "X", price: 100, stock: 0 }],
  );
  assert.equal(totals.subtotal, 0);
  assert.equal(totals.items.length, 1);
  assert.equal(totals.items[0].product, undefined);
  assert.equal(totals.items[0].lineTotal, 0);
});
