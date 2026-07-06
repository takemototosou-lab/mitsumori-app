# 見積アプリ plan.md

## 現状

- `paint-material-system` から見積アプリを独立プロジェクトとして分離。
- アプリ本体は `estimates/` に配置。
- 起動は `見積アプリを起動.bat` をダブルクリックして、ローカルサーバーを起動し `http://127.0.0.1:4188/estimates/index.html` を開く。
- 提出用PDFはアプリデータを `server.mjs` の `/api/estimates/pdf` へ送り、Excelテンプレート `templates/御見積書_提出用テンプレート.xlsx` に流し込んで生成する。
- `templates/takemoto-seal.png` は提出用テンプレートPDFに必要な印鑑画像。
- `outputs/` はPDF、HTML、ログなどの生成物置き場でGit管理しない。

## 分離時の方針

- 材料表アプリの `data/`、`src/`、`public/`、材料表用 `app.js`、`styles.css`、`index.html` は持ち込まない。
- 見積アプリ専用の `package.json` を作り、材料表用検証スクリプトは含めない。
- 元リポジトリから見積関連を外す作業は、独立側の動作確認後に別コミットで行う。

## 次の確認候補

1. 独立フォルダで `npm.cmd test` を通す。
2. 起動BATでアプリが開くことを確認する。
3. Excelテンプレート経由PDFが独立フォルダの `outputs/` に生成されることを確認する。
4. GitHubに新規リポジトリを作成し、初回pushする。
5. `paint-material-system` から見積関連ファイルを外す。
## 2026-07-05 バックアップ／復元機能

### 現状確認

- 見積アプリの保存データは localStorage の `takemoto-estimates:v1` に集約されている。
- 保存データは `contacts`、`quotes`、`company`、`companyAssets` に分離されている。
- 見積履歴、明細、宛先マスター、会社情報、ロゴ画像、印鑑画像はこの保存データから復元できる。
- `outputs/` のPDF、xlsx、ログは生成物のためバックアップ対象外。

### 実装内容

- `estimates/quote-backup.js` を追加し、バックアップJSON作成、形式検証、概要作成、置き換え復元、追加復元を実装した。
- バックアップJSONは `app: "mitsumori-app"`、`backupVersion: 1`、`createdAt`、`data` を持つ形式にした。
- 追加復元では、既存の見積ID、宛先ID、明細IDを上書きせず、重複時は新しいIDへ付け替える。
- 設定画面に「バックアップ／復元」欄を追加した。
- `データをバックアップ` で現在編集中の見積を保存してから `mitsumori-backup-YYYY-MM-DD.json` をダウンロードする。
- `バックアップを復元` でJSONを選択し、概要確認後に「現在のデータを置き換える」または「現在のデータへ追加する」を選べるようにした。

### 確認結果

- `npm.cmd test`: 成功。バックアップテスト5件を含む17件通過。
- `git diff --check`: 成功。
- ブラウザで設定画面にバックアップ欄、復元ファイル選択、置き換え／追加の選択肢が表示されることを確認した。

### 注意点

- ブラウザのダウンロード保存先はユーザー環境に依存する。
- 復元時の置き換えは強い確認を出すが、誤操作対策として定期的にバックアップファイルを別名保存する運用が望ましい。
- exe化前に、localStorageからアプリ専用データフォルダへの移行方針を決める必要がある。
## 2026-07-05 見積PDF・Excelのデスクトップ保存先整理

### 現状確認

- ExcelテンプレートPDF出力は `server.mjs` の `/api/estimates/pdf` で処理している。
- 従来は通常出力のPDF、xlsx、JSONを `outputs/` に保存していた。
- `outputs/` はログや一時生成物も置くため、提出用見積書の通常保存先としては分かりにくかった。

### 実装内容

- Windowsの実デスクトップパスを `[Environment]::GetFolderPath('Desktop')` で取得するようにした。
- Excelテンプレート出力時のPDFとxlsxを、デスクトップ配下の `見積書` フォルダへ保存するようにした。
- 保存先は `見積書/法人または個人/宛名/発行年` に自動整理する。
- 宛名フォルダから `御中`、`様`、`殿` を除外するようにした。
- ファイル名は `見積番号_件名または現場名_見積書.pdf/xlsx` とした。
- Windowsで使えない文字は `_` に置換する。
- 同名ファイルがある場合は `_再出力1`、`_再出力2` の連番を付け、黙って上書きしない。
- PDF出力後、画面に保存先フォルダを表示し、`保存先フォルダを開く` ボタンを追加した。
- `outputs/` はJSONやHTML/ReportLabフォールバックの一時出力先として残した。

### 確認結果

- `npm.cmd test`: 成功。保存先パス生成テスト4件を含む21件通過。
- `git diff --check`: 成功。
- 保存先生成ロジックで、法人、個人、禁止文字置換、同名ファイル時の再出力連番を確認した。

### 注意点

