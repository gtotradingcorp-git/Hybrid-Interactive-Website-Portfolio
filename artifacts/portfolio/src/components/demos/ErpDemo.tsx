import React, { useMemo, useState } from "react";
import { Plus, Minus, FileText, RotateCcw, Trash2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trackDemoEvent, trackFirstInteraction } from "@/lib/demoTelemetry";
import { usePersistentDemoState } from "./usePersistentDemoState";
import { RestoredBanner } from "./RestoredBanner";
import {
  type InvoiceLine,
  type Product,
  INITIAL_INVOICE_COUNTER,
  SEED_PRODUCTS,
  addInvoiceLine,
  addProduct,
  adjustStock,
  computeTotals,
  getSeedInvoiceLines,
  getSeedProducts,
  removeInvoiceLine,
  SEED_CUSTOMER,
} from "./erp.logic";

const PESO = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export default function ErpDemo() {
  const [products, setProducts, resetProducts, { restoredAt }] = usePersistentDemoState<Product[]>(
    "erp-products",
    1,
    () => getSeedProducts(),
  );
  const [invoiceLines, setInvoiceLines, resetInvoiceLines] = usePersistentDemoState<InvoiceLine[]>(
    "erp-invoice-lines",
    1,
    () => getSeedInvoiceLines(),
  );
  const [customer, setCustomer, resetCustomer] = usePersistentDemoState<string>(
    "erp-customer",
    1,
    SEED_CUSTOMER,
  );
  const [invoiceCounter, setInvoiceCounter, resetInvoiceCounter] = usePersistentDemoState<number>(
    "erp-invoice-counter",
    1,
    INITIAL_INVOICE_COUNTER,
  );

  // Add product form
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newStock, setNewStock] = useState("");

  // Add line form
  const [lineSku, setLineSku] = useState<string>(SEED_PRODUCTS[0].sku);
  const [lineQty, setLineQty] = useState<string>("1");

  const handleAdjustStock = (sku: string, delta: number) => {
    setProducts((prev) => adjustStock(prev, sku, delta));
    trackFirstInteraction("erp");
    trackDemoEvent("erp", "stock_adjusted");
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const result = addProduct(products, {
      sku: newSku,
      name: newName,
      price: newPrice,
      stock: newStock,
    });
    if (!result.added) return;
    setProducts(result.products);
    setNewSku("");
    setNewName("");
    setNewPrice("");
    setNewStock("");
  };

  const handleAddLine = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(lineQty, 10);
    setInvoiceLines((prev) => addInvoiceLine(prev, lineSku, qty));
    setLineQty("1");
  };

  const handleRemoveLine = (sku: string) => {
    setInvoiceLines((prev) => removeInvoiceLine(prev, sku));
  };

  const totals = useMemo(
    () => computeTotals(invoiceLines, products),
    [invoiceLines, products],
  );

  const handleGenerateInvoice = () => {
    if (totals.items.length === 0) return;
    trackFirstInteraction("erp");
    trackDemoEvent("erp", "invoice_generated");
    const invoiceNo = `INV-${invoiceCounter}`;
    setInvoiceCounter((c) => c + 1);
    const dateStr = new Date().toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const rows = totals.items
      .map((it) => {
        if (!it.product) return "";
        return `
          <tr>
            <td>${escapeHtml(it.product.sku)}</td>
            <td>${escapeHtml(it.product.name)}</td>
            <td style="text-align:right">${it.qty}</td>
            <td style="text-align:right">${PESO(it.product.price)}</td>
            <td style="text-align:right">${PESO(it.lineTotal)}</td>
          </tr>`;
      })
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoiceNo)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .muted { color: #666; font-size: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #ddd; padding: 8px; font-size: 13px; }
    th { text-align: left; background: #f5f5f5; }
    .totals { margin-top: 16px; width: 280px; margin-left: auto; font-size: 13px; }
    .totals .row { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { border-top: 2px solid #111; padding-top: 8px; margin-top: 4px; font-weight: 700; font-size: 15px; }
    .footer { margin-top: 32px; font-size: 11px; color: #888; text-align: center; }
    @media print { .no-print { display: none; } }
    .actions { margin-top: 24px; text-align: center; }
    button { padding: 8px 16px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Juan-ERP Demo Invoice</h1>
      <div class="muted">Generated by the live demo on the portfolio site</div>
    </div>
    <div style="text-align:right">
      <div><strong>${escapeHtml(invoiceNo)}</strong></div>
      <div class="muted">${escapeHtml(dateStr)}</div>
    </div>
  </div>
  <div>
    <div class="muted">Bill To</div>
    <div><strong>${escapeHtml(customer || "Walk-in customer")}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>SKU</th><th>Description</th><th style="text-align:right">Qty</th>
        <th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${PESO(totals.subtotal)}</span></div>
    <div class="row"><span>VAT (12%)</span><span>${PESO(totals.vat)}</span></div>
    <div class="row grand"><span>Total Due</span><span>${PESO(totals.total)}</span></div>
  </div>
  <div class="footer">
    This is a sample invoice generated by an in-browser demo. No real transaction has occurred.
  </div>
  <div class="actions no-print">
    <button onclick="window.print()">Save as PDF / Print</button>
  </div>
  <script>setTimeout(function(){ try { window.print(); } catch(e){} }, 300);</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) {
      alert("Please allow pop-ups to download the invoice as a PDF.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const handleReset = () => {
    // resetX() removes the persisted key AND restores the seed via the
    // hook's internal skipNextPersist flag, so we don't call setX(seed)
    // afterwards (that would re-persist the seed values).
    resetProducts();
    resetInvoiceLines();
    resetCustomer();
    resetInvoiceCounter();
    trackDemoEvent("erp", "reset");
    setNewSku("");
    setNewName("");
    setNewPrice("");
    setNewStock("");
    setLineSku(SEED_PRODUCTS[0].sku);
    setLineQty("1");
  };

  return (
    <div className="space-y-6">
      <RestoredBanner restoredAt={restoredAt} onStartFresh={handleReset} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory */}
        <section
          aria-labelledby="erp-inventory-heading"
          className="rounded-lg border border-border/40 bg-background/40 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 id="erp-inventory-heading" className="text-sm font-semibold text-foreground">
              Inventory
            </h4>
            <span className="text-xs text-muted-foreground font-mono">
              {products.length} SKUs
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border border-border/40">
            <table className="w-full text-sm" aria-label="Inventory list">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="text-left px-3 py-2">SKU</th>
                  <th scope="col" className="text-left px-3 py-2">Name</th>
                  <th scope="col" className="text-right px-3 py-2">Price</th>
                  <th scope="col" className="text-right px-3 py-2">Stock</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.sku} className="border-t border-border/30">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.sku}</td>
                    <td className="px-3 py-2 text-foreground">{p.name}</td>
                    <td className="px-3 py-2 text-right text-foreground">{PESO(p.price)}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        p.stock === 0 ? "text-red-400" : p.stock < 10 ? "text-yellow-400" : "text-foreground"
                      }`}
                    >
                      {p.stock}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => handleAdjustStock(p.sku, -1)}
                          aria-label={`Decrease stock for ${p.name}`}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => handleAdjustStock(p.sku, 1)}
                          aria-label={`Increase stock for ${p.name}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleAddProduct} className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <Input
              aria-label="New product SKU"
              placeholder="SKU"
              value={newSku}
              onChange={(e) => setNewSku(e.target.value)}
              className="text-sm"
            />
            <Input
              aria-label="New product name"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-sm"
            />
            <Input
              aria-label="New product price"
              placeholder="Price"
              type="number"
              min="0"
              step="0.01"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Input
                aria-label="New product stock"
                placeholder="Stock"
                type="number"
                min="0"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                className="text-sm"
              />
              <Button type="submit" size="sm" variant="outline" aria-label="Add product">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </section>

        {/* Invoice builder */}
        <section
          aria-labelledby="erp-invoice-heading"
          className="rounded-lg border border-border/40 bg-background/40 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 id="erp-invoice-heading" className="text-sm font-semibold text-foreground">
              Invoice
            </h4>
            <span className="text-xs text-muted-foreground font-mono">VAT 12%</span>
          </div>

          <div>
            <Label htmlFor="erp-customer" className="text-xs">Bill To</Label>
            <Input
              id="erp-customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Customer name"
            />
          </div>

          <form onSubmit={handleAddLine} className="grid grid-cols-[1fr_80px_auto] gap-2">
            <div>
              <Label htmlFor="erp-line-sku" className="text-xs">Add line</Label>
              <Select value={lineSku} onValueChange={setLineSku}>
                <SelectTrigger id="erp-line-sku">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.sku} value={p.sku}>
                      {p.sku} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="erp-line-qty" className="text-xs">Qty</Label>
              <Input
                id="erp-line-qty"
                type="number"
                min="1"
                value={lineQty}
                onChange={(e) => setLineQty(e.target.value)}
              />
            </div>
            <div className="self-end">
              <Button type="submit" size="sm" variant="outline" aria-label="Add invoice line">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-md border border-border/40">
            <table className="w-full text-sm" aria-label="Invoice lines">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="text-left px-3 py-2">Item</th>
                  <th scope="col" className="text-right px-3 py-2">Qty</th>
                  <th scope="col" className="text-right px-3 py-2">Total</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {totals.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                      Add a line to start an invoice.
                    </td>
                  </tr>
                )}
                {totals.items.map((it) =>
                  it.product ? (
                    <tr key={it.sku} className="border-t border-border/30">
                      <td className="px-3 py-2 text-foreground">
                        <div>{it.product.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{it.product.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-right">{it.qty}</td>
                      <td className="px-3 py-2 text-right">{PESO(it.lineTotal)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-red-400"
                          onClick={() => handleRemoveLine(it.sku)}
                          aria-label={`Remove ${it.product.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{PESO(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>VAT (12%)</span>
              <span>{PESO(totals.vat)}</span>
            </div>
            <div className="flex justify-between text-foreground font-semibold border-t border-border/40 pt-2">
              <span>Total Due</span>
              <span>{PESO(totals.total)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={handleGenerateInvoice}
              disabled={totals.items.length === 0}
            >
              <FileText className="h-4 w-4 mr-1" aria-hidden="true" /> Generate invoice
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleGenerateInvoice}
              disabled={totals.items.length === 0}
              aria-label="Print or save invoice as PDF"
            >
              <Printer className="h-4 w-4 mr-1" aria-hidden="true" /> Save as PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleReset}
              className="ml-auto"
            >
              <RotateCcw className="h-4 w-4 mr-1" aria-hidden="true" /> Reset demo
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
