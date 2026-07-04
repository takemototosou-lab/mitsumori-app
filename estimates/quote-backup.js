export const BACKUP_APP_ID = "mitsumori-app";
export const BACKUP_VERSION = 1;

export function buildBackup(state, createdAt = new Date().toISOString()) {
  return {
    app: BACKUP_APP_ID,
    backupVersion: BACKUP_VERSION,
    createdAt,
    data: normalizeBackupData(state),
  };
}

export function parseBackupJson(jsonText) {
  let backup;
  try {
    backup = JSON.parse(jsonText);
  } catch {
    throw new Error("バックアップJSONを読み込めません。JSON形式を確認してください。");
  }

  validateBackup(backup);
  return backup;
}

export function validateBackup(backup) {
  if (!backup || typeof backup !== "object") {
    throw new Error("バックアップ形式が不正です。");
  }
  if (backup.app !== BACKUP_APP_ID) {
    throw new Error("別アプリのバックアップです。見積アプリ用JSONを選択してください。");
  }
  if (backup.backupVersion !== BACKUP_VERSION) {
    throw new Error("未対応のバックアップバージョンです。");
  }
  if (!backup.data || typeof backup.data !== "object") {
    throw new Error("バックアップデータが空、または不正です。");
  }
}

export function summarizeBackup(backup) {
  validateBackup(backup);
  const data = normalizeBackupData(backup.data);
  return {
    createdAt: String(backup.createdAt || ""),
    quoteCount: data.quotes.length,
    contactCount: data.contacts.length,
    hasCompany: Object.keys(data.company).length > 0,
    hasLogoImage: Boolean(data.companyAssets.logoImage),
    hasSealImage: Boolean(data.companyAssets.sealImage),
  };
}

export function restoreBackupData(currentState, backup, { mode = "replace" } = {}) {
  validateBackup(backup);
  const backupData = normalizeBackupData(backup.data);
  const current = normalizeBackupData(currentState);

  if (mode === "replace") {
    return structuredClone(backupData);
  }
  if (mode !== "append") {
    throw new Error("復元方式が不正です。");
  }

  return appendBackupData(current, backupData);
}

export function createBackupFileName(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `mitsumori-backup-${year}-${month}-${day}.json`;
}

function normalizeBackupData(value = {}) {
  return {
    contacts: Array.isArray(value.contacts) ? structuredClone(value.contacts) : [],
    quotes: Array.isArray(value.quotes) ? structuredClone(value.quotes) : [],
    company: value.company && typeof value.company === "object" ? structuredClone(value.company) : {},
    companyAssets: value.companyAssets && typeof value.companyAssets === "object" ? structuredClone(value.companyAssets) : {},
  };
}

function appendBackupData(current, backupData) {
  const usedContactIds = new Set(current.contacts.map((entry) => entry?.id).filter(Boolean));
  const usedQuoteIds = new Set(current.quotes.map((entry) => entry?.id).filter(Boolean));
  const usedItemIds = new Set(current.quotes.flatMap((quote) => (Array.isArray(quote?.items) ? quote.items : []).map((item) => item?.id)).filter(Boolean));

  const contacts = [
    ...structuredClone(current.contacts),
    ...backupData.contacts.map((contact) => cloneWithUniqueId(contact, "contact", usedContactIds)),
  ];
  const quotes = [
    ...structuredClone(current.quotes),
    ...backupData.quotes.map((quote) => {
      const cloned = cloneWithUniqueId(quote, "quote", usedQuoteIds);
      cloned.items = Array.isArray(cloned.items)
        ? cloned.items.map((item) => cloneWithUniqueId(item, "item", usedItemIds))
        : [];
      return cloned;
    }),
  ];

  return {
    contacts,
    quotes,
    company: structuredClone(current.company),
    companyAssets: structuredClone(current.companyAssets),
  };
}

function cloneWithUniqueId(value, prefix, usedIds) {
  const cloned = structuredClone(value || {});
  const id = cloned.id || createStableId(prefix, usedIds);
  cloned.id = usedIds.has(id) ? createStableId(prefix, usedIds) : id;
  usedIds.add(cloned.id);
  return cloned;
}

function createStableId(prefix, usedIds) {
  let index = 1;
  let id = `${prefix}-import-${index}`;
  while (usedIds.has(id)) {
    index += 1;
    id = `${prefix}-import-${index}`;
  }
  return id;
}
