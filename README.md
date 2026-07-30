# 机の灯

教材別タイマー、週の目安、学習の偏り、12週間の積み重ねを、登録や公開なしで端末内へ残すローカルファーストの学習机です。

## できること

- 教材・科目を20件まで、背表紙の色と週の目安つきで登録
- 計測、25分、50分、90分のタイマーと過去分の手入力
- 今日・今週・継続日、一週間の棚、教材別バランス、12週間の灯りを表示
- 学習時間、進んだ量、手ごたえ、次に開く場所を最大3,000件保存
- formula-safe CSV、印刷/PDF、共有用PNG、編集用`.tsukue`を生成
- 端末内のIndexedDBへ保存し、教材名や学習メモをサーバーへ送らない

アカウント、SNS、ランキング、広告、通知、学校情報、決済は持ちません。Studyplus等の学習SNS全体を置き換えるものではなく、公開せず個人で記録したい場面に絞っています。

## 開発

Node.js 24とnpm 11を使用します。

```powershell
npm install
npm run check
npm test
npm run build
npm run release:check
```

ローカル起動:

```powershell
npm run dev
```

公開前に`wrangler.jsonc`へD1の`database_id`を設定し、次を実行します。

```powershell
npx wrangler d1 migrations apply tsukue-no-hi --remote
npm run deploy
npm run indexnow
```

本番メトリクス:

```powershell
npm run metrics
```

## 公開先

- Web: <https://tsukue-no-hi.yhay81.com/>
- 保存先と計測: [PRIVACY.md](PRIVACY.md)
- 30日検証: [EXPERIMENT.md](EXPERIMENT.md)

## License

[MIT](LICENSE)
