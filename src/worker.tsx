import { Hono } from "hono";
import type { Child } from "hono/jsx";
import { requestId } from "hono/request-id";

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
};

type Variables = { requestId: string };
type AppContext = Parameters<Parameters<typeof app.use>[1]>[0];

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const canonicalOrigin = "https://tsukue-no-hi.yhay81.com";
const eventLifetime = 45 * 86400;
const eventNames = new Set([
  "visited",
  "material_created",
  "timer_completed",
  "session_added",
  "review_opened",
  "share_card_saved",
  "printed",
  "project_exported",
  "project_imported",
  "returned",
]);
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const nowSeconds = () => Math.floor(Date.now() / 1000);
const jstDay = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const securityHeaders = async (c: AppContext, next: () => Promise<void>) => {
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; manifest-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'",
  );
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=()");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
};

const Layout = ({
  canonical,
  children,
  description,
  script,
  title,
}: {
  canonical: string;
  children: Child;
  description: string;
  script?: string;
  title: string;
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta content="width=device-width, initial-scale=1" name="viewport" />
      <meta content="#17233a" name="theme-color" />
      <meta content={description} name="description" />
      <meta content={description} property="og:description" />
      <meta content={`${canonicalOrigin}/og.svg`} property="og:image" />
      <meta
        content="夜の机にランプが灯り、教材の本と一週間の学習記録が積み上がる机の灯"
        property="og:image:alt"
      />
      <meta content="ja_JP" property="og:locale" />
      <meta content={title} property="og:title" />
      <meta content="website" property="og:type" />
      <meta content={canonical} property="og:url" />
      <meta content="summary_large_image" name="twitter:card" />
      <link href={canonical} rel="canonical" />
      <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      <link href="/manifest.webmanifest" rel="manifest" />
      <link href="/styles.css" rel="stylesheet" />
      {script ? <script src={script} type="module"></script> : null}
      <title>{title}</title>
    </head>
    <body>
      <a class="skip-link" href="#main">
        本文へ移動
      </a>
      <header class="site-header">
        <a class="brand" href="/" aria-label="机の灯 ホーム">
          <span class="brand-lamp" aria-hidden="true">
            <i></i>
          </span>
          <span>机の灯</span>
        </a>
        <nav aria-label="メイン">
          <a href="/guide">使い方</a>
          <a href="/privacy">保存先</a>
        </nav>
      </header>
      {children}
      <footer>
        <span>机の灯</span>
        <span>学んだ時間が、机に灯る</span>
      </footer>
    </body>
  </html>
);

const MaterialForm = () => (
  <form class="material-form" data-material-form>
    <input name="materialId" type="hidden" />
    <label>
      教材・科目
      <input maxlength={48} name="name" placeholder="英単語帳 / 宅建 過去問" required />
    </label>
    <div class="field-pair">
      <label>
        背表紙の色
        <select name="color">
          <option value="amber">琥珀</option>
          <option value="blue">青</option>
          <option value="green">緑</option>
          <option value="rose">赤</option>
          <option value="violet">紫</option>
          <option value="slate">墨</option>
        </select>
      </label>
      <label>
        1週間の目安
        <span class="input-suffix">
          <input max={10080} min={0} name="weeklyGoal" step={15} type="number" value="180" />
          <span>分</span>
        </span>
      </label>
    </div>
    <label>
      進み方の単位
      <input maxlength={16} name="unit" placeholder="ページ / 問 / 章" />
    </label>
    <button class="primary-button" type="submit">
      <span class="button-glow" aria-hidden="true"></span>
      <span data-material-submit-label>机に一冊置く</span>
    </button>
    <p class="form-state" data-material-state></p>
  </form>
);

const SessionForm = () => (
  <form class="session-form" data-session-form>
    <label>
      教材・科目
      <select name="materialId" required data-session-material></select>
    </label>
    <div class="field-pair">
      <label>
        日付
        <input name="date" required type="date" />
      </label>
      <label>
        始めた時刻
        <input name="startedTime" type="time" />
      </label>
    </div>
    <div class="field-pair">
      <label>
        学んだ時間
        <span class="input-suffix">
          <input max={1440} min={1} name="minutes" required type="number" value="25" />
          <span>分</span>
        </span>
      </label>
      <label>
        進んだ量
        <input max={99999} min={0} name="quantity" step="0.1" type="number" />
      </label>
    </div>
    <fieldset class="focus-field">
      <legend>手ごたえ</legend>
      <label>
        <input name="focus" type="radio" value="1" />
        <span>重い</span>
      </label>
      <label>
        <input checked name="focus" type="radio" value="2" />
        <span>普通</span>
      </label>
      <label>
        <input name="focus" type="radio" value="3" />
        <span>進んだ</span>
      </label>
    </fieldset>
    <label>
      次に開く場所
      <textarea
        maxlength={240}
        name="note"
        placeholder="第4章の例題3から / 間違えた問12を解き直す"
      ></textarea>
    </label>
    <button class="primary-button" type="submit">
      <span class="button-glow" aria-hidden="true"></span>
      <span>一段積む</span>
    </button>
    <p class="form-state" data-session-state></p>
  </form>
);

const TargetForm = () => (
  <form class="target-form" data-target-form>
    <label>
      目標の名前
      <input maxlength={48} name="name" placeholder="試験日 / 一冊終える日" />
    </label>
    <label>
      目標日
      <input name="date" type="date" />
    </label>
    <label>
      全教材を合わせた週の目安
      <span class="input-suffix">
        <input max={10080} min={0} name="weeklyGoal" step={30} type="number" value="420" />
        <span>分</span>
      </span>
    </label>
    <button class="primary-button" type="submit">
      机の目印を置く
    </button>
    <p class="form-state" data-target-state></p>
  </form>
);

const DeskScene = () => (
  <div class="desk-scene" aria-hidden="true">
    <div class="scene-wall">
      <div class="scene-window">
        <i></i>
        <i></i>
        <span class="moon"></span>
      </div>
      <div class="lamp-halo"></div>
      <div class="desk-lamp">
        <span class="lamp-shade"></span>
        <span class="lamp-neck"></span>
        <span class="lamp-base"></span>
      </div>
    </div>
    <div class="scene-desk">
      <div class="scene-books">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="scene-notebook">
        <i></i>
        <i></i>
        <i></i>
      </div>
      <div class="scene-clock">
        <span></span>
      </div>
    </div>
  </div>
);

const HomePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/`}
    description="教材別タイマー、週目標、学習の偏り、12週間の積み重ねを、SNSや広告なしで端末内だけに記録する学習机。"
    script="/app.js"
    title="机の灯｜学んだ時間が、机に灯る"
  >
    <main id="main">
      <section class="opening">
        <div class="opening-copy">
          <p class="eyebrow">PRIVATE STUDY DESK</p>
          <h1>机に向かった時間を、灯りと本の高さで残す。</h1>
          <p>
            タイマーを始め、終わったら一段積む。教材ごとの偏りと今週の歩みが、
            開いた瞬間に見える学習机です。
          </p>
          <ul class="opening-points" aria-label="特徴">
            <li>
              <span class="point-lamp" aria-hidden="true"></span>
              登録・公開なし
            </li>
            <li>
              <span class="point-book" aria-hidden="true"></span>
              記録は端末内
            </li>
            <li>
              <span class="point-sheet" aria-hidden="true"></span>
              CSV・編集用保存
            </li>
          </ul>
        </div>
        <DeskScene />
      </section>

      <section class="empty-desk" data-empty-desk>
        <div class="empty-visual" aria-hidden="true">
          <span class="empty-light"></span>
          <span class="empty-lamp"></span>
          <span class="empty-table"></span>
        </div>
        <div class="empty-copy">
          <p class="eyebrow">FIRST BOOK</p>
          <h2>最初の一冊を、机に置く。</h2>
          <p>
            教科名でも、参考書名でも、資格名でも構いません。あとから色と週の目安を変えられます。
          </p>
          <MaterialForm />
        </div>
      </section>

      <section class="study-room" data-study-room hidden>
        <header class="room-header">
          <div>
            <p class="eyebrow">YOUR DESK</p>
            <h2>今日の机</h2>
          </div>
          <div class="header-actions">
            <button class="quiet-button" data-action="open-review" type="button">
              振り返る
            </button>
            <button class="quiet-button" data-action="open-material" type="button">
              教材を置く
            </button>
            <button class="primary-button small" data-action="open-session" type="button">
              手入力で積む
            </button>
          </div>
        </header>

        <div class="room-stats" aria-label="学習集計">
          <article>
            <span>今日</span>
            <strong data-today-minutes>0分</strong>
            <small data-today-sessions>記録なし</small>
          </article>
          <article>
            <span>今週</span>
            <strong data-week-minutes>0分</strong>
            <small data-week-goal>目安を設定できます</small>
          </article>
          <article>
            <span>続いた日</span>
            <strong data-streak>0日</strong>
            <small data-total-days>学習日は0日</small>
          </article>
          <article class="target-stat">
            <span data-target-label>目標日</span>
            <strong data-target-days>未設定</strong>
            <button data-action="open-target" type="button">
              目印を置く
            </button>
          </article>
        </div>

        <div class="desk-grid">
          <section class="timer-desk" aria-labelledby="timer-heading">
            <header>
              <div>
                <p class="eyebrow">FOCUS TIMER</p>
                <h3 id="timer-heading">灯りをつける</h3>
              </div>
              <span class="timer-status" data-timer-status>
                待機中
              </span>
            </header>
            <label class="timer-material-label">
              今開く教材
              <select data-timer-material></select>
            </label>
            <div class="timer-face" data-timer-face>
              <svg aria-hidden="true" viewBox="0 0 120 120">
                <circle class="timer-track" cx="60" cy="60" r="52"></circle>
                <circle class="timer-progress" cx="60" cy="60" r="52" data-timer-progress></circle>
              </svg>
              <div>
                <strong data-timer-clock>00:00</strong>
                <span data-timer-mode-label>計った分だけ積む</span>
              </div>
            </div>
            <div class="timer-modes" aria-label="タイマー時間">
              <button aria-pressed="true" data-timer-minutes="0" type="button">
                計る
              </button>
              <button aria-pressed="false" data-timer-minutes="25" type="button">
                25分
              </button>
              <button aria-pressed="false" data-timer-minutes="50" type="button">
                50分
              </button>
              <button aria-pressed="false" data-timer-minutes="90" type="button">
                90分
              </button>
            </div>
            <div class="timer-actions">
              <button class="primary-button" data-action="timer-start" type="button">
                始める
              </button>
              <button class="quiet-button" data-action="timer-pause" hidden type="button">
                止める
              </button>
              <button class="quiet-button" data-action="timer-finish" disabled type="button">
                記録する
              </button>
              <button class="text-button" data-action="timer-reset" disabled type="button">
                取り消す
              </button>
            </div>
            <p class="timer-note" data-timer-note>
              画面を閉じても開始時刻をこの端末に残します。通知やカメラの許可は求めません。
            </p>
          </section>

          <aside class="bookcase" aria-labelledby="bookcase-heading">
            <header>
              <div>
                <p class="eyebrow">MATERIALS</p>
                <h3 id="bookcase-heading">教材の背表紙</h3>
              </div>
              <span data-material-count>0 / 20</span>
            </header>
            <div class="book-list" data-material-list></div>
          </aside>
        </div>

        <div class="review-grid">
          <section class="week-shelf" aria-labelledby="week-heading">
            <header>
              <div>
                <p class="eyebrow">THIS WEEK</p>
                <h3 id="week-heading">一週間の棚</h3>
              </div>
              <span data-week-range></span>
            </header>
            <div class="week-columns" data-week-columns></div>
          </section>

          <section class="balance-board" aria-labelledby="balance-heading">
            <header>
              <div>
                <p class="eyebrow">BALANCE</p>
                <h3 id="balance-heading">教材の灯り</h3>
              </div>
              <span>今週</span>
            </header>
            <div class="balance-list" data-balance-list></div>
          </section>
        </div>

        <section class="session-ledger" aria-labelledby="ledger-heading">
          <header>
            <div>
              <p class="eyebrow">RECENT STACKS</p>
              <h3 id="ledger-heading">積んだ記録</h3>
            </div>
            <div class="ledger-filters">
              <select aria-label="教材で絞り込む" data-session-filter>
                <option value="">すべての教材</option>
              </select>
              <button class="text-button" data-action="export-csv" type="button">
                CSV
              </button>
            </div>
          </header>
          <div class="session-list" data-session-list></div>
          <p class="session-empty" data-session-empty>
            灯りをつけると、ここに一段ずつ積み上がります。
          </p>
        </section>
      </section>

      <section class="local-flow" aria-labelledby="local-heading">
        <div class="flow-copy">
          <p class="eyebrow">STAYS ON THIS DESK</p>
          <h2 id="local-heading">教材名も、学習メモも、外へ出さない。</h2>
          <p>
            入力内容はこのブラウザのIndexedDBへ保存します。サーバーへ送るのは、
            内容を含まない許可済みの匿名利用イベントだけです。
          </p>
        </div>
        <div class="flow-visual" aria-hidden="true">
          <span class="flow-browser">
            <i></i>
            <i></i>
            <i></i>
          </span>
          <span class="flow-lock"></span>
          <span class="flow-server"></span>
        </div>
      </section>
    </main>

    <dialog data-material-dialog>
      <div class="dialog-head">
        <div>
          <p class="eyebrow" data-material-dialog-kicker>
            NEW MATERIAL
          </p>
          <h2 data-material-dialog-title>教材を置く</h2>
        </div>
        <button aria-label="閉じる" data-close-dialog type="button">
          ×
        </button>
      </div>
      <MaterialForm />
    </dialog>

    <dialog data-session-dialog>
      <div class="dialog-head">
        <div>
          <p class="eyebrow">MANUAL STACK</p>
          <h2>学んだ分を積む</h2>
        </div>
        <button aria-label="閉じる" data-close-dialog type="button">
          ×
        </button>
      </div>
      <SessionForm />
    </dialog>

    <dialog data-target-dialog>
      <div class="dialog-head">
        <div>
          <p class="eyebrow">DESK MARK</p>
          <h2>目標の目印</h2>
        </div>
        <button aria-label="閉じる" data-close-dialog type="button">
          ×
        </button>
      </div>
      <TargetForm />
    </dialog>

    <dialog class="review-dialog" data-review-dialog>
      <div class="dialog-head">
        <div>
          <p class="eyebrow">TWELVE WEEKS</p>
          <h2>積み重ねを振り返る</h2>
        </div>
        <button aria-label="閉じる" data-close-dialog type="button">
          ×
        </button>
      </div>
      <div class="review-summary" data-review-summary></div>
      <div class="heat-board" data-heat-board></div>
      <div class="review-actions">
        <label class="share-option">
          <input data-share-names type="checkbox" />
          共有札に教材名を含める
        </label>
        <button class="quiet-button" data-action="save-share-card" type="button">
          学習札を保存
        </button>
        <button class="quiet-button" data-action="print" type="button">
          印刷・PDF
        </button>
        <button class="quiet-button" data-action="export-project" type="button">
          編集用保存
        </button>
        <label class="quiet-button file-button">
          編集用ファイルを開く
          <input accept=".tsukue,application/json" data-import-file type="file" />
        </label>
      </div>
      <p class="share-note">
        学習札は合計時間と日ごとの棒だけを既定で描きます。学習メモ、目標名、正確な開始時刻は含めません。
      </p>
    </dialog>

    <canvas data-share-canvas height="630" hidden width="1200"></canvas>
    <noscript>
      <p class="noscript">机の灯を使うにはJavaScriptを有効にしてください。</p>
    </noscript>
  </Layout>
);

const GuidePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/guide`}
    description="机の灯で教材を置き、タイマーや手入力で学習を記録し、週と12週間を振り返る手順。"
    title="使い方｜机の灯"
  >
    <main class="text-page" id="main">
      <header>
        <p class="eyebrow">GUIDE</p>
        <h1>机の灯の使い方</h1>
        <p>一冊置き、灯りをつけ、終わった分だけ積みます。</p>
      </header>
      <ol class="guide-steps">
        <li>
          <span>1</span>
          <div>
            <h2>教材を置く</h2>
            <p>
              科目名、参考書名、資格名などを登録します。週の目安と進捗単位はあとから変更できます。
            </p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <h2>灯りをつける</h2>
            <p>
              時間をそのまま計るか、25・50・90分を選びます。途中で画面を閉じても開始時刻は端末に残ります。
            </p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <h2>一段積む</h2>
            <p>終了時に時間を記録します。過去分は手入力でき、進んだ量と次に開く場所も残せます。</p>
          </div>
        </li>
        <li>
          <span>4</span>
          <div>
            <h2>棚を見る</h2>
            <p>
              今日、今週、教材の偏り、12週間の学習日を確認します。CSV、印刷、編集用保存も利用できます。
            </p>
          </div>
        </li>
      </ol>
      <aside class="guide-note">
        <span class="note-lamp" aria-hidden="true"></span>
        <p>
          ブラウザデータを消すと記録も消えます。長く使う場合は「編集用保存」で定期的に
          <code>.tsukue</code> ファイルを保管してください。
        </p>
      </aside>
      <a class="primary-button inline" href="/">
        机へ戻る
      </a>
    </main>
  </Layout>
);

