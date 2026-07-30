[CmdletBinding()]
param(
    [switch]$Local
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SqlPath = Join-Path $PSScriptRoot "product-metrics.sql"
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content $SqlPath) -join " "

$Output = & $Wrangler d1 execute tsukue-no-hi $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) {
    throw "D1 metrics query failed with exit code $LASTEXITCODE"
}

$Payload = ($Output -join [Environment]::NewLine) | ConvertFrom-Json
$Row = $Payload[0].results[0]
if (-not $Row) {
    throw "D1 metrics query returned no result"
}

function Get-Percent {
    param([int]$Numerator, [int]$Denominator)
    if ($Denominator -eq 0) { return $null }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

$Users = [int]$Row.users
$Creators = [int]$Row.material_creators
$Recorders = [int]$Row.study_recorders

[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "tsukue-no-hi"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        users = $Users
        material_creators = $Creators
        study_recorders = $Recorders
        timer_users = [int]$Row.timer_users
        manual_recorders = [int]$Row.manual_recorders
        reviewers = [int]$Row.reviewers
        share_card_users = [int]$Row.share_card_users
        printers = [int]$Row.printers
        exporters = [int]$Row.exporters
        importers = [int]$Row.importers
        returned = [int]$Row.returned
        study_recorders_7d = [int]$Row.study_recorders_7d
        five_records_three_days = [int]$Row.five_records_three_days
        users_spanning_7d = [int]$Row.users_spanning_7d
    }
    rates = [ordered]@{
        create_percent = Get-Percent $Creators $Users
        record_percent = Get-Percent $Recorders $Creators
        deep_use_percent = Get-Percent ([int]$Row.five_records_three_days) $Recorders
        review_percent = Get-Percent ([int]$Row.reviewers) $Recorders
        carry_out_percent = Get-Percent ([Math]::Max(
            [int]$Row.share_card_users,
            [Math]::Max([int]$Row.printers, [int]$Row.exporters)
        )) $Recorders
    }
} | ConvertTo-Json -Depth 4
