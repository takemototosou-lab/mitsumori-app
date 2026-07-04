import test from "node:test";
import assert from "node:assert/strict";

import {
  BACKUP_APP_ID,
  BACKUP_VERSION,
  buildBackup,
  parseBackupJson,
  restoreBackupData,
  summarizeBackup,
} from "./quote-backup.js";

const sampleState = {
  contacts: [
    { id: "contact-1", type: "company", name: "テスト建設", title: "御中" },
  ],
  quotes: [
    {
      id: "quote-1",
      quoteNumber: "TKM-2026-001",
      recipientName: "テスト建設",
      items: [{ id: "item-1", workItem: "洗浄", quantity: 10, unit: "m2", unitPrice: 100 }],
    },
  ],
  company: { name: "竹本塗装店", quotePrefix: "TKM", defaultExpiryDays: 30 },
  companyAssets: {
    logoImage: "data:image/png;base64,logo",
    sealImage: "data:image/png;base64,seal",
  },
};

test("見積アプリの状態をバージョン付きJSONバックアップにする", () => {
  const backup = buildBackup(sampleState, "2026-07-05T00:00:00.000Z");

  assert.equal(backup.app, BACKUP_APP_ID);
  assert.equal(backup.backupVersion, BACKUP_VERSION);
  assert.equal(backup.createdAt, "2026-07-05T00:00:00.000Z");
  assert.equal(backup.data.quotes.length, 1);
  assert.equal(backup.data.contacts.length, 1);
  assert.equal(backup.data.company.name, "竹本塗装店");
  assert.equal(backup.data.companyAssets.sealImage, "data:image/png;base64,seal");
});

test("バックアップJSONの概要を復元前に確認できる", () => {
  const backup = buildBackup(sampleState, "2026-07-05T00:00:00.000Z");
  const summary = summarizeBackup(backup);

  assert.deepEqual(summary, {
    createdAt: "2026-07-05T00:00:00.000Z",
    quoteCount: 1,
    contactCount: 1,
    hasCompany: true,
    hasLogoImage: true,
    hasSealImage: true,
  });
});

test("別アプリや不正なバックアップJSONは拒否する", () => {
  assert.throws(() => parseBackupJson("{"), /JSON/);
  assert.throws(() => parseBackupJson(JSON.stringify({ app: "other-app", backupVersion: 1, data: {} })), /別アプリ/);
  assert.throws(() => parseBackupJson(JSON.stringify({ app: BACKUP_APP_ID, backupVersion: 99, data: {} })), /未対応/);
});

test("置き換え復元は現在データをバックアップ内容に差し替える", () => {
  const current = { contacts: [], quotes: [], company: {}, companyAssets: {} };
  const backup = buildBackup(sampleState, "2026-07-05T00:00:00.000Z");

  const restored = restoreBackupData(current, backup, { mode: "replace" });

  assert.equal(restored.quotes.length, 1);
  assert.equal(restored.contacts.length, 1);
  assert.equal(restored.quotes[0].id, "quote-1");
  assert.equal(restored.company.name, "竹本塗装店");
});

test("追加復元は既存IDを上書きせず、新しいIDに付け替える", () => {
  const current = {
    contacts: [{ id: "contact-1", type: "company", name: "既存宛先" }],
    quotes: [{ id: "quote-1", quoteNumber: "TKM-2026-999", items: [{ id: "item-1" }] }],
    company: { name: "既存会社" },
    companyAssets: { sealImage: "" },
  };
  const backup = buildBackup(sampleState, "2026-07-05T00:00:00.000Z");

  const restored = restoreBackupData(current, backup, { mode: "append" });

  assert.equal(restored.contacts.length, 2);
  assert.equal(restored.quotes.length, 2);
  assert.equal(restored.contacts[0].id, "contact-1");
  assert.equal(restored.contacts[1].name, "テスト建設");
  assert.notEqual(restored.contacts[1].id, "contact-1");
  assert.equal(restored.quotes[0].id, "quote-1");
  assert.notEqual(restored.quotes[1].id, "quote-1");
  assert.notEqual(restored.quotes[1].items[0].id, "item-1");
  assert.equal(restored.company.name, "既存会社");
});
