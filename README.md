# mitsumori-app

竹本塗装店向けの見積書作成アプリです。

## 起動方法

`見積アプリを起動.bat` をダブルクリックします。

起動後、ブラウザで次のURLが開きます。

```text
http://127.0.0.1:4188/estimates/index.html
```

## 主な構成

- `estimates/`: 見積作成画面、計算ロジック、テスト
- `server.mjs`: ローカルサーバーとPDF生成API
- `scripts/`: Excelテンプレート流し込み、PDF変換、フォールバックPDF生成
- `templates/御見積書_提出用テンプレート.xlsx`: 提出用Excelテンプレート
- `templates/takemoto-seal.png`: 提出用印鑑画像
- `outputs/`: 生成PDF・ログ置き場（Git管理対象外）

## テスト

```text
npm.cmd test
```
