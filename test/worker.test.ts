import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Miniflare } from "miniflare";

import { app, scheduled, type Bindings } from "../src/worker";

const migrationPath = fileURLToPath(new URL("../migrations/0001_events.sql", import.meta.url));
const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));
const serviceWorkerPath = fileURLToPath(new URL("../public/sw.js", import.meta.url));
const stylesPath = fileURLToPath(new URL("../public/styles.css", import.meta.url));
const manifestPath = fileURLToPath(new URL("../public/manifest.webmanifest", import.meta.url));
const sitemapPath = fileURLToPath(new URL("../public/sitemap.xml", import.meta.url));
const robotsPath = fileURLToPath(new URL("../public/robots.txt", import.meta.url));
const ogPath = fileURLToPath(new URL("../public/og.svg", import.meta.url));
const metricsPath = fileURLToPath(new URL("../ops/product-metrics.sql", import.meta.url));
const origin = "http://localhost";
const session = "a2d0e2f2-66fd-4fd4-8e87-b0ef67ad194a";

let miniflare: Miniflare;
let bindings: Bindings;

const eventRequest = (
  name: string,
  options: { body?: string; origin?: string; qa?: boolean; session?: string } = {},
) => ({
  body: options.body ?? JSON.stringify({ name }),
  headers: {
    "content-type": "application/json",
    origin: options.origin ?? origin,
    "x-tsukue-qa": options.qa ? "1" : "0",
    "x-tsukue-session": options.session ?? session,
  },
  method: "POST",
});

beforeEach(async () => {
  miniflare = new Miniflare({
    d1Databases: { DB: "tsukue-no-hi-test" },
    modules: true,
    script: "export default { fetch() { return new Response('test') } }",
  });
  const database = await miniflare.getD1Database("DB");
  const migration = await readFile(migrationPath, "utf8");
  for (const statement of migration
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    await database.prepare(statement).run();
  }
  bindings = {
    ASSETS: { fetch: async () => new Response("asset", { status: 200 }) } as unknown as Fetcher,
    DB: database as unknown as D1Database,
  };
});

afterEach(async () => {
  await miniflare.dispose();
});

