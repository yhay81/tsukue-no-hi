# Stack

- Cloudflare Workers
- Hono + Hono JSX
- Vite+
- TypeScript
- IndexedDB + localStorage
- Cloudflare D1（匿名イベントだけ）
- Vitest + Miniflare
- oxlint + oxfmt

Better Authは不要です。教材、学習記録、目標をサーバーへ保存せず、一人・一端末で登録なしに使う境界だからです。外部フォント、広告SDK、解析SDKも追加しません。

## 配信

`tsukue-no-hi.yhay81.com`をCloudflare WorkerのCustom Domainとして設定します。静的アセットはWorkers Assetsで配信し、HTMLと匿名イベントAPIをHonoが処理します。

## 保持

コンテンツは端末内だけに保持します。D1イベントは45日で削除し、`is_qa = 1`を本番指標から除外します。
