export interface Product {
  sku: string;
  name: string;
  price: number;
  stock: number;
}

export interface InvoiceLine {
  sku: string;
  qty: number;
}

export interface InvoiceItem extends InvoiceLine {
  product: Product | undefined;
  lineTotal: number;
}

export interface InvoiceTotals {
  items: InvoiceItem[];
  subtotal: number;
  vat: number;
  total: number;
}

export const VAT_RATE = 0.12;

export const INITIAL_INVOICE_COUNTER = 2079;

export const SEED_PRODUCTS: Product[] = [
  { sku: "BAS-100", name: "Basketball — Pro Series", price: 1490, stock: 42 },
  { sku: "JER-220", name: "Team Jersey (M)", price: 890, stock: 18 },
  { sku: "SHO-340", name: "Court Shoes (Size 9)", price: 3450, stock: 7 },
  { sku: "BAG-410", name: "Equipment Duffel Bag", price: 1190, stock: 25 },
  { sku: "WAT-520", name: "Insulated Water Bottle", price: 350, stock: 60 },
];

export const SEED_INVOICE_LINES: InvoiceLine[] = [
  { sku: "BAS-100", qty: 2 },
  { sku: "JER-220", qty: 5 },
];

export const SEED_CUSTOMER = "Quezon City Sports League";

export function getSeedProducts(): Product[] {
  return SEED_PRODUCTS.map((p) => ({ ...p }));
}

export function getSeedInvoiceLines(): InvoiceLine[] {
  return SEED_INVOICE_LINES.map((l) => ({ ...l }));
}

export function adjustStock(
  products: Product[],
  sku: string,
  delta: number,
): Product[] {
  return products.map((p) =>
    p.sku === sku ? { ...p, stock: Math.max(0, p.stock + delta) } : p,
  );
}

export interface NewProductInput {
  sku: string;
  name: string;
  price: string;
  stock: string;
}

export function addProduct(
  products: Product[],
  input: NewProductInput,
): { products: Product[]; added: Product | null } {
  const sku = input.sku.trim().toUpperCase();
  const name = input.name.trim();
  const price = parseFloat(input.price);
  const stock = parseInt(input.stock, 10);
  if (!sku || !name || !Number.isFinite(price) || !Number.isFinite(stock)) {
    return { products, added: null };
  }
  if (products.some((p) => p.sku === sku)) {
    return { products, added: null };
  }
  const added: Product = { sku, name, price, stock };
  return { products: [...products, added], added };
}

export function addInvoiceLine(
  lines: InvoiceLine[],
  sku: string,
  qty: number,
): InvoiceLine[] {
  if (!sku || !Number.isFinite(qty) || qty <= 0) return lines;
  const existing = lines.find((l) => l.sku === sku);
  if (existing) {
    return lines.map((l) => (l.sku === sku ? { ...l, qty: l.qty + qty } : l));
  }
  return [...lines, { sku, qty }];
}

export function removeInvoiceLine(
  lines: InvoiceLine[],
  sku: string,
): InvoiceLine[] {
  return lines.filter((l) => l.sku !== sku);
}

export function computeTotals(
  lines: InvoiceLine[],
  products: Product[],
): InvoiceTotals {
  let subtotal = 0;
  const items: InvoiceItem[] = lines.map((l) => {
    const product = products.find((p) => p.sku === l.sku);
    const lineTotal = product ? product.price * l.qty : 0;
    subtotal += lineTotal;
    return { ...l, product, lineTotal };
  });
  const vat = subtotal * VAT_RATE;
  const total = subtotal + vat;
  return { items, subtotal, vat, total };
}
