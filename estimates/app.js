import {
  QUOTE_STATUS,
  calculateLineAmount,
  calculateRoundingAdjustmentForDesiredTotal,
  calculateTotals,
  createBlankItem,
  createBlankContact,
  createBlankQuote,
  createId,
  createRevisionQuote as buildRevisionQuote,
  createRevisionNumber,
  addDays,
  duplicateQuote,
  formatDateInput,
  generateNextQuoteNumber,
  getDefaultCompany,
  getDefaultCompanyAssets,
  getDefaultContactTitle,
  normalizeQuotePrefix,
} from "./quote-core.js";
import {
  buildBackup,
  createBackupFileName,
  parseBackupJson,
  restoreBackupData,
  summarizeBackup,
} from "./quote-backup.js";

const STORAGE_KEY = "takemoto-estimates:v1";
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const UNIT_OPTIONS = ["式", "㎡", "m", "箇所", "日", "人工", "台", "本", "枚", "缶", "袋"];

const defaultState = {
  contacts: [
    {
      id: "contact-sample-company",
      type: "company",
      name: "株式会社サンプル建設",
      title: "御中",
      contactPerson: "山田 太郎",
      postalCode: "000-0000",
      address: "大阪府大阪市中央区サンプル1-2-3",
      phone: "06-0000-0000",
      note: "会社宛サンプル",
    },
    {
      id: "contact-sample-person",
      type: "person",
      name: "佐藤 花子",
      title: "様",
      contactPerson: "",
      postalCode: "000-0000",
      address: "大阪府堺市サンプル4-5-6",
      phone: "072-000-0000",
      note: "個人宛サンプル",
    },
  ],
  company: getDefaultCompany(),
  companyAssets: getDefaultCompanyAssets(),
  quotes: [],
};

let state = loadState();
let currentQuote = createBlankQuote(generateNextQuoteNumber(state.quotes, new Date(), state.company.quotePrefix));
let lastSavedFolderPath = "";
currentQuote.expiryDate = formatDateInput(addDays(new Date(`${currentQuote.issueDate}T00:00:00`), state.company.defaultExpiryDays));

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  renderAll();
});

