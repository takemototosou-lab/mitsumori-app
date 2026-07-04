export const DEFAULT_TAX_RATE = 0.1;
export const DEFAULT_QUOTE_PREFIX = "TKM";

export const QUOTE_STATUS = {
  draft: "作成中",
  submitted: "提出済",
  ordered: "受注",
  lost: "失注",
  canceled: "取消",
};

export function toNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function calculateLineAmount(item) {
  const quantity = toNumber(item?.quantity);
  const unitPrice = toNumber(item?.unitPrice);
  if (quantity === null || unitPrice === null) {
    return null;
  }
  return Math.round(quantity * unitPrice);
}

export function calculateTotals({ items = [], discount = 0, roundingAdjustment = 0, taxRate = DEFAULT_TAX_RATE } = {}) {
  const subtotalBeforeDiscount = items.reduce((sum, item) => {
    const amount = calculateLineAmount(item);
    return sum + (amount ?? 0);
  }, 0);
  const normalizedDiscount = Math.max(0, Math.round(toNumber(discount) ?? 0));
  const taxableSubtotal = Math.max(0, subtotalBeforeDiscount - normalizedDiscount);
  const tax = Math.floor(taxableSubtotal * taxRate);
  const normalizedRounding = Math.max(0, Math.round(toNumber(roundingAdjustment) ?? 0));
  const totalWithTax = Math.max(0, taxableSubtotal + tax - normalizedRounding);

  return {
    subtotalBeforeDiscount,
    discount: normalizedDiscount,
    taxableSubtotal,
    tax,
    roundingAdjustment: normalizedRounding,
    totalWithTax,
  };
}

export function calculateRoundingAdjustmentForDesiredTotal({
  items = [],
  discount = 0,
  desiredTotalWithTax = "",
  taxRate = DEFAULT_TAX_RATE,
} = {}) {
  const desired = toNumber(desiredTotalWithTax);
  if (desired === null) {
    return null;
  }
  const totalBeforeRounding = calculateTotals({ items, discount, roundingAdjustment: 0, taxRate }).totalWithTax;
  return Math.max(0, totalBeforeRounding - Math.max(0, Math.round(desired)));
}

export function formatDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDefaultContactTitle(type) {
  return type === "person" ? "様" : "御中";
}

export function createBlankContact(type = "company") {
  return {
    id: createId("contact"),
    type,
    name: "",
    title: getDefaultContactTitle(type),
    contactPerson: "",
    postalCode: "",
    address: "",
    phone: "",
    note: "",
  };
}

export function getDefaultCompany() {
  return {
    name: "竹本塗装店",
    representative: "",
    postalCode: "000-0000",
    address: "大阪府大阪市サンプル町1-2-3",
    phone: "06-0000-0000",
    email: "info@example.com",
    registrationNumber: "T0000000000000",
    bankAccount: "",
    defaultExpiryDays: 30,
    quotePrefix: DEFAULT_QUOTE_PREFIX,
  };
}

export function getDefaultCompanyAssets() {
  return {
    logoImage: "",
    sealImage: "",
  };
}

export function normalizeQuotePrefix(prefix) {
  const normalized = String(prefix || DEFAULT_QUOTE_PREFIX)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  return normalized || DEFAULT_QUOTE_PREFIX;
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + Number(days || 0));
  return result;
}

export function generateNextQuoteNumber(quotes = [], date = new Date(), prefix = DEFAULT_QUOTE_PREFIX) {
  const year = date.getFullYear();
  const normalizedPrefix = `${normalizeQuotePrefix(prefix)}-${year}-`;
  const max = quotes.reduce((currentMax, quote) => {
    const quoteNumber = quote?.quoteNumber || "";
    const match = quoteNumber.match(new RegExp(`^${escapeRegExp(normalizedPrefix)}(\\d{3})(?:-R\\d+)?$`));
    if (!match || quoteNumber.includes("-R")) {
      return currentMax;
    }
    return Math.max(currentMax, Number(match[1]));
  }, 0);
  return `${normalizedPrefix}${String(max + 1).padStart(3, "0")}`;
}

export function createRevisionNumber(baseQuoteNumber, quotes = []) {
  const base = String(baseQuoteNumber || "").replace(/-R\d+$/, "");
  const revision = quotes.reduce((currentMax, quote) => {
    const match = String(quote?.quoteNumber || "").match(new RegExp(`^${escapeRegExp(base)}-R(\\d+)$`));
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `${base}-R${revision + 1}`;
}

export function duplicateQuote(quote, nextQuoteNumber, today = formatDateInput()) {
  return {
    ...structuredClone(quote),
    id: createId("quote"),
    parentQuoteNumber: quote?.quoteNumber || "",
    quoteNumber: nextQuoteNumber,
    issueDate: today,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "draft",
    discount: 0,
    roundingAdjustment: 0,
  };
}

export function createRevisionQuote(quote, revisionQuoteNumber, today = formatDateInput()) {
  return {
    ...structuredClone(quote),
    id: createId("quote"),
    parentQuoteNumber: quote?.quoteNumber || "",
    quoteNumber: revisionQuoteNumber,
    issueDate: today,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "draft",
  };
}

export function createBlankQuote(nextQuoteNumber, today = formatDateInput()) {
  return {
    id: createId("quote"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    quoteNumber: nextQuoteNumber,
    status: "draft",
    recipientType: "company",
    recipientId: "",
    recipientName: "",
    recipientTitle: "御中",
    contactPerson: "",
    postalCode: "",
    address: "",
    phone: "",
    subject: "",
    siteName: "",
    constructionPeriod: "",
    issueDate: today,
    expiryDate: "",
    note: "",
    paymentTerms: "工事完了後、請求書発行月の翌月末までにお支払いください。",
    specialNotes: "",
    discount: 0,
    roundingAdjustment: 0,
    desiredTotalWithTax: "",
    items: Array.from({ length: 5 }, () => createBlankItem()),
  };
}

export function createBlankItem() {
  return {
    id: createId("item"),
    workItem: "",
    description: "",
    quantity: "",
    unit: "式",
    unitPrice: "",
  };
}

export function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