describe("public pages", () => {
  it.each([
    ["/", 'class="desk-scene"', "https://tsukue-no-hi.yhay81.com/"],
    ["/guide", 'class="guide-steps"', "https://tsukue-no-hi.yhay81.com/guide"],
    ["/privacy", 'class="privacy-grid"', "https://tsukue-no-hi.yhay81.com/privacy"],
  ])("%s は製品固有の画面を返す", async (path, marker, canonical) => {
    const response = await app.request(path, undefined, bindings);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(marker);
    expect(html).toContain(`href="${canonical}" rel="canonical"`);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(html).not.toMatch(/成功条件|市場スコア|公開実験|収益性/);
  });

  it("記録画面は机、灯り、背表紙、一週間、持出し導線を持つ", async () => {
    const response = await app.request("/", undefined, bindings);
    const html = await response.text();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain('class="desk-scene"');
    expect(html).toContain('class="timer-desk"');
    expect(html).toContain('class="bookcase"');
    expect(html).toContain('class="week-shelf"');
    expect(html).toContain('class="balance-board"');
    expect(html).toContain('class="heat-board"');
    expect(html).toContain('class="local-flow"');
    expect(html).toMatch(/<script src="\/app\.js" type="module"><\/script>/);
    expect(html).toContain("学習札を保存");
    expect(html).toContain("印刷・PDF");
    expect(html).toContain("編集用保存");
  });

  it("未知のページは404、静的アセットはASSETSへ渡す", async () => {
    const page = await app.request("/missing", undefined, bindings);
    expect(page.status).toBe(404);
    expect(await page.text()).toContain("この机には、まだページがありません");
    const asset = await app.request("/unknown.css", undefined, bindings);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("asset");
  });

  it("health endpointは最小の稼働状態を返す", async () => {
    const response = await app.request("/health", undefined, bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("anonymous telemetry", () => {
  it.each([
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
  ])("%s を許可する", async (name) => {
    const response = await app.request("/api/events", eventRequest(name), bindings);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
  });

  it("イベント名、本文field、セッションIDを許可リストで制限する", async () => {
    const event = await app.request("/api/events", eventRequest("study_content"), bindings);
    expect(event.status).toBe(400);
    const content = await app.request(
      "/api/events",
      eventRequest("session_added", {
        body: JSON.stringify({ name: "session_added", material: "英単語帳" }),
      }),
      bindings,
    );
    expect(content.status).toBe(400);
    const invalidSession = await app.request(
      "/api/events",
      eventRequest("visited", { session: "not-a-session" }),
      bindings,
    );
    expect(invalidSession.status).toBe(400);
  });

  it("JSON以外、不正JSON、1KB超の本文を拒否する", async () => {
    const media = await app.request(
      "/api/events",
      {
        body: "name=visited",
        headers: { "content-type": "text/plain", "x-tsukue-session": session },
        method: "POST",
      },
      bindings,
    );
    expect(media.status).toBe(415);
    const malformed = await app.request(
      "/api/events",
      eventRequest("visited", { body: "{" }),
      bindings,
    );
    expect(malformed.status).toBe(400);
    const oversized = await app.request(
      "/api/events",
      eventRequest("visited", { body: JSON.stringify({ name: "x".repeat(1100) }) }),
      bindings,
    );
    expect(oversized.status).toBe(413);
  });

  it("別originからの記録を拒否する", async () => {
    const response = await app.request(
      "/api/events",
      eventRequest("visited", { origin: "https://example.com" }),
      bindings,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "cross_site_request" });
  });

  it("自動QAイベントを実利用から分離する", async () => {
    await app.request("/api/events", eventRequest("session_added", { qa: true }), bindings);
    await app.request("/api/events", eventRequest("session_added"), bindings);
    const rows = await bindings.DB.prepare(
      "SELECT is_qa, COUNT(*) AS count FROM product_events GROUP BY is_qa ORDER BY is_qa",
    ).all<{ count: number; is_qa: number }>();
    expect(rows.results).toEqual([
      { count: 1, is_qa: 0 },
      { count: 1, is_qa: 1 },
    ]);
  });

  it("45日を過ぎた計測だけを削除する", async () => {
    const now = Math.floor(Date.now() / 1000);
    await bindings.DB.prepare(
      `INSERT INTO product_events (name, session_id, day, created_at, is_qa)
       VALUES ('visited', ?, '2026-01-01', ?, 0), ('visited', ?, '2026-07-30', ?, 0)`,
    )
      .bind(session, now - 46 * 86400, session, now)
      .run();
    await scheduled({} as ScheduledController, bindings, {} as ExecutionContext);
    const row = await bindings.DB.prepare("SELECT COUNT(*) AS count FROM product_events").first<{
      count: number;
    }>();
    expect(row?.count).toBe(1);
  });
});

describe("local study desk contract", () => {
  it("学習内容を送らず、IndexedDB内の教材・記録・目標だけを扱う", async () => {
    const source = await readFile(appPath, "utf8");
    expect(source.match(/\bfetch\s*\(/g)).toHaveLength(1);
    expect(source).toContain('fetch("/api/events"');
    expect(source).toContain("indexedDB.open");
    expect(source).toContain('createObjectStore("materials"');
    expect(source).toContain('createObjectStore("sessions"');
    expect(source).toContain('createObjectStore("config"');
    expect(source).toContain("const maximumMaterials = 20");
    expect(source).toContain("const maximumSessions = 3000");
    expect(source).not.toMatch(/innerHTML|eval\(|new Function/);
    expect(source).not.toMatch(
      /navigator\.geolocation|getCurrentPosition|watchPosition|Notification\.requestPermission/,
    );
  });

  it("タイマーを復元し、時間・進捗・次に開く場所を積める", async () => {
    const source = await readFile(appPath, "utf8");
    expect(source).toContain("const timerKey");
    expect(source).toContain("restoreTimer");
    expect(source).toContain("persistTimer");
    expect(source).toContain("timerModeMinutes");
    expect(source).toContain('track("timer_completed")');
    expect(source).toContain('track("session_added")');
    expect(source).toContain('data.get("note")');
  });

  it("共有札・編集用保存・CSV・PDFを安全に持ち出せる", async () => {
    const [source, styles, worker] = await Promise.all([
      readFile(appPath, "utf8"),
      readFile(stylesPath, "utf8"),
      readFile(fileURLToPath(new URL("../src/worker.tsx", import.meta.url)), "utf8"),
    ]);
    expect(source).toContain('canvas.toBlob(resolve, "image/png")');
    expect(source).toContain(".tsukue");
    expect(source).toContain("text/csv");
    expect(source).toContain("window.print()");
    expect(source).toContain("/^[=+\\-@]/");
    expect(worker).toContain("学習メモ、目標名、正確な開始時刻は含めません");
    expect(styles).toContain("size: A4 portrait");
    expect(styles).toContain("@media print");
  });

  it("読み込み前に形式、上限、UUID、参照、値域を検証する", async () => {
    const source = await readFile(appPath, "utf8");
    expect(source).toContain('project.format !== "tsukue-no-hi"');
    expect(source).toContain("project.materials.length > maximumMaterials");
    expect(source).toContain("project.sessions.length > maximumSessions");
    expect(source).toContain("validImportedMaterial");
    expect(source).toContain("validImportedSession");
    expect(source).toContain("validImportedSettings");
    expect(source).toContain("materialIds.size !== project.materials.length");
    expect(source).toContain("hasOnlyKeys");
  });

  it("静的製品面をネットワーク優先でオフラインキャッシュする", async () => {
    const source = await readFile(serviceWorkerPath, "utf8");
    expect(source).toContain('const cacheName = "tsukue-no-hi-v1"');
    expect(source).toContain("caches.open");
    expect(source).toContain("fetch(event.request)");
    expect(source).toContain('!event.request.url.includes("/api/")');
  });

  it("見出しを巨大化せず、机の視覚要素をレスポンシブに保つ", async () => {
    const source = await readFile(stylesPath, "utf8");
    expect(source).toContain("font-size: clamp(26px, 3.1vw, 32px)");
    expect(source).toContain(".desk-scene");
    expect(source).toContain(".scene-books");
    expect(source).toContain(".timer-face");
    expect(source).toContain(".week-columns");
    expect(source).toContain(".heat-cell");
    expect(source).toContain("@media (max-width: 640px)");
  });
});

describe("metrics contract", () => {
  it("深い利用を件数・日数・利用期間から計測し、QAを除く", async () => {
    const source = await readFile(metricsPath, "utf8");
    expect(source).toContain("WHERE is_qa = 0");
    expect(source).toContain("records >= 5 AND record_days >= 3");
    expect(source).toContain("span_days >= 7");
    expect(source).toContain("'timer_completed', 'session_added'");
  });
});

describe("discovery assets", () => {
  it("manifestは机の灯のPWA情報を持つ", async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(manifest.name).toBe("机の灯");
    expect(manifest.description).toContain("教材別タイマー");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#111b2e");
    expect(manifest.icons).toHaveLength(1);
  });

  it("sitemapとrobotsはtsukue-no-hi.yhay81.comを指す", async () => {
    const [sitemap, robots] = await Promise.all([
      readFile(sitemapPath, "utf8"),
      readFile(robotsPath, "utf8"),
    ]);
    expect(sitemap.match(/<loc>/g)).toHaveLength(3);
    expect(sitemap).toContain("https://tsukue-no-hi.yhay81.com/guide");
    expect(robots).toContain("https://tsukue-no-hi.yhay81.com/sitemap.xml");
  });

  it("OG画像は夜の机、ランプ、本、タイマーで製品を示す", async () => {
    const source = await readFile(ogPath, "utf8");
    expect(source.length).toBeGreaterThan(2500);
    expect(source).toContain("PRIVATE STUDY DESK");
    expect(source).toContain("学んだ時間が、机に灯る");
    expect(source).toContain("25:00");
  });
});