function bindElements() {
  [
    "navNew",
    "navContacts",
    "navHistory",
    "navSettings",
    "quoteForm",
    "historyPanel",
    "contactsPanel",
    "settingsPanel",
    "recipientType",
    "recipientSelect",
    "recipientName",
    "contactPerson",
    "recipientTitle",
    "postalCode",
    "address",
    "phone",
    "subject",
    "siteName",
    "constructionPeriod",
    "issueDate",
    "expiryDate",
    "quoteNumber",
    "note",
    "paymentTerms",
    "specialNotes",
    "itemsBody",
    "addItemButton",
    "discount",
    "roundingAdjustment",
    "desiredTotalWithTax",
    "subtotalBeforeDiscount",
    "discountPreview",
    "taxableSubtotal",
    "tax",
    "roundingPreview",
    "totalWithTax",
    "saveQuoteButton",
    "newQuoteButton",
    "duplicateQuoteButton",
    "revisionQuoteButton",
    "printQuoteButton",
    "openSavedFolderButton",
    "pdfSaveStatus",
    "statusSelect",
    "historyBody",
    "contactForm",
    "contactFilterType",
    "contactSearch",
    "contactList",
    "contactSubmitButton",
    "contactCancelButton",
    "companyForm",
    "logoImageInput",
    "sealImageInput",
    "logoPreview",
    "sealPreview",
    "clearLogoButton",
    "clearSealButton",
    "backupButton",
    "restoreInput",
    "restoreModeReplace",
    "restoreModeAppend",
    "backupStatus",
    "restoreSummary",
    "printRoot",
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function bindEvents() {
  el.navNew.addEventListener("click", () => showPanel("quote"));
  el.navContacts.addEventListener("click", () => showPanel("contacts"));
  el.navHistory.addEventListener("click", () => showPanel("history"));
  el.navSettings.addEventListener("click", () => showPanel("settings"));
  el.newQuoteButton.addEventListener("click", startNewQuote);
  el.saveQuoteButton.addEventListener("click", saveCurrentQuote);
  el.duplicateQuoteButton.addEventListener("click", duplicateCurrentQuote);
  el.revisionQuoteButton.addEventListener("click", createRevisionQuote);
  el.printQuoteButton.addEventListener("click", printQuote);
  el.openSavedFolderButton.addEventListener("click", openSavedFolder);
  el.addItemButton.addEventListener("click", () => {
    currentQuote.items.push(createBlankItem());
    renderItems();
    renderTotals();
  });
  el.recipientType.addEventListener("change", () => {
    currentQuote.recipientType = el.recipientType.value;
    currentQuote.recipientTitle = getDefaultContactTitle(currentQuote.recipientType);
    currentQuote.recipientId = "";
    renderQuoteForm();
  });
  el.recipientSelect.addEventListener("change", applySelectedContact);
  el.quoteForm.addEventListener("input", syncQuoteFromForm);
  el.quoteForm.addEventListener("change", syncQuoteFromForm);
  el.itemsBody.addEventListener("input", updateItemFromInput);
  el.itemsBody.addEventListener("click", handleItemAction);
  document.addEventListener("click", closeUnitPickers);
  el.historyBody.addEventListener("click", handleHistoryAction);
  el.contactForm.addEventListener("submit", saveContact);
  el.contactForm.elements.type.addEventListener("change", updateContactTitleDefault);
  el.contactFilterType.addEventListener("change", renderContacts);
  el.contactSearch.addEventListener("input", renderContacts);
  el.contactCancelButton.addEventListener("click", resetContactForm);
  el.contactList.addEventListener("click", handleContactListAction);
  el.companyForm.addEventListener("input", saveCompany);
  el.logoImageInput.addEventListener("change", () => saveCompanyImage("logoImage", el.logoImageInput));
  el.sealImageInput.addEventListener("change", () => saveCompanyImage("sealImage", el.sealImageInput));
  el.clearLogoButton.addEventListener("click", () => clearCompanyImage("logoImage"));
  el.clearSealButton.addEventListener("click", () => clearCompanyImage("sealImage"));
  el.backupButton.addEventListener("click", downloadBackup);
  el.restoreInput.addEventListener("change", restoreBackupFromFile);
}

function renderAll() {
  resetContactForm();
  renderQuoteForm();
  renderContacts();
  renderCompany();
  renderHistory();
  showPanel("quote");
}

function showPanel(name) {
  el.quoteForm.hidden = name !== "quote";
  el.historyPanel.hidden = name !== "history";
  el.contactsPanel.hidden = name !== "contacts";
  el.settingsPanel.hidden = name !== "settings";
}

function renderQuoteForm() {
  el.recipientType.value = currentQuote.recipientType;
  renderRecipientOptions();
  setValue("recipientName", currentQuote.recipientName);
  setValue("contactPerson", currentQuote.contactPerson);
  setValue("recipientTitle", currentQuote.recipientTitle);
  setValue("postalCode", currentQuote.postalCode);
  setValue("address", currentQuote.address);
  setValue("phone", currentQuote.phone);
  setValue("subject", currentQuote.subject);
  setValue("siteName", currentQuote.siteName);
  setValue("constructionPeriod", currentQuote.constructionPeriod);
  setValue("issueDate", currentQuote.issueDate);
  setValue("expiryDate", currentQuote.expiryDate);
  setValue("quoteNumber", currentQuote.quoteNumber);
  setValue("note", currentQuote.note);
  setValue("paymentTerms", currentQuote.paymentTerms);
  setValue("specialNotes", currentQuote.specialNotes);
  setValue("discount", currentQuote.discount);
  setValue("roundingAdjustment", currentQuote.roundingAdjustment);
  setValue("desiredTotalWithTax", currentQuote.desiredTotalWithTax);
  el.statusSelect.value = currentQuote.status;
  renderItems();
  renderTotals();
}

function renderRecipientOptions() {
  const contacts = state.contacts.filter((contact) => contact.type === currentQuote.recipientType);
  el.recipientSelect.innerHTML = [
    `<option value="">宛先を選択</option>`,
    ...contacts.map((contact) => `<option value="${escapeHtml(contact.id)}">${escapeHtml(contact.name)}</option>`),
  ].join("");
  el.recipientSelect.value = currentQuote.recipientId || "";
}

function renderItems() {
  el.itemsBody.innerHTML = currentQuote.items
    .map((item, index) => {
      const amount = calculateLineAmount(item);
      return `
        <tr data-item-id="${escapeHtml(item.id)}">
          <td class="number-cell" data-label="No.">${index + 1}</td>
          <td data-label="工事項目"><input data-field="workItem" value="${escapeHtml(item.workItem)}" aria-label="工事項目 ${index + 1}" /></td>
          <td class="description-cell" data-label="内容・仕様"><textarea class="line-description" data-field="description" rows="2" aria-label="内容・仕様 ${index + 1}">${escapeHtml(item.description)}</textarea></td>
          <td data-label="数量"><input data-field="quantity" type="number" min="0" step="0.01" value="${escapeHtml(item.quantity)}" aria-label="数量 ${index + 1}" /></td>
          <td class="unit-cell" data-label="単位">
            ${renderUnitPicker(item.unit, index)}
          </td>
          <td data-label="単価"><input data-field="unitPrice" type="number" min="0" step="1" value="${escapeHtml(item.unitPrice)}" aria-label="単価 ${index + 1}" /></td>
          <td class="amount-cell" data-label="金額" aria-label="金額 ${index + 1}">${amount === null ? "—" : yen.format(amount)}</td>
          <td class="item-actions" data-label="操作">
            <button type="button" data-action="copy">複製</button>
            <button type="button" data-action="delete">削除</button>
          </td>
        </tr>
      `;
    })
    .join("");
  resizeLineDescriptionFields();
}

function renderUnitPicker(value, index) {
  const currentValue = value || "";
  const options = currentValue && !UNIT_OPTIONS.includes(currentValue) ? [...UNIT_OPTIONS, currentValue] : UNIT_OPTIONS;
  return `
    <div class="unit-picker">
      <button class="unit-select-button" type="button" data-action="unit-toggle" aria-expanded="false" aria-label="単位 ${index + 1}">
        ${escapeHtml(currentValue || "選択")}
      </button>
      <div class="unit-picker-menu" hidden>
        <button type="button" data-action="unit-option" data-unit="">選択</button>
        ${options.map((unit) => `<button type="button" data-action="unit-option" data-unit="${escapeHtml(unit)}">${escapeHtml(unit)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderTotals() {
  const totals = calculateTotals(currentQuote);
  el.subtotalBeforeDiscount.textContent = yen.format(totals.subtotalBeforeDiscount);
  el.discountPreview.textContent = `-${yen.format(totals.discount)}`;
  el.taxableSubtotal.textContent = yen.format(totals.taxableSubtotal);
  el.tax.textContent = yen.format(totals.tax);
  el.roundingPreview.textContent = `-${yen.format(totals.roundingAdjustment)}`;
  el.totalWithTax.textContent = yen.format(totals.totalWithTax);
}

function renderHistory() {
  const rows = [...state.quotes].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  el.historyBody.innerHTML =
    rows
      .map((quote) => {
        const totals = calculateTotals(quote);
        return `
          <tr data-quote-id="${escapeHtml(quote.id)}">
            <td>${escapeHtml((quote.createdAt || "").slice(0, 10))}</td>
            <td>${escapeHtml(quote.quoteNumber)}</td>
            <td>${escapeHtml(quote.recipientName)}</td>
            <td>${escapeHtml(quote.subject)}</td>
            <td>${escapeHtml(quote.siteName)}</td>
            <td>${yen.format(totals.totalWithTax)}</td>
            <td>${escapeHtml(QUOTE_STATUS[quote.status] || quote.status)}</td>
            <td class="history-actions">
              <button type="button" data-action="open">開く</button>
              <button type="button" data-action="copy">複製</button>
              <button type="button" data-action="revision">修正版</button>
              <button type="button" data-action="print">PDF</button>
            </td>
          </tr>
        `;
      })
      .join("") || `<tr><td colspan="8" class="empty">保存済み見積はまだありません。</td></tr>`;
}

function renderContacts() {
  const filterType = el.contactFilterType.value;
  const query = el.contactSearch.value.trim().toLowerCase();
  const contacts = state.contacts.filter((contact) => {
    const matchesType = filterType === "all" || contact.type === filterType;
    const matchesQuery =
      !query ||
      String(contact.name || "").toLowerCase().includes(query) ||
      String(contact.contactPerson || "").toLowerCase().includes(query);
    return matchesType && matchesQuery;
  });
  el.contactList.innerHTML = contacts
    .map(
      (contact) => `
        <li>
          <strong>${escapeHtml(contact.name)} ${escapeHtml(contact.title)}</strong>
          <span>${contact.type === "company" ? "会社" : "個人"} / ${escapeHtml(contact.address || "住所未入力")}</span>
          <span>${escapeHtml(contact.contactPerson || "担当者未入力")} / ${escapeHtml(contact.phone || "電話番号未入力")}</span>
          <div class="contact-actions">
            <button type="button" data-action="edit" data-contact-id="${escapeHtml(contact.id)}">編集</button>
            <button type="button" data-action="delete" data-contact-id="${escapeHtml(contact.id)}">削除</button>
          </div>
        </li>
      `,
    )
    .join("") || `<li class="empty">条件に一致する宛先はありません。</li>`;
}

function renderCompany() {
  Object.entries(state.company).forEach(([key, value]) => {
    const input = el.companyForm.elements[key];
    if (input) {
      input.value = value || "";
    }
  });
  renderCompanyImagePreview();
}

function syncQuoteFromForm() {
  [
    "recipientName",
    "contactPerson",
    "recipientTitle",
    "postalCode",
    "address",
    "phone",
    "subject",
    "siteName",
    "constructionPeriod",
    "issueDate",
    "expiryDate",
    "quoteNumber",
    "note",
    "paymentTerms",
    "specialNotes",
    "desiredTotalWithTax",
  ].forEach((key) => {
    currentQuote[key] = el[key].value;
  });
  currentQuote.discount = el.discount.value;
  currentQuote.roundingAdjustment = el.roundingAdjustment.value;
  const desiredRounding = calculateRoundingAdjustmentForDesiredTotal(currentQuote);
  if (desiredRounding !== null) {
    currentQuote.roundingAdjustment = desiredRounding;
    el.roundingAdjustment.value = String(desiredRounding);
  }
  currentQuote.status = el.statusSelect.value;
  renderTotals();
}

function updateItemFromInput(event) {
  const input = event.target.closest("[data-field]");
  if (!input) {
    return;
  }
  const row = input.closest("tr");
  const item = currentQuote.items.find((entry) => entry.id === row.dataset.itemId);
  if (!item) {
    return;
  }
  item[input.dataset.field] = input.value;
  if (input.dataset.field === "description") {
    resizeLineDescriptionField(input);
  }
  const amount = calculateLineAmount(item);
  row.querySelector(".amount-cell").textContent = amount === null ? "—" : yen.format(amount);
  renderTotals();
}

function resizeLineDescriptionFields() {
  el.itemsBody.querySelectorAll(".line-description").forEach(resizeLineDescriptionField);
}

function resizeLineDescriptionField(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function handleItemAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  if (button.dataset.action === "unit-toggle") {
    event.stopPropagation();
    const menu = button.closest(".unit-picker").querySelector(".unit-picker-menu");
    const willOpen = menu.hidden;
    closeUnitPickers();
    menu.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
    return;
  }
  const row = button.closest("tr");
  const index = currentQuote.items.findIndex((item) => item.id === row.dataset.itemId);
  if (index < 0) {
    return;
  }
  if (button.dataset.action === "unit-option") {
    event.stopPropagation();
    currentQuote.items[index].unit = button.dataset.unit || "";
    renderItems();
    renderTotals();
    return;
  }
  if (button.dataset.action === "copy") {
    currentQuote.items.splice(index + 1, 0, { ...structuredClone(currentQuote.items[index]), id: createId("item") });
  }
  if (button.dataset.action === "delete" && currentQuote.items.length > 1) {
    currentQuote.items.splice(index, 1);
  }
  renderItems();
  renderTotals();
}

function closeUnitPickers() {
  document.querySelectorAll(".unit-picker-menu").forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll(".unit-select-button").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function applySelectedContact() {
  const contact = state.contacts.find((entry) => entry.id === el.recipientSelect.value);
  if (!contact) {
    return;
  }
  Object.assign(currentQuote, {
    recipientId: contact.id,
    recipientType: contact.type,
    recipientName: contact.name,
    recipientTitle: contact.title || getDefaultContactTitle(contact.type),
    contactPerson: contact.contactPerson || "",
    postalCode: contact.postalCode || "",
    address: contact.address || "",
    phone: contact.phone || "",
  });
  renderQuoteForm();
}

function saveCurrentQuote() {
  syncQuoteFromForm();
  currentQuote.updatedAt = new Date().toISOString();
  const existingIndex = state.quotes.findIndex((quote) => quote.id === currentQuote.id);
  if (existingIndex >= 0) {
    state.quotes[existingIndex] = structuredClone(currentQuote);
  } else {
    state.quotes.push(structuredClone(currentQuote));
  }
  saveState();
  renderHistory();
}

function startNewQuote() {
  currentQuote = createBlankQuote(generateNextQuoteNumber(state.quotes, new Date(), state.company.quotePrefix), formatDateInput());
  currentQuote.expiryDate = formatDateInput(addDays(new Date(`${currentQuote.issueDate}T00:00:00`), state.company.defaultExpiryDays));
  renderQuoteForm();
  showPanel("quote");
}

function duplicateCurrentQuote() {
  currentQuote = duplicateQuote(currentQuote, generateNextQuoteNumber(state.quotes, new Date(), state.company.quotePrefix), formatDateInput());
  renderQuoteForm();
  showPanel("quote");
}

function createRevisionQuote() {
  const revisionNumber = createRevisionNumber(currentQuote.quoteNumber, state.quotes);
  currentQuote = buildRevisionQuote(currentQuote, revisionNumber, formatDateInput());
  renderQuoteForm();
  showPanel("quote");
}

function handleHistoryAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const row = button.closest("tr");
  const quote = state.quotes.find((entry) => entry.id === row.dataset.quoteId);
  if (!quote) {
    return;
  }
  if (button.dataset.action === "open") {
    currentQuote = structuredClone(quote);
  }
  if (button.dataset.action === "copy") {
    currentQuote = duplicateQuote(quote, generateNextQuoteNumber(state.quotes, new Date(), state.company.quotePrefix), formatDateInput());
  }
  if (button.dataset.action === "revision") {
    currentQuote = buildRevisionQuote(quote, createRevisionNumber(quote.quoteNumber, state.quotes), formatDateInput());
  }
  if (button.dataset.action === "print") {
    currentQuote = structuredClone(quote);
  }
  renderQuoteForm();
  showPanel("quote");
  if (button.dataset.action === "print") {
    printQuote();
  }
}

function saveContact(event) {
  event.preventDefault();
  const formData = new FormData(el.contactForm);
  const id = String(formData.get("id") || "");
  const type = String(formData.get("type") || "company");
  const contact = {
    id: id || createId("contact"),
    type,
    name: String(formData.get("name") || "").trim(),
    title: String(formData.get("title") || getDefaultContactTitle(type)).trim(),
    contactPerson: String(formData.get("contactPerson") || "").trim(),
    postalCode: String(formData.get("postalCode") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    note: String(formData.get("note") || "").trim(),
  };
  const existingIndex = state.contacts.findIndex((entry) => entry.id === id);
  if (existingIndex >= 0) {
    state.contacts[existingIndex] = contact;
  } else {
    state.contacts.push(contact);
  }
  resetContactForm();
  saveState();
  renderContacts();
  renderRecipientOptions();
}

function handleContactListAction(event) {
  const button = event.target.closest("button[data-contact-id]");
  if (!button) {
    return;
  }
  const contact = state.contacts.find((entry) => entry.id === button.dataset.contactId);
  if (!contact) {
    return;
  }
  if (button.dataset.action === "edit") {
    editContact(contact);
    return;
  }
  if (button.dataset.action === "delete") {
    const ok = window.confirm(`${contact.name} を宛先一覧から削除します。過去の見積履歴に保存済みの宛名表示は残ります。`);
    if (!ok) {
      return;
    }
    state.contacts = state.contacts.filter((entry) => entry.id !== contact.id);
    if (currentQuote.recipientId === contact.id) {
      currentQuote.recipientId = "";
    }
    saveState();
    renderContacts();
    renderRecipientOptions();
  }
}

function editContact(contact) {
  Object.entries(contact).forEach(([key, value]) => {
    const input = el.contactForm.elements[key];
    if (input) {
      input.value = value || "";
    }
  });
  el.contactSubmitButton.textContent = "宛先を更新";
  el.contactCancelButton.hidden = false;
}

function resetContactForm() {
  el.contactForm.reset();
  el.contactForm.elements.id.value = "";
  el.contactForm.elements.type.value = "company";
  el.contactForm.elements.title.value = getDefaultContactTitle("company");
  el.contactSubmitButton.textContent = "宛先を追加";
  el.contactCancelButton.hidden = true;
}

function updateContactTitleDefault() {
  if (!el.contactForm.elements.title.value || !el.contactForm.elements.id.value) {
    el.contactForm.elements.title.value = getDefaultContactTitle(el.contactForm.elements.type.value);
  }
}

function saveCompany() {
  Object.keys(state.company).forEach((key) => {
    const input = el.companyForm.elements[key];
    if (input) {
      state.company[key] = key === "defaultExpiryDays" ? Math.max(0, Number(input.value || 0)) : input.value;
    }
  });
  state.company.quotePrefix = normalizeQuotePrefix(state.company.quotePrefix);
  el.companyForm.elements.quotePrefix.value = state.company.quotePrefix;
  saveState();
}

function saveCompanyImage(key, input) {
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.companyAssets[key] = String(reader.result || "");
    saveState();
    renderCompanyImagePreview();
    input.value = "";
  });
  reader.readAsDataURL(file);
}

function clearCompanyImage(key) {
  state.companyAssets[key] = "";
  saveState();
  renderCompanyImagePreview();
}

function downloadBackup() {
  saveCurrentQuote();
  const backup = buildBackup(state);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = createBackupFileName();
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  const summary = summarizeBackup(backup);
  showBackupStatus(`バックアップを作成しました。見積 ${summary.quoteCount}件、宛先 ${summary.contactCount}件を保存しました。`);
}

async function restoreBackupFromFile() {
  const file = el.restoreInput.files?.[0];
  if (!file) {
    return;
  }

  try {
    const backup = parseBackupJson(await file.text());
    const summary = summarizeBackup(backup);
    el.restoreSummary.hidden = false;
    el.restoreSummary.textContent = formatBackupSummary(summary);
    const mode = el.restoreModeAppend.checked ? "append" : "replace";
    const modeLabel = mode === "append" ? "現在のデータへ追加" : "現在のデータを置き換え";
    const ok = window.confirm(`${formatBackupSummary(summary)}\n\n復元方式: ${modeLabel}\n\nこの内容で復元しますか？`);
    if (!ok) {
      return;
    }
    if (mode === "replace") {
      const replaceOk = window.confirm("現在の見積履歴、宛先、会社情報がバックアップ内容に置き換わります。続けますか？");
      if (!replaceOk) {
        return;
      }
    }
    state = restoreBackupData(state, backup, { mode });
    saveState();
    startNewQuote();
    renderAll();
    showPanel("settings");
    showBackupStatus(`復元が完了しました。見積 ${state.quotes.length}件、宛先 ${state.contacts.length}件を読み込みました。`);
  } catch (error) {
    el.restoreSummary.hidden = false;
    el.restoreSummary.textContent = error instanceof Error ? error.message : "バックアップを復元できませんでした。";
    window.alert(el.restoreSummary.textContent);
  } finally {
    el.restoreInput.value = "";
  }
}

function formatBackupSummary(summary) {
  return [
    "バックアップ内容",
    `作成日時: ${summary.createdAt || "不明"}`,
    `見積件数: ${summary.quoteCount}件`,
    `宛先件数: ${summary.contactCount}件`,
    `会社情報: ${summary.hasCompany ? "あり" : "なし"}`,
    `ロゴ画像: ${summary.hasLogoImage ? "あり" : "なし"}`,
    `印鑑画像: ${summary.hasSealImage ? "あり" : "なし"}`,
  ].join("\n");
}

function showBackupStatus(message) {
  el.backupStatus.hidden = false;
  el.backupStatus.textContent = message;
}

function renderCompanyImagePreview() {
  renderImagePreview(el.logoPreview, state.companyAssets.logoImage);
  renderImagePreview(el.sealPreview, state.companyAssets.sealImage);
}

function renderImagePreview(image, source) {
  image.src = source || "";
  image.hidden = !source;
}

async function printQuote() {
  syncQuoteFromForm();
  const totals = calculateTotals(currentQuote);
  const itemCount = currentQuote.items.length;
  const ok = window.confirm(
    `PDFを生成します。\n\n見積番号: ${currentQuote.quoteNumber || "-"}\n宛名: ${currentQuote.recipientName || "-"} ${currentQuote.recipientTitle || ""}\n明細数: ${itemCount}\n合計（税込）: ${yen.format(totals.totalWithTax)}\n\n現在の内容を保存してからPDFを生成します。`,
  );
  if (!ok) {
    return;
  }
  saveCurrentQuote();
  renderSubmitPrintDocument();
  await createSubmitPdfFromCurrentPrintDocument();
}

function renderPrintDocument() {
  const totals = calculateTotals(currentQuote);
  const rows = currentQuote.items.map((item, index) => ({ ...item, number: index + 1, amount: calculateLineAmount(item) }));
  const pages = chunkRows(rows, 10, 18);
  const pageCount = pages.length || 1;

  el.printRoot.innerHTML = pages
    .map((pageRows, pageIndex) => {
      const isFirst = pageIndex === 0;
      const isLast = pageIndex === pageCount - 1;
      return `
        <section class="print-page">
          <header class="print-header">
            <div class="recipient-block">
              <h1>${isFirst ? "御見積書" : "御見積書（明細続き）"}</h1>
              ${
                isFirst
                  ? `<p class="recipient-name">${escapeHtml(currentQuote.recipientName || "宛名未入力")} ${escapeHtml(currentQuote.recipientTitle || "")}</p>
                     <p>${escapeHtml(currentQuote.postalCode || "")}</p>
                     <p>${escapeHtml(currentQuote.address || "")}</p>
                     <p>${currentQuote.contactPerson ? `ご担当: ${escapeHtml(currentQuote.contactPerson)} 様` : ""}</p>`
                  : `<p class="continue-label">見積番号: ${escapeHtml(currentQuote.quoteNumber)}</p>`
              }
            </div>
            <div class="company-block">
              ${state.companyAssets.logoImage ? `<img class="company-logo" src="${escapeHtml(state.companyAssets.logoImage)}" alt="ロゴ" />` : ""}
              <strong>${escapeHtml(state.company.name)}</strong>
              ${state.company.representative ? `<p>代表 ${escapeHtml(state.company.representative)}</p>` : ""}
              <p>${escapeHtml(state.company.postalCode)}</p>
              <p>${escapeHtml(state.company.address)}</p>
              ${state.company.phone ? `<p>TEL ${escapeHtml(state.company.phone)}</p>` : ""}
              ${state.company.email ? `<p>${escapeHtml(state.company.email)}</p>` : ""}
              ${state.company.registrationNumber ? `<p>${escapeHtml(state.company.registrationNumber)}</p>` : ""}
              ${state.company.bankAccount ? `<p>振込先 ${escapeHtml(state.company.bankAccount)}</p>` : ""}
              ${
                state.companyAssets.sealImage
                  ? `<img class="company-seal" src="${escapeHtml(state.companyAssets.sealImage)}" alt="印鑑" />`
                  : `<div class="company-seal-placeholder" aria-label="店印鑑欄"></div>`
              }
            </div>
          </header>
          ${
            isFirst
              ? `<section class="print-meta">
                   <dl>
                     <div><dt>件名</dt><dd>${escapeHtml(currentQuote.subject)}</dd></div>
                     <div><dt>現場名</dt><dd>${escapeHtml(currentQuote.siteName)}</dd></div>
                     <div><dt>工期</dt><dd>${escapeHtml(currentQuote.constructionPeriod)}</dd></div>
                     <div><dt>発行日</dt><dd>${escapeHtml(currentQuote.issueDate)}</dd></div>
                     <div><dt>有効期限</dt><dd>${escapeHtml(currentQuote.expiryDate)}</dd></div>
                     <div><dt>見積番号</dt><dd>${escapeHtml(currentQuote.quoteNumber)}</dd></div>
                   </dl>
                   <div class="print-total-box">
                     <span>御見積金額（税込）</span>
                     <strong>${yen.format(totals.totalWithTax)}</strong>
                   </div>
                 </section>`
              : ""
          }
          ${renderPrintItems(pageRows)}
          ${
            isLast
              ? `<section class="print-summary">
                   <dl>
                     <div><dt>税抜合計</dt><dd>${yen.format(totals.subtotalBeforeDiscount)}</dd></div>
                     <div><dt>値引き</dt><dd>-${yen.format(totals.discount)}</dd></div>
                     <div><dt>小計</dt><dd>${yen.format(totals.taxableSubtotal)}</dd></div>
                     <div><dt>消費税</dt><dd>${yen.format(totals.tax)}</dd></div>
                     <div><dt>端数調整</dt><dd>-${yen.format(totals.roundingAdjustment)}</dd></div>
                     <div class="grand-total"><dt>合計（税込）</dt><dd>${yen.format(totals.totalWithTax)}</dd></div>
                   </dl>
                 </section>
                 <section class="print-notes">
                   <p><strong>備考</strong><br />${escapeHtml(currentQuote.note).replaceAll("\n", "<br />")}</p>
                   <p><strong>支払条件</strong><br />${escapeHtml(currentQuote.paymentTerms).replaceAll("\n", "<br />")}</p>
                   <p><strong>特記事項・注意事項</strong><br />${escapeHtml(currentQuote.specialNotes).replaceAll("\n", "<br />")}</p>
                 </section>`
              : ""
          }
          <footer class="print-footer">${pageIndex + 1} / ${pageCount}</footer>
        </section>
      `;
    })
    .join("");
}

function renderPrintItems(rows) {
  return `
    <table class="print-items">
      <thead>
        <tr>
          <th>No.</th>
          <th>工事項目</th>
          <th>内容・仕様</th>
          <th>数量</th>
          <th>単位</th>
          <th>単価</th>
          <th>金額</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (item) => `
              <tr>
                <td>${item.number}</td>
                <td>${escapeHtml(item.workItem)}</td>
                <td>${escapeHtml(item.description).replaceAll("\n", "<br />")}</td>
                <td>${escapeHtml(item.quantity)}</td>
                <td>${escapeHtml(item.unit)}</td>
                <td>${item.unitPrice === "" ? "" : yen.format(Number(item.unitPrice) || 0)}</td>
                <td>${item.amount === null ? "—" : yen.format(item.amount)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function chunkRows(rows, firstSize, nextSize) {
  if (rows.length <= firstSize) {
    return [rows];
  }
  const pages = [rows.slice(0, firstSize)];
  for (let index = firstSize; index < rows.length; index += nextSize) {
    pages.push(rows.slice(index, index + nextSize));
  }
  return pages;
}

function renderPrintDocumentV2() {
  const totals = calculateTotals(currentQuote);
  const rows = currentQuote.items.map((item, index) => ({ ...item, number: index + 1, amount: calculateLineAmount(item) }));
  const pages = chunkRows(rows, 10, 14);
  const pageCount = pages.length || 1;
  const recipientLine = `${currentQuote.recipientName || "宛名未入力"} ${currentQuote.recipientTitle || ""}`.trim();

  el.printRoot.innerHTML = pages
    .map((pageRows, pageIndex) => {
      const isFirst = pageIndex === 0;
      const isLast = pageIndex === pageCount - 1;
      return `
        <section class="print-page">
          <header class="print-title">
            <div class="title-rule"></div>
            <h1>${isFirst ? "御見積書" : "御見積書（明細続き）"}</h1>
            <p class="print-page-number">${pageIndex + 1} / ${pageCount}</p>
            <div class="title-rule title-rule-bottom"></div>
          </header>
          ${
            isFirst
              ? `<section class="print-intro">
                   <div class="recipient-block">
                     <p class="recipient-name">${escapeHtml(recipientLine)}</p>
                     ${currentQuote.contactPerson ? `<p class="recipient-person">ご担当 ${escapeHtml(currentQuote.contactPerson)} 様</p>` : ""}
                     ${currentQuote.postalCode ? `<p>${escapeHtml(currentQuote.postalCode)}</p>` : ""}
                     ${currentQuote.address ? `<p>${escapeHtml(currentQuote.address)}</p>` : ""}
                     <dl class="project-info">
                       ${renderPrintInfoRow("件名", currentQuote.subject)}
                       ${renderPrintInfoRow("現場名", currentQuote.siteName)}
                       ${renderPrintInfoRow("工期", currentQuote.constructionPeriod)}
                       ${renderPrintInfoRow("有効期限", currentQuote.expiryDate)}
                       ${renderPrintInfoRow("見積番号", currentQuote.quoteNumber)}
                       ${renderPrintInfoRow("発行日", currentQuote.issueDate)}
                     </dl>
                   </div>
                   <div class="company-block">
                     <div class="company-heading">
                       ${state.companyAssets.logoImage ? `<img class="company-logo" src="${escapeHtml(state.companyAssets.logoImage)}" alt="ロゴ" />` : ""}
                       <div>
                         <strong>${escapeHtml(state.company.name || "竹本塗装店")}</strong>
                         ${state.company.representative ? `<p>代表 ${escapeHtml(state.company.representative)}</p>` : ""}
                       </div>
                     </div>
                     ${renderCompanyLine(state.company.postalCode)}
                     ${renderCompanyLine(state.company.address)}
                     ${state.company.phone ? `<p>TEL ${escapeHtml(state.company.phone)}</p>` : ""}
                     ${state.company.email ? `<p>Mail ${escapeHtml(state.company.email)}</p>` : ""}
                     ${state.company.registrationNumber ? `<p>登録番号 ${escapeHtml(state.company.registrationNumber)}</p>` : ""}
                     ${
                       state.companyAssets.sealImage
                         ? `<img class="company-seal" src="${escapeHtml(state.companyAssets.sealImage)}" alt="印鑑" />`
                         : `<div class="company-seal-placeholder" aria-label="店印鑑欄"></div>`
                     }
                   </div>
                 </section>
                 <section class="print-total-box">
                   <span>御見積金額（税込）</span>
                   <strong>${yen.format(totals.totalWithTax)}</strong>
                 </section>`
              : `<p class="continue-label">見積番号: ${escapeHtml(currentQuote.quoteNumber || "-")}</p>`
          }
          ${renderPrintItemsV2(pageRows)}
          ${
            isLast
              ? `<section class="print-final">
                   <section class="print-summary">
                     <dl>
                       <div><dt>税抜合計</dt><dd>${yen.format(totals.subtotalBeforeDiscount)}</dd></div>
                       <div><dt>値引き</dt><dd class="minus">-${yen.format(totals.discount)}</dd></div>
                       <div><dt>消費税（10%）</dt><dd>${yen.format(totals.tax)}</dd></div>
                       <div><dt>端数調整</dt><dd class="minus">-${yen.format(totals.roundingAdjustment)}</dd></div>
                       <div class="grand-total"><dt>合計金額（税込）</dt><dd>${yen.format(totals.totalWithTax)}</dd></div>
                     </dl>
                   </section>
                   <section class="print-notes">
                     ${renderPrintNoteBlock("備考", currentQuote.note)}
                     ${renderPrintNoteBlock("支払条件", currentQuote.paymentTerms)}
                     ${renderPrintNoteBlock("特記事項・注意事項", currentQuote.specialNotes)}
                   </section>
                   <section class="print-company-footer">
                     <div class="company-heading">
                       ${state.companyAssets.logoImage ? `<img class="company-logo" src="${escapeHtml(state.companyAssets.logoImage)}" alt="ロゴ" />` : ""}
                       <div>
                         <strong>${escapeHtml(state.company.name || "竹本塗装店")}</strong>
                         ${state.company.representative ? `<p>代表 ${escapeHtml(state.company.representative)}</p>` : ""}
                       </div>
                     </div>
                     ${renderCompanyLine(state.company.postalCode)}
                     ${renderCompanyLine(state.company.address)}
                     ${state.company.phone ? `<p>TEL ${escapeHtml(state.company.phone)}</p>` : ""}
                     ${state.company.email ? `<p>Mail ${escapeHtml(state.company.email)}</p>` : ""}
                     ${state.company.registrationNumber ? `<p>登録番号 ${escapeHtml(state.company.registrationNumber)}</p>` : ""}
                     ${
                       state.companyAssets.sealImage
                         ? `<img class="company-seal" src="${escapeHtml(state.companyAssets.sealImage)}" alt="印鑑" />`
                         : `<div class="company-seal-placeholder" aria-label="店印鑑欄"></div>`
                     }
                   </section>
                 </section>`
              : ""
          }
        </section>
      `;
    })
    .join("");
}

function renderPrintItemsV2(rows) {
  return `
    <table class="print-items">
      <thead>
        <tr>
          <th>No.</th>
          <th>工事項目</th>
          <th>内容・仕様</th>
          <th>数量</th>
          <th>単位</th>
          <th>単価</th>
          <th>金額</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (item) => `
              <tr>
                <td>${item.number}</td>
                <td>${escapeHtml(item.workItem || "-")}</td>
                <td>${escapeHtml(item.description || "-").replaceAll("\n", "<br />")}</td>
                <td>${escapeHtml(item.quantity)}</td>
                <td>${escapeHtml(item.unit)}</td>
                <td>${item.unitPrice === "" ? "" : yen.format(Number(item.unitPrice) || 0)}</td>
                <td>${item.amount === null ? "-" : yen.format(item.amount)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderPrintInfoRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd></div>`;
}

function renderCompanyLine(value) {
  return value ? `<p>${escapeHtml(value)}</p>` : "";
}

function renderPrintNoteBlock(title, value) {
  return `
    <div class="print-note-block">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(value || "-").replaceAll("\n", "<br />")}</p>
    </div>
  `;
}

function isPrintableQuoteItem(item) {
  return Boolean(
    String(item.workItem || "").trim() ||
      String(item.description || "").trim() ||
      String(item.quantity || "").trim() ||
      String(item.unitPrice || "").trim(),
  );
}

function renderSubmitPrintDocument() {
  const totals = calculateTotals(currentQuote);
  const rows = currentQuote.items
    .filter(isPrintableQuoteItem)
    .map((item, index) => ({ ...item, number: index + 1, amount: calculateLineAmount(item) }));
  const pages = chunkRows(rows, 12, 16);
  const pageCount = pages.length || 1;
  const recipientLine = [currentQuote.recipientName, currentQuote.recipientTitle].filter(Boolean).join(" ");
  const notesHtml = [
    renderSubmitNoteBlock("備考", currentQuote.note),
    renderSubmitNoteBlock("支払条件", currentQuote.paymentTerms),
    renderSubmitNoteBlock("特記事項・注意事項", currentQuote.specialNotes),
  ].join("");

  el.printRoot.innerHTML = pages
    .map((pageRows, pageIndex) => {
      const isFirst = pageIndex === 0;
      const isLast = pageIndex === pageCount - 1;
      return `
        <section class="print-page">
          <header class="print-title">
            <div class="title-rule"></div>
            <h1>${isFirst ? "御見積書" : "御見積書（明細続き）"}</h1>
            <p class="print-page-number">${pageIndex + 1} / ${pageCount}</p>
            <div class="title-rule title-rule-bottom"></div>
          </header>
          ${
            isFirst
              ? `<section class="print-intro">
                   <div class="recipient-block">
                     ${recipientLine ? `<p class="recipient-name">${escapeHtml(recipientLine)}</p>` : ""}
                     ${currentQuote.contactPerson ? `<p class="recipient-person">ご担当 ${escapeHtml(currentQuote.contactPerson)} 様</p>` : ""}
                     ${currentQuote.postalCode ? `<p>${escapeHtml(currentQuote.postalCode)}</p>` : ""}
                     ${currentQuote.address ? `<p>${escapeHtml(currentQuote.address)}</p>` : ""}
                     <dl class="project-info">
                       ${renderSubmitInfoRow("件名", currentQuote.subject)}
                       ${renderSubmitInfoRow("現場名", currentQuote.siteName)}
                       ${renderSubmitInfoRow("工期", currentQuote.constructionPeriod)}
                       ${renderSubmitInfoRow("有効期限", currentQuote.expiryDate)}
                       ${renderSubmitInfoRow("見積番号", currentQuote.quoteNumber)}
                       ${renderSubmitInfoRow("発行日", currentQuote.issueDate)}
                     </dl>
                   </div>
                   <div class="company-block">
                     <div class="company-heading">
                       ${state.companyAssets.logoImage ? `<img class="company-logo" src="${escapeHtml(state.companyAssets.logoImage)}" alt="ロゴ" />` : ""}
                       <div>
                         <strong>${escapeHtml(state.company.name || "竹本塗装店")}</strong>
                         ${state.company.representative ? `<p>代表 ${escapeHtml(state.company.representative)}</p>` : ""}
                       </div>
                     </div>
                     ${renderCompanyLine(state.company.postalCode)}
                     ${renderCompanyLine(state.company.address)}
                     ${state.company.phone ? `<p>TEL ${escapeHtml(state.company.phone)}</p>` : ""}
                     ${state.company.email ? `<p>Mail ${escapeHtml(state.company.email)}</p>` : ""}
                     ${state.company.registrationNumber ? `<p>登録番号 ${escapeHtml(state.company.registrationNumber)}</p>` : ""}
                     ${
                       state.companyAssets.sealImage
                         ? `<img class="company-seal" src="${escapeHtml(state.companyAssets.sealImage)}" alt="印鑑" />`
                         : `<div class="company-seal-placeholder" aria-label="店印鑑欄"></div>`
                     }
                   </div>
                 </section>
                 <section class="print-total-box">
                   <span>御見積金額（税込）</span>
                   <strong>${yen.format(totals.totalWithTax)}</strong>
                 </section>`
              : currentQuote.quoteNumber
                ? `<p class="continue-label">見積番号: ${escapeHtml(currentQuote.quoteNumber)}</p>`
                : ""
          }
          ${renderSubmitPrintItems(pageRows)}
          ${
            isLast
              ? `<section class="print-final">
                   <section class="print-summary">
                     <dl>
                       <div><dt>税抜合計</dt><dd>${yen.format(totals.subtotalBeforeDiscount)}</dd></div>
                       <div><dt>値引き</dt><dd class="minus">-${yen.format(totals.discount)}</dd></div>
                       <div><dt>消費税（10%）</dt><dd>${yen.format(totals.tax)}</dd></div>
                       <div><dt>端数調整</dt><dd class="minus">-${yen.format(totals.roundingAdjustment)}</dd></div>
                       <div class="grand-total"><dt>合計金額（税込）</dt><dd>${yen.format(totals.totalWithTax)}</dd></div>
                     </dl>
                   </section>
                   ${notesHtml ? `<section class="print-notes">${notesHtml}</section>` : ""}
                 </section>`
              : ""
          }
        </section>
      `;
    })
    .join("");
}

function renderSubmitPrintItems(rows) {
  return `
    <table class="print-items">
      <thead>
        <tr>
          <th>No.</th>
          <th>工事項目</th>
          <th>内容・仕様</th>
          <th>数量</th>
          <th>単位</th>
          <th>単価</th>
          <th>金額</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (item) => `
              <tr>
                <td>${item.number}</td>
                <td>${escapeHtml(item.workItem || "")}</td>
                <td>${escapeHtml(item.description || "").replaceAll("\n", "<br />")}</td>
                <td>${escapeHtml(item.quantity)}</td>
                <td>${escapeHtml(item.unit)}</td>
                <td>${item.unitPrice === "" ? "" : yen.format(Number(item.unitPrice) || 0)}</td>
                <td>${item.amount === null ? "" : yen.format(item.amount)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderSubmitInfoRow(label, value) {
  return value ? `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>` : "";
}

function renderSubmitNoteBlock(title, value) {
  return value
    ? `<div class="print-note-block"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(value).replaceAll("\n", "<br />")}</p></div>`
    : "";
}

async function createSubmitPdfFromCurrentPrintDocument() {
  const fileName = `${sanitizePdfFileName(currentQuote.quoteNumber || "estimate")}-${Date.now()}`;
  el.printQuoteButton.disabled = true;
  el.printQuoteButton.textContent = "PDF生成中...";
  try {
    let result;
    try {
      result = await postEstimatePdf({
        quote: currentQuote,
        company: state.company,
        companyAssets: state.companyAssets,
        pdfEngine: "excel",
        fileName,
      });
    } catch (excelError) {
      console.warn("Excel PDF generation failed. Falling back to HTML/ReportLab.", excelError);
      try {
        result = await postEstimatePdf({
          html: buildSubmitStandalonePrintHtml(),
          quote: currentQuote,
          company: state.company,
          companyAssets: state.companyAssets,
          fileName: `${fileName}-html`,
        });
      } catch (htmlError) {
        console.warn("HTML PDF generation failed. Falling back to ReportLab.", htmlError);
        result = await postEstimatePdf({
          quote: currentQuote,
          company: state.company,
          companyAssets: state.companyAssets,
          fileName: `${fileName}-reportlab`,
        });
      }
    }
    if (result.fallback === "reportlab" && result.htmlUrl) {
      window.open(result.htmlUrl, "_blank");
      window.alert("HTML/CSSからのPDF生成に失敗したため、確認用HTMLを開きました。保険用PDFもoutputsに作成済みです。");
    } else {
      window.open(result.pdfUrl, "_blank");
    }
    showPdfSaveStatus(result);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "PDF生成に失敗しました。");
  } finally {
    el.printQuoteButton.disabled = false;
    el.printQuoteButton.textContent = "PDF出力";
  }
}

async function openSavedFolder() {
  if (!lastSavedFolderPath) {
    return;
  }
  try {
    const response = await fetch("/api/open-folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderPath: lastSavedFolderPath }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "保存先フォルダを開けませんでした。");
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "保存先フォルダを開けませんでした。");
  }
}

function showPdfSaveStatus(result) {
  if (!result.savedFolderPath) {
    return;
  }
  lastSavedFolderPath = result.savedFolderPath;
  el.pdfSaveStatus.hidden = false;
  el.pdfSaveStatus.textContent = `保存先: ${result.savedFolderPath}`;
  el.openSavedFolderButton.hidden = false;
}
async function postEstimatePdf(payload) {
  const response = await fetch("/api/estimates/pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "PDF生成に失敗しました。");
  }
  return result;
}

function buildSubmitStandalonePrintHtml() {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(currentQuote.quoteNumber || "御見積書")}</title>
    <link rel="stylesheet" href="/estimates/styles.css" />
  </head>
  <body>
    <div id="printRoot" class="print-root" aria-label="提出用見積書">${el.printRoot.innerHTML}</div>
  </body>
</html>`;
}

async function createPdfFromCurrentPrintDocument() {
  const fileName = `${sanitizePdfFileName(currentQuote.quoteNumber || "estimate")}-${Date.now()}`;
  el.printQuoteButton.disabled = true;
  el.printQuoteButton.textContent = "PDF生成中...";
  try {
    const response = await fetch("/api/estimates/pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quote: currentQuote,
        company: state.company,
        companyAssets: state.companyAssets,
        fileName,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "PDF生成に失敗しました。");
    }
    window.open(result.pdfUrl, "_blank");
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "PDF生成に失敗しました。");
  } finally {
    el.printQuoteButton.disabled = false;
    el.printQuoteButton.textContent = "PDF出力";
  }
}

function buildStandalonePrintHtml() {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(currentQuote.quoteNumber || "見積書")}</title>
    <link rel="stylesheet" href="/estimates/styles.css" />
  </head>
  <body>
    <div id="printRoot" class="print-root" aria-label="提出用見積書">${el.printRoot.innerHTML}</div>
  </body>
</html>`;
}

function sanitizePdfFileName(value) {
  return String(value)
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "estimate";
}

function setValue(id, value) {
  el[id].value = value ?? "";
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed) {
      return structuredClone(defaultState);
    }
    const company = { ...getDefaultCompany(), ...(parsed.company || {}) };
    const companyAssets = {
      ...getDefaultCompanyAssets(),
      ...(parsed.companyAssets || {}),
      logoImage: parsed.companyAssets?.logoImage || parsed.company?.logoImage || "",
      sealImage: parsed.companyAssets?.sealImage || parsed.company?.sealImage || "",
    };
    delete company.logoImage;
    delete company.sealImage;
    company.quotePrefix = normalizeQuotePrefix(company.quotePrefix);
    company.defaultExpiryDays = Math.max(0, Number(company.defaultExpiryDays || 0));
    return {
      ...structuredClone(defaultState),
      ...parsed,
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : structuredClone(defaultState.contacts),
      company,
      companyAssets,
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
