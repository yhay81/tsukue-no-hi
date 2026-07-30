# Metrics

D1へ保存するのは、ランダムUUIDのセッションID、JST日付、発生時刻、QAフラグ、次の許可済みイベント名だけです。

| イベント           | 意味                           |
| ------------------ | ------------------------------ |
| `visited`          | 記録画面を開いた               |
| `material_created` | 教材を初めて保存した           |
| `timer_completed`  | タイマーから学習記録を追加した |
| `session_added`    | 手入力で学習記録を追加した     |
| `review_opened`    | 12週間の振り返りを開いた       |
| `share_card_saved` | 学習札を保存した               |
| `printed`          | 印刷・PDFを開始した            |
| `project_exported` | 編集用ファイルを保存した       |
| `project_imported` | 編集用ファイルを読み込んだ     |
| `returned`         | 別の日に再訪した               |

教材名、教材数、学習時間、進んだ量、手ごたえ、メモ、目標、ファイル名、IP、User-Agentはイベント表へ保存しません。

## 主要指標

- `material_creators`: 教材を作成した人数
- `study_recorders`: タイマーまたは手入力で記録した人数
- `five_records_three_days`: 3日以上、合計5件以上記録した人数
- `users_spanning_7d`: 最初と最後のイベント日が7日以上離れた人数
- `reviewers`: 12週間の振り返りを開いた人数
- `share_card_users` / `printers` / `exporters`: 持ち出し経路の利用人数

`is_qa = 1`は全指標から除外します。イベントは45日を超えた時点で日次削除します。

```powershell
npm run metrics
npm run metrics -- --Local
```
