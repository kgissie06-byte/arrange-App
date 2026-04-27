# Game Tracker

ゲームの育成・援軍管理アプリ。Node.js + Supabase + Fly.io 構成。

---

## 📐 アーキテクチャ

```
GitHub → Fly.io (Node.js/Express) → Supabase (PostgreSQL)
```

---

## 🚀 セットアップ手順

### 1. Supabase のセットアップ

1. [supabase.com](https://supabase.com) でプロジェクト作成
2. **SQL Editor** を開き `supabase_schema.sql` の内容をすべてコピーして実行
3. **Settings → API** から以下をメモ：
   - `Project URL` → `SUPABASE_URL`
   - `anon public` キー → `SUPABASE_ANON_KEY`

### 2. GitHub リポジトリ作成

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/game-tracker.git
git push -u origin main
```

### 3. Fly.io へデプロイ

#### Fly CLI インストール（未インストールの場合）

```bash
# macOS
brew install flyctl

# Linux / WSL
curl -L https://fly.io/install.sh | sh
```

#### ログイン & アプリ作成

```bash
flyctl auth login
flyctl launch          # プロンプトに従って設定（リージョン: nrt 推奨）
```

#### 環境変数（シークレット）をセット

```bash
flyctl secrets set SUPABASE_URL="https://xxxx.supabase.co"
flyctl secrets set SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### デプロイ

```bash
flyctl deploy
```

デプロイ完了後、表示される URL にアクセスすれば動作確認できます。

---

## 🔄 以降の更新デプロイ

```bash
git add .
git commit -m "update"
git push
flyctl deploy          # または GitHub Actions で自動化も可能
```

---

## 📁 ファイル構成

```
game-tracker/
├── server.js              # Express API サーバー
├── package.json
├── Dockerfile
├── fly.toml               # Fly.io 設定
├── supabase_schema.sql    # DB テーブル定義（Supabase で実行）
├── .gitignore
└── public/
    └── index.html         # フロントエンド（シングルページ）
```

---

## 🌐 API エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/init` | 全データ取得（起動時） |
| POST | `/api/members` | メンバー追加 |
| PUT | `/api/members/:id` | メンバー更新 |
| DELETE | `/api/members/:id` | メンバー削除 |
| POST | `/api/training` | 育成データ保存 |
| POST | `/api/chars` | キャラ追加 |
| PUT | `/api/chars/:name` | キャラ更新 |
| DELETE | `/api/chars/:name` | キャラ削除 |
| POST | `/api/reinf` | 援軍行追加 |
| PUT | `/api/reinf/:id` | 援軍行更新 |
| DELETE | `/api/reinf/:id` | 援軍行削除 |

---

## ローカル開発

```bash
npm install
# .env ファイルを作成
echo 'SUPABASE_URL=https://xxxx.supabase.co' > .env
echo 'SUPABASE_ANON_KEY=eyJ...' >> .env
npm run dev
# → http://localhost:3000
```

> `.env` の読み込みは `node --env-file=.env server.js` または `dotenv` パッケージで対応してください。