const PrivacyPage = () => (
  <Layout
    canonical={`${canonicalOrigin}/privacy`}
    description="机の灯が端末内に保存する学習記録と、内容を含まない匿名利用計測の説明。"
    title="保存先とプライバシー｜机の灯"
  >
    <main class="text-page" id="main">
      <header>
        <p class="eyebrow">YOUR DATA</p>
        <h1>記録は、この端末の机に置かれます。</h1>
        <p>学習内容を保管するためのアカウントやサーバーを持ちません。</p>
      </header>
      <div class="privacy-grid">
        <section>
          <span class="privacy-icon device" aria-hidden="true"></span>
          <h2>端末内に保存</h2>
          <p>
            教材名、週目標、学習日時、時間、進捗量、手ごたえ、メモ、目標日はブラウザのIndexedDBに保存します。
          </p>
        </section>
        <section>
          <span class="privacy-icon signal" aria-hidden="true"></span>
          <h2>匿名の利用計測</h2>
          <p>
            許可済みの操作名、ランダムなセッションID、日付、時刻、QA区分だけを45日以内保存します。
            教材名や学習時間は送信しません。
          </p>
        </section>
        <section>
          <span class="privacy-icon file" aria-hidden="true"></span>
          <h2>自分で持ち出す</h2>
          <p>
            CSV、共有札、印刷/PDF、編集用ファイルは利用者の操作で端末へ作ります。サービスは作成したファイルを受け取りません。
          </p>
        </section>
      </div>
      <section class="privacy-details">
        <h2>使わないもの</h2>
        <ul>
          <li>アカウント、メールアドレス、広告Cookie</li>
          <li>公開タイムライン、DM、友達検索、ランキング</li>
          <li>カメラ、位置情報、マイク、決済</li>
          <li>学習本文を受け取るAPI</li>
        </ul>
      </section>
      <a class="primary-button inline" href="/">
        机へ戻る
      </a>
    </main>
  </Layout>
);

