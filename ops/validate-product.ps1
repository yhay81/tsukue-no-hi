[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WorkerPath = Join-Path $RepoRoot "src\worker.tsx"
$MigrationPath = Join-Path $RepoRoot "migrations\0001_events.sql"
$AppPath = Join-Path $RepoRoot "public\app.js"
$ServiceWorkerPath = Join-Path $RepoRoot "public\sw.js"
$StylesPath = Join-Path $RepoRoot "public\styles.css"
$PublicDirectory = Join-Path $RepoRoot "public"

$RequiredFiles = @(
    ".github\workflows\ci.yml",
    "DECISIONS.md",
    "EXPERIMENT.md",
    "METRICS.md",
    "PRIVACY.md",
    "README.md",
    "SECURITY.md",
    "STACK.md",
    "ops\product-metrics.ps1",
    "ops\product-metrics.sql",
    "ops\submit-indexnow.ps1",
    "public\app.js",
    "public\favicon.svg",
    "public\manifest.webmanifest",
    "public\styles.css",
    "public\og.svg",
    "public\robots.txt",
    "public\sitemap.xml",
    "public\sw.js"
)
foreach ($RelativePath in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $RelativePath))) {
        throw "Missing required release file: $RelativePath"
    }
}

$Worker = Get-Content -Raw -LiteralPath $WorkerPath
$Migration = Get-Content -Raw -LiteralPath $MigrationPath
$App = Get-Content -Raw -LiteralPath $AppPath
$ServiceWorker = Get-Content -Raw -LiteralPath $ServiceWorkerPath
$Styles = Get-Content -Raw -LiteralPath $StylesPath
$ProductSurface = @($Worker, $App) -join "`n"

foreach ($VisualClass in @(
    'class="desk-scene"',
    'class="timer-desk"',
    'class="bookcase"',
    'class="week-shelf"',
    'class="balance-board"',
    'class="heat-board"',
    'class="local-flow"'
)) {
    if (-not $Worker.Contains($VisualClass)) {
        throw "Missing product visual: $VisualClass"
    }
}
if ($ProductSurface -match '(?i)public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性') {
    throw "Research copy must not appear on the product surface"
}
if (-not $Styles.Contains("font-size: clamp(26px, 3.1vw, 32px)") -or
    $Styles -match '(?s)h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px') {
    throw "Primary heading must remain at or below 32px"
}
if ($App -match '(?i)innerHTML|eval\(|new Function') {
    throw "Study content must not be interpreted as markup or code"
}
if (([regex]::Matches($App, '(?i)\bfetch\s*\(').Count -ne 1) -or
    -not $App.Contains('fetch("/api/events"')) {
    throw "The desk may send only anonymous allowlisted product events"
}
if (-not $App.Contains("indexedDB.open") -or
    -not $App.Contains('createObjectStore("materials"') -or
    -not $App.Contains('createObjectStore("sessions"') -or
    -not $App.Contains('createObjectStore("config"') -or
    -not $App.Contains("const maximumMaterials = 20") -or
    -not $App.Contains("const maximumSessions = 3000")) {
    throw "Expected bounded local material, study session, and target storage"
}
if (-not $App.Contains(".tsukue") -or
    -not $App.Contains("text/csv") -or
    -not $App.Contains("window.print()") -or
    -not $App.Contains('canvas.toBlob(resolve, "image/png")') -or
    -not $App.Contains("formulaSafe") -or
    -not $App.Contains("hasOnlyKeys")) {
    throw "Expected strict import and complete share, export, and print paths"
}
if (-not $ProductSurface.Contains("学習メモ、目標名、正確な開始時刻は含めません") -or
    -not $App.Contains("data-share-names")) {
    throw "Expected a privacy-safe share card default"
}
if (-not $ServiceWorker.Contains('const cacheName = "tsukue-no-hi-v1"') -or
    -not $ServiceWorker.Contains("caches.open") -or
    -not $ServiceWorker.Contains("fetch(event.request)")) {
    throw "Expected a network-first offline asset cache"
}
if (-not $Worker.Contains("45 * 86400") -or
    -not $Worker.Contains("DELETE FROM product_events WHERE created_at <= ?") -or
    ([regex]::Matches($Worker, 'app\.(?:post|put|patch|delete)\("/api/').Count -ne 1)) {
    throw "Expected one event-only write API with bounded retention"
}
if ($Migration -match '(?i)\b(material_name|minutes|quantity|focus|note|target|filename|email|phone|user_agent|ip_address)\b') {
    throw "Study content, identity, and file metadata do not belong in telemetry"
}
foreach ($EventName in @(
    "visited",
    "material_created",
    "timer_completed",
    "session_added",
    "review_opened",
    "share_card_saved",
    "printed",
    "project_exported",
    "project_imported",
    "returned"
)) {
    if (-not $Migration.Contains("'$EventName'") -or -not $Worker.Contains("""$EventName""")) {
        throw "Event contract is missing: $EventName"
    }
}
if (-not $Migration.Contains("is_qa") -or
    -not $Migration.Contains("CHECK(name IN")) {
    throw "Expected allowlisted events and a QA boundary"
}
if ($Worker -match '(?i)better-auth|betterAuth') {
    throw "Account authentication is not needed for this local-first release"
}
if (-not $Worker.Contains("camera=(), geolocation=(), microphone=(), payment=()") -or
    $ProductSurface -match 'navigator\.geolocation|getCurrentPosition|watchPosition|Notification\.requestPermission') {
    throw "The release must not request camera, location, microphone, payment, or notification permission"
}
if (-not $Styles.Contains("@page") -or
    -not $Styles.Contains("size: A4 portrait") -or
    -not $Styles.Contains("@media print")) {
    throw "Expected an explicit printable study report"
}

$OgPath = Join-Path $PublicDirectory "og.svg"
if ((Get-Item -LiteralPath $OgPath).Length -lt 2500) {
    throw "Expected a product-specific OG SVG larger than 2.5 KB"
}

$KeyFiles = @(
    Get-ChildItem -LiteralPath $PublicDirectory -File |
        Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" }
)
if ($KeyFiles.Count -ne 1) {
    throw "Expected exactly one generated IndexNow key file, found $($KeyFiles.Count)"
}
$Key = (Get-Content -Raw -LiteralPath $KeyFiles[0].FullName).Trim()
if ($Key -ne $KeyFiles[0].BaseName) {
    throw "IndexNow key file name and content do not match"
}

Write-Output "Product release contract is satisfied"
