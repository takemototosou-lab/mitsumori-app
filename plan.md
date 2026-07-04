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
