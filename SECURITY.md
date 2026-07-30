# Security

脆弱性はGitHubのPrivate vulnerability reportingから報告してください。学習内容や個人情報を公開Issueへ貼らないでください。

## 境界

- CSP、同一オリジン確認、JSON限定、1KB上限で匿名イベントAPIを制限
- イベント名は固定許可リスト、セッションIDはUUID v4だけを受理
- 教材・学習内容を受け取るAPIを持たない
- IndexedDBは教材20件、学習記録3,000件に制限
- 読み込みは2MB以下、形式、版、キー、件数、UUID、参照、値域を検証
- 表示は`textContent`で構築し、入力値をHTMLとして解釈しない
- CSVの`=`, `+`, `-`, `@`開始値を無害化
- Permissions Policyでカメラ、位置情報、マイク、決済を無効化
- `frame-ancestors 'none'`と`X-Frame-Options: DENY`で埋め込みを拒否

机の灯は学習成果、試験合格、教材の正確性、健康上適切な学習時間を判断しません。
