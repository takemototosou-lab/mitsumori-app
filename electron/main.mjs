import { app, BrowserWindow, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";

const APP_NAME = "竹本塗装店 見積アプリ";
const DEFAULT_PORT = 0;
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = app.isPackaged ? app.getAppPath() : join(__dirname, "..");

let server;
let mainWindow;
let appUrl;

app.setName(APP_NAME);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.whenReady().then(async () => {
  process.chdir(projectRoot);
  server = startServer({ rootDir: projectRoot, port: DEFAULT_PORT, silent: true });
  const actualPort = await waitForServer(server);
  appUrl = `http://127.0.0.1:${actualPort}`;
  await createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (server) {
    server.close();
  }
});

async function createWindow() {
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
    mainWindow.show();
  });

  await mainWindow.loadURL(`${appUrl}/estimates/index.html`);
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
