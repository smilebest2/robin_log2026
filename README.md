# robin_log2026

Xアカウント `@robin_log2026` の完全自動運用実験。

## 目的

- 投稿のみで伸びるか
- 交流込みで伸びるか
- 半年放置でどうなるか

## フェーズ1

- 1日3投稿
- 日本時間 08:00 / 12:00 / 20:00
- 投稿テーマ: 心理、行動、習慣、思考、人間観察
- 文字数: 50〜120文字
- 投稿文は事前作成文を使用
- 絵文字を自然に1個だけ入れる
- 夜投稿前だけ相手から来た返信/メンションを確認し、未返信なら固定文で最大2件返信
- 投稿後1〜2分のランダム待機後、自分の投稿へ固定文で1件自己リプ
- 過去30日以内の類似文章を避ける
- 実行ログはGitHub上の `logs/posts.jsonl` に保存
- 返信ログはGitHub上の `logs/replies.jsonl` に保存

現在は初期運用として、`data/prewritten-posts.jsonl` の事前作成文を投稿します。`POST_SOURCE=ai` に変えるとOpenAI APIで毎回生成します。

Xへの処理は朝昼夜の投稿workflow内に集約しています。別のメンション監視workflowはありません。メンション取得は夜投稿前だけ行います。

固定返信文:

- 自己リプ: `世界が平和でありますように`
- 相手から来た返信/メンションへの返信: `ありがとうございます！`

## あなたがすること

1. X Developer Portalで `@robin_log2026` 用の投稿権限つきAPIキーを用意する
2. GitHubリポジトリを作成して、このプロジェクトをpushする
3. GitHub Actions SecretsにX認証情報を登録する
4. まず `npm run preview:prewritten` で文体を確認する

## 必要なGitHub Secrets

GitHubリポジトリの `Settings -> Secrets and variables -> Actions` に以下を登録します。

| Secret | 用途 |
| --- | --- |
| `X_APP_KEY` | OAuth1.0 Consumer Key |
| `X_APP_SECRET` | OAuth1.0 Consumer Secret |
| `X_ACCESS_TOKEN` | OAuth1.0 Access Token |
| `X_ACCESS_SECRET` | OAuth1.0 Access Token Secret |

GitHub Secretsでは、以下の別名も使えます。

| 取得済みの名前 | 推奨Secret名 | 別名 |
| --- | --- | --- |
| Consumer Key | `X_APP_KEY` | `X_CONSUMER_KEY` |
| Consumer Secret | `X_APP_SECRET` | `X_CONSUMER_SECRET` |
| Access Token | `X_ACCESS_TOKEN` | なし |
| Access Token Secret | `X_ACCESS_SECRET` | `X_ACCESS_TOKEN_SECRET` |

事前作成文モードでは `OPENAI_API_KEY` は不要です。GitHub Actionsで事前作成文を使う場合は、Repository Variablesに `POST_SOURCE=prewritten` を設定します。未指定でも `prewritten` として動きます。

交流処理のRepository Variables:

| Variable | 既定値 | 用途 |
| --- | --- | --- |
| `INBOUND_REPLY_ENABLED` | `1` | 夜投稿前のメンション返信を有効化 |
| `INBOUND_REPLY_SLOT` | `20:00` | メンション確認を行う投稿枠 |
| `INBOUND_REPLY_LIMIT` | `2` | 1回の投稿前に返すメンション返信数 |
| `SELF_REPLY_ENABLED` | `1` | 投稿後の自己リプを有効化 |
| `SELF_REPLY_DELAY_MIN_MS` | `60000` | 自己リプまでの最短待機 |
| `SELF_REPLY_DELAY_MAX_MS` | `120000` | 自己リプまでの最長待機 |

## ローカル設定

`.env.example` を参考に `.env` を作ると、ローカルでも確認できます。

```bash
npm install
npm run check:setup
```

## 品質確認

事前作成済みの10日分を確認します。

```bash
npm run preview:prewritten
```

OpenAI APIで候補生成を確認する場合:

```bash
npm run preview
```

## 手動テスト

投稿せず、ログにも残さず、当日の投稿文を確認します。

```bash
npm run dry-run
```

事前作成文の指定日・指定時刻を確認する場合:

```powershell
$env:POST_DATE="2026-06-09"
$env:POST_TIME="08:00"
npm run dry-run
```

実投稿します。

```bash
npm run post
```

## ログ形式

`logs/posts.jsonl` に1投稿1行のJSONで保存します。

```json
{"date":"2026-06-09","time":"08:00","post":"朝にやることを減らすと、意志の強さより仕組みで動ける。最初の一歩を小さく決めるだけで、一日が少し軽くなる🌱","tweetId":"...","createdAt":"2026-06-08T23:00:00.000Z","mode":"live","source":"prewritten"}
```

`logs/replies.jsonl` に返信ログを保存します。

## 補足

GitHub Actions のcronはUTCで動くため、日本時間に合わせて以下で設定しています。

- 08:00 JST -> 23:00 UTC 前日
- 12:00 JST -> 03:00 UTC
- 20:00 JST -> 11:00 UTC