- Excelテンプレート出力以外のHTML/ReportLabフォールバックは従来どおり `outputs/` を使用する。
- 実際のPDF生成にはExcel COMが必要なため、Excel未導入PCでは従来どおりフォールバック経路になる可能性がある。
- exe化時は、保存先フォルダを開く処理をアプリ内APIまたはネイティブ機能へ置き換える余地がある。

## 2026-07-05 デスクトップ保存の実画面確認

### 確認結果

- 実アプリ画面から法人宛の見積を作成・保存し、PDF出力で `C:\Users\takem\OneDrive\Desktop\見積書\法人\手動確認法人株式会社\2026` にPDFとxlsxが保存されることを確認した。
- 同じ法人見積を再出力し、既存ファイルを上書きせず `_再出力1` 付きのPDFとxlsxが同じフォルダへ保存されることを確認した。
- 実アプリ画面から個人宛の見積を作成・保存し、PDF出力で `C:\Users\takem\OneDrive\Desktop\見積書\個人\確認 花子\2026` にPDFとxlsxが保存されることを確認した。
- `保存先フォルダを開く` ボタンが保存先表示後に有効になり、対象フォルダを開くAPIがエラーなく完了することを確認した。

### 追加修正

- `保存先フォルダを開く` ボタンと保存先表示欄を画面初期化対象へ追加した。
- ExcelテンプレートPDF出力後に保存先表示を更新するよう修正した。
- Windowsのデスクトップ取得で `[Environment]::GetFolderPath('Desktop')` が空の場合、ユーザーシェルフォルダ設定を参照するフォールバックを追加した。

### 確認コマンド

- `npm.cmd test`: 成功。21件通過。
- `git diff --check`: 成功。

## 2026-07-05 Windowsアプリ化・インストーラー作成

### 採用方式

- Electronを採用した。
- 理由は、既存のHTML / CSS / JavaScript資産、`server.mjs`、Excel COM、PowerShell、Pythonスクリプトを最小変更で流用しやすいため。
- Tauriは配布サイズ面では有利だが、現状のNodeサーバーと既存スクリプト構成を維持するにはElectronの方が安全と判断した。

### 実装内容

- `electron/main.mjs` を追加し、専用Windowsウィンドウで見積アプリを開くようにした。
- `server.mjs` を、従来の `node server.mjs` 起動とElectron内部起動の両方に対応させた。
- Electron版は空きポートを自動選択するため、既存の4188番サーバーが動いていても起動しやすい。
- アプリ名は `竹本塗装店 見積アプリ` にした。
- `npm.cmd run app:dev` で開発用Windowsアプリ起動、`npm.cmd run dist:win` でNSISインストーラーを生成する構成にした。
- `release/`、`dist/`、インストーラーexe、blockmapなどの生成物をGit管理対象外にした。

### 生成物

- `release/竹本塗装店 見積アプリ Setup 0.1.0.exe`
- `release/win-unpacked/竹本塗装店 見積アプリ.exe`

### 確認済み

- `npm.cmd test`: 成功。21件通過。
- `git diff --check`: 成功。
- `npm.cmd run dist:win`: 成功。
- `release/win-unpacked/竹本塗装店 見積アプリ.exe` の起動を確認。
- Electron内部のローカルPDF APIヘルスチェック `/api/estimates/pdf/health` が `{"ok":true}` を返すことを確認。

### 2026-07-05 実インストール確認

- 受け取った青い見積アプリアイコンを `assets/mitsumori-app-icon.png` と `assets/mitsumori-app-icon.ico` に保存した。
- Electron Builderの `build.win.icon` へ `assets/mitsumori-app-icon.ico` を指定した。
- `npm.cmd run dist:win` でアイコン反映済みの `release/竹本塗装店 見積アプリ Setup 0.1.0.exe` を再生成した。
- 生成済みインストーラーを現在PCへインストールした。
- インストール先は `C:\Users\takem\AppData\Local\Programs\mitsumori-app`。
- デスクトップショートカット `C:\Users\takem\OneDrive\Desktop\竹本塗装店 見積アプリ.lnk` を確認した。
- スタートメニューショートカット `C:\Users\takem\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\竹本塗装店 見積アプリ.lnk` を確認した。
- 両ショートカットは `竹本塗装店 見積アプリ.exe,0` をアイコンとして参照している。
- ショートカットからインストール済みアプリを起動し、黒いコマンド画面ではなく専用ウィンドウで開くことを確認した。
- インストール済みアプリの内部PDF APIから、`C:\Users\takem\OneDrive\Desktop\見積書\法人\インストール確認株式会社\2026` にPDFとxlsxが保存されることを確認した。
- 保存先フォルダを開くAPIが成功することを確認した。
- 生成PDFを既定ビューアで開けることを確認した。実プリンターへの印刷送信は行っていない。

### 残る注意点

