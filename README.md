# 竹本塗装店 見積アプリ

竹本塗装店向けの見積書作成アプリです。

## 目的

- 宛先、見積履歴、会社情報を管理する
- Excel提出用テンプレートへ見積データを流し込む
- PDFとxlsxをデスクトップの `見積書` フォルダへ整理して保存する
- JSONバックアップで別PC移行や復元に備える

## 通常利用

Windowsアプリ版は、生成されたインストーラーを実行して使います。

```text
release/竹本塗装店 見積アプリ Setup 0.1.0.exe
```

インストール後は、デスクトップまたはスタートメニューの `竹本塗装店 見積アプリ` から起動します。

## 既存の開発起動

従来どおり、開発中はBATからも起動できます。

```text
見積アプリを起動.bat
```

起動後、ブラウザで次のURLが開きます。

```text
http://127.0.0.1:4188/estimates/index.html
```

## Windowsアプリとして開発起動

```text
npm.cmd run app:dev
```

ブラウザではなく、専用のElectronウィンドウで開きます。

## インストーラー作成

```text
npm.cmd run dist:win
```

成果物は `release/` に出力されます。`release/` は生成物のためGit管理対象外です。

## 必要条件

- Windows
- Microsoft Excel
  - ExcelテンプレートからPDFを作るために必要です。
- Python
  - 現在のExcelテンプレート流し込み処理は `openpyxl` と `Pillow` を使うPythonスクリプトで動作します。
  - 現時点のインストーラーはPythonランタイムを同梱していません。
- Node.js
  - 開発・ビルド時に必要です。
  - インストール済みアプリの通常起動では、利用者がNode.jsを直接操作する必要はありません。

## 保存先

PDFとxlsxは、Windowsのデスクトップ配下へ保存されます。

```text
デスクトップ\見積書\法人\＜宛名＞\＜発行年＞
デスクトップ\見積書\個人\＜氏名＞\＜発行年＞
```

同名ファイルがある場合は `_再出力1` のように連番を付け、上書きしません。

## バックアップと移行

設定画面からJSONバックアップを作成・復元できます。

別PCへ移行する時は、次の順で行います。

1. 新PCへアプリをインストールする
2. 旧PCで作成したバックアップJSONを復元する
3. 必要に応じてデスクトップの `見積書` フォルダをコピーまたはOneDrive同期する

## 主な構成

- `electron/`: Windowsアプリ版の起動処理
- `estimates/`: 見積作成画面、計算ロジック、テスト
- `server.mjs`: ローカルサーバーとPDF生成API
- `scripts/`: Excelテンプレート流し込み、PDF変換、フォールバックPDF生成
- `templates/御見積書_提出用テンプレート.xlsx`: 提出用Excelテンプレート
- `templates/takemoto-seal.png`: 提出用印鑑画像
- `outputs/`: 生成PDF・ログ置き場（Git管理対象外）
- `release/`: インストーラー生成物（Git管理対象外）

## アイコン

アプリ用アイコンは次の場所に配置しています。

```text
assets/mitsumori-app-icon.ico
assets/mitsumori-app-icon.png
```

Windowsアプリ本体、インストーラー、デスクトップショートカット、スタートメニューショートカットは、このアイコンを使います。

## 確認済みのインストール結果

現在PCでは、インストーラーから次の場所へインストールされることを確認しています。

```text
C:\Users\takem\AppData\Local\Programs\mitsumori-app
```

作成されるショートカット:

```text
デスクトップ\竹本塗装店 見積アプリ.lnk
スタートメニュー\竹本塗装店 見積アプリ.lnk
```

インストール済みアプリからPDFとxlsxを生成し、デスクトップの `見積書` フォルダへ保存されることを確認しています。

## テスト

```text
npm.cmd test
git diff --check
```