app.use("*", requestId());
app.use("*", securityHeaders);

app.get("/", (c) => {
  c.header("Cache-Control", "no-store");
  return c.html(<HomePage />);
});
app.get("/guide", (c) => c.html(<GuidePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

app.post("/api/events", async (c) => {
  c.header("Cache-Control", "no-store");
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return c.json({ error: "cross_site_request" }, 403);
  }
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) {
    return c.json({ error: "cross_site_request" }, 403);
  }
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return c.json({ error: "unsupported_media_type" }, 415);
  }
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (contentLength > 1024) return c.json({ error: "payload_too_large" }, 413);
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > 1024) {
    return c.json({ error: "payload_too_large" }, 413);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return c.json({ error: "invalid_event" }, 400);
  }
  const { name } = payload as Record<string, unknown>;
  const sessionId = c.req.header("x-tsukue-session") ?? "";
  if (
    typeof name !== "string" ||
    !eventNames.has(name) ||
    !sessionPattern.test(sessionId) ||
    Object.keys(payload).some((key) => key !== "name")
  ) {
    return c.json({ error: "invalid_event" }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO product_events (name, session_id, day, created_at, is_qa)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      name,
      sessionId.toLowerCase(),
      jstDay(),
      nowSeconds(),
      c.req.header("x-tsukue-qa") === "1" ? 1 : 0,
    )
    .run();
  return c.json({ accepted: true }, 202);
});

app.get("/health", (c) => c.json({ ok: true }));

app.notFound((c) => {
  if (c.req.path.startsWith("/api/") || !/\.[a-z0-9]{2,8}$/iu.test(c.req.path)) {
    return c.html(
      <Layout
        canonical={`${canonicalOrigin}/`}
        description="指定されたページは見つかりませんでした。"
        title="見つかりません｜机の灯"
      >
        <main class="not-found" id="main">
          <span class="lost-lamp" aria-hidden="true"></span>
          <h1>この机には、まだページがありません。</h1>
          <a href="/">灯りのある机へ戻る</a>
        </main>
      </Layout>,
      404,
    );
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

const scheduled: ExportedHandlerScheduledHandler<Bindings> = async (_event, env) => {
  await env.DB.prepare("DELETE FROM product_events WHERE created_at <= ?")
    .bind(nowSeconds() - eventLifetime)
    .run();
};

export { app, scheduled };

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Bindings>;