- 現時点のインストーラーはPythonランタイムを同梱していない。Excelテンプレート流し込みにはPython、`openpyxl`、`Pillow` が必要。
- PDF化にはMicrosoft Excel COMが必要。Excel未導入PCではPDF出力が動かない可能性がある。
- `asar: false` でパッケージしている。PythonスクリプトやExcelテンプレートを外部プロセスから参照しやすくするための暫定判断。

## 2026-07-05 Electron版localStorage消失表示の修正

### 原因

- Electron版で内部サーバーのポートを `0` にしていたため、起動ごとに `http://127.0.0.1:xxxxx` のポートが変わっていた。
- `localStorage` は origin 単位で保存されるため、ポート変更により宛先・見積履歴・会社情報が消えたように見えていた。
- Electron userData 配下には旧ランダムポートのデータが残っており、実データは削除されていなかった。

### 安全対策

- 修正前に `C:\Users\takem\AppData\Roaming\竹本塗装店 見積アプリ` を `outputs/electron-userData-backup-20260705-213707` へ退避した。
- userData、既存localStorage、見積履歴、宛先、会社情報の削除や初期化は行っていない。

### 実装内容

- Electron版の内部サーバーポートを `4189` に固定した。
- 旧ランダムポートoriginに残っている `takemoto-estimates:v1` を読み取り、4189側が空の場合だけ一度注入する救出処理を追加した。
- 旧データは上書き削除せず、宛先と見積を重複しにくいキーで統合する形にした。
- 4189側に既存データがある場合は、救出処理で上書きしない。

### 確認結果

- 開発版Electronを3回再起動し、すべて `4189` で起動することを確認した。
- インストーラーを再生成して現在PCへ再インストールし、インストール版でも3回再起動してすべて `4189` で起動することを確認した。
- 4189側localStorageに `takemoto-estimates:v1`、旧宛先 `八房建設`、`ワンベスト`、旧見積番号 `TKM-2026-001` が含まれることを確認した。
- `npm.cmd test`: 成功。21件通過。
- `git diff --check`: 成功。
## 2026-07-05 明細入力欄の列幅調整

### 現状確認

- 見積作成画面の明細入力は `estimates/styles.css` の `.items-table` で列幅を固定配分している。
- 数量、単位、単価、金額、操作列が細く、単価や金額の桁数が増えた時に入力・確認しづらい。
- 工事項目も塗装工事名が長くなりやすく、現状の幅では余裕が少ない。

### 修正内容

- 右側の金額サマリーパネルを 300px から 280px に縮め、明細入力側の横幅を少し広げた。
- 工事項目列を 15% から 18% に広げた。
- 数量、単価、金額列を広げ、金額系の入力・確認に余裕を持たせた。
- 操作列を 13% から 10% に縮め、入力欄側へ幅を回した。
- 明細テーブル内の input / textarea の左右余白を少し詰め、同じ列幅でも入力できる文字数を増やした。
- 明細パネル自体を左カラム内ではなく画面横幅いっぱいに広げた。
- 右側の金額パネルがスクロール時に明細へ被らないよう、固定表示を解除した。
- 金額パネルを右側固定ではなく明細入力の下へ移し、横長レイアウトに変更した。
- 左ナビゲーション幅を 220px から 190px に縮め、作業領域を広げた。

### 確認結果

- `npm.cmd test`: 成功。21件通過。
- `git diff --check`: 成功。LF/CRLF 警告のみ。
- 計算ロジック、保存、PDF出力処理は変更していない。
- 開発用ブラウザで明細テーブルが全幅表示になり、右側の金額パネルが明細へ被らないことを確認した。
- 開発用ブラウザで、明細パネル幅が約 1039px、明細テーブル幅が約 1009px になったことを確認した。

## 2026-07-07 4189固定と救出処理の反映確認

### 確認結果

- 4189固定と旧ランダムポートlocalStorage救出処理は `71b50d7 fix: Electron版の保存先ポートを固定` に含まれている。
- `bb8aa6b fix: 起動表示と明細入力レイアウトを改善` は `71b50d7` の上に積まれているため、GitHubの最新 `main` には4189固定、救出処理、起動表示改善、明細レイアウト改善がすべて含まれる。
- インストール済みアプリの `resources/app/electron/main.mjs` にも `ELECTRON_PORT = 4189` と旧localStorage救出処理が含まれていることを確認した。

### 追加修正

- 4189が使用中で起動できない場合に、ランダムポートへ逃げず、起動エラー画面を表示する処理を追加した。
- 旧ランダムポートlocalStorageの救出前に、Electron userDataを `デスクトップ/見積書/バックアップ/electron-userData-backup-before-4189-migration` へ一度だけ退避する処理を追加した。
- 既存の手動救出バックアップ `デスクトップ/見積書/バックアップ/electron-userData-backup-20260705-213707` も保持している。

### 確認コマンド

- `npm.cmd test`: 成功。21件通過。
- `git diff --check`: 成功。LF/CRLF 警告のみ。
