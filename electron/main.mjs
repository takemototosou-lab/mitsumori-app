import { app, BrowserWindow, shell } from "electron";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";

const APP_NAME = "竹本塗装店 見積アプリ";
const ELECTRON_PORT = 4189;
const STORAGE_KEY = "takemoto-estimates:v1";
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = app.isPackaged ? app.getAppPath() : join(__dirname, "..");

let server;
let mainWindow;
let appUrl;

app.setName(APP_NAME);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    process.chdir(projectRoot);
    const legacyState = await readLegacyLocalStorageState(app.getPath("userData"));
    server = startServer({ rootDir: projectRoot, port: ELECTRON_PORT, silent: true });
    const actualPort = await waitForServer(server);
    appUrl = `http://127.0.0.1:${actualPort}`;
    await createWindow(legacyState);
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (server) {
    server.close();
  }
});

async function createWindow(legacyState) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: APP_NAME,
    show: false,
    backgroundColor: "#f4f8fb",
    autoHideMenuBar: true,
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("file:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    if (appUrl && url.startsWith(`${appUrl}/`)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
    mainWindow.setTitle(APP_NAME);
  });

  mainWindow.once("ready-to-show", () => {
    showMainWindow();
  });

  await mainWindow.loadURL(`${appUrl}/estimates/index.html`);
  const migrationResult = await migrateLegacyStateIfNeeded(mainWindow, legacyState);
  if (migrationResult.migrated) {
    await mainWindow.reload();
  }
}

function showMainWindow() {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.setSkipTaskbar(false);
  mainWindow.focus();
}

function waitForServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.once("error", reject);
    serverInstance.once("listening", () => {
      const address = serverInstance.address();
      if (!address || typeof address === "string") {
        reject(new Error("ローカルサーバーの起動ポートを取得できませんでした。"));
        return;
      }
      resolve(address.port);
    });
  });
}

async function migrateLegacyStateIfNeeded(window, legacyState) {
  if (!legacyState) {
    return { migrated: false, reason: "legacy-not-found" };
  }
  return window.webContents.executeJavaScript(`
    (() => {
      const key = ${JSON.stringify(STORAGE_KEY)};
      const existing = localStorage.getItem(key);
      if (existing) {
        return { migrated: false, reason: "fixed-origin-already-has-data" };
      }
      localStorage.setItem(key, ${JSON.stringify(JSON.stringify(legacyState))});
      return { migrated: true };
    })();
  `);
}

async function readLegacyLocalStorageState(userDataPath) {
  const levelDbPath = join(userDataPath, "Local Storage", "leveldb");
  let files;
  try {
    files = await readdir(levelDbPath);
  } catch {
    return null;
  }

  const states = [];
  for (const file of files) {
    if (!/\.(log|ldb)$/i.test(file)) {
      continue;
    }
    const buffer = await readFile(join(levelDbPath, file));
    states.push(...extractStatesFromLevelDbBuffer(buffer));
  }

  const legacyStates = states.filter((entry) => entry.origin !== `http://127.0.0.1:${ELECTRON_PORT}`);
  if (!legacyStates.length) {
    return null;
  }
  return mergeEstimateStates(legacyStates.map((entry) => entry.state));
}

function extractStatesFromLevelDbBuffer(buffer) {
  const key = Buffer.from(STORAGE_KEY, "utf8");
  const states = [];
  let position = 0;
  while (position < buffer.length) {
    const keyIndex = buffer.indexOf(key, position);
    if (keyIndex < 0) {
      break;
    }

    const origin = findOriginBefore(buffer, keyIndex);
    const json = extractUtf16JsonAfter(buffer, keyIndex + key.length) || extractUtf8JsonAfter(buffer, keyIndex + key.length);
    if (json) {
      try {
        states.push({ origin, state: JSON.parse(json) });
      } catch {
        // Ignore partial LevelDB records.
      }
    }
    position = keyIndex + key.length;
  }
  return states;
}

function findOriginBefore(buffer, index) {
  const start = Math.max(0, index - 160);
  const prefix = buffer.subarray(start, index).toString("utf8");
  const match = prefix.match(/http:\/\/127\.0\.0\.1:\d+/);
  return match ? match[0] : "";
}

function extractUtf16JsonAfter(buffer, start) {
  const brace = Buffer.from([123, 0, 34, 0]);
  const jsonStart = buffer.indexOf(brace, start);
  if (jsonStart < 0) {
    return "";
  }
  const text = buffer.subarray(jsonStart).toString("utf16le");
  return takeBalancedJson(text);
}

function extractUtf8JsonAfter(buffer, start) {
  const jsonStart = buffer.indexOf(Buffer.from('{"contacts"', "utf8"), start);
  if (jsonStart < 0) {
    return "";
  }
  const text = buffer.subarray(jsonStart).toString("utf8");
  return takeBalancedJson(text);
}

function takeBalancedJson(text) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(0, index + 1);
      }
    }
  }
  return "";
}

function mergeEstimateStates(states) {
  const base = structuredClone(states.reduce((best, state) => {
    const bestScore = scoreState(best);
    const score = scoreState(state);
    return score > bestScore ? state : best;
  }, states[0]));

  base.contacts = mergeByKey(states.flatMap((state) => state.contacts || []), contactKey);
  base.quotes = mergeByKey(states.flatMap((state) => state.quotes || []), quoteKey);

  const stateWithCompany = [...states].reverse().find((state) => state.company);
  if (stateWithCompany?.company) {
    base.company = stateWithCompany.company;
  }

  const stateWithAssets = [...states].reverse().find(
    (state) => state.companyAssets?.logoImage || state.companyAssets?.sealImage,
  );
  if (stateWithAssets?.companyAssets) {
    base.companyAssets = stateWithAssets.companyAssets;
  }

  return base;
}

function scoreState(state = {}) {
  return (state.quotes?.length || 0) * 10 + (state.contacts?.length || 0);
}

function mergeByKey(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    if (!item) {
      continue;
    }
    const key = keyFn(item);
    map.set(key, item);
  }
  return [...map.values()];
}

function contactKey(contact) {
  return [contact.type, contact.name, contact.title, contact.contactPerson].map((value) => String(value || "")).join("\u0001");
}

function quoteKey(quote) {
  return String(quote.quoteNumber || quote.id || "");
}
