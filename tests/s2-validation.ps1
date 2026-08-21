param(
  [string]$DshRoot = 'D:\AI\deepseek-harness'
)

$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $PSScriptRoot
$dshCli = Join-Path $DshRoot 'apps\cli\lib\bin.js'
$fixtureRoot = Join-Path $packageRoot 'tests\fixtures'
$nodeModulesPath = Join-Path $DshRoot 'node_modules'
$tempParent = [System.IO.Path]::GetTempPath()
$tempRoot = Join-Path $tempParent ('zhiji-dsh-s2-' + [Guid]::NewGuid().ToString('N'))
$packOutput = Join-Path $tempRoot 'pack\out'
$dshHome = Join-Path $tempRoot 'dsh-home'
$overlay = Join-Path $fixtureRoot 'headless-s2-overlay.cordis.yml'
$profileFixtureRoot = Join-Path $dshHome 'profiles\headless\tests\fixtures'
$previousDshHome = $env:DSH_HOME
$previousTelemetry = $env:DSH_TELEMETRY_DISABLED
$previousPermission = $env:DSH_PERMISSION_MODE

function Fail([string]$message) { throw "S2 validation failed: $message" }
function Assert-True([bool]$condition, [string]$message) { if (-not $condition) { Fail $message } }
function Invoke-Dsh([string[]]$arguments) {
  $output = (& node $dshCli @arguments 2>&1 | Out-String).Trim()
  [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
}
function Read-Fixture([string]$name) { return (Get-Content -Raw -LiteralPath (Join-Path $fixtureRoot $name) -Encoding UTF8).Trim() }

try {
  New-Item -ItemType Directory -Path $packOutput -Force | Out-Null
  New-Item -ItemType Directory -Path $dshHome -Force | Out-Null
  Assert-True (Test-Path -LiteralPath $dshCli -PathType Leaf) "missing DSH CLI: $dshCli"
  Assert-True (Test-Path -LiteralPath $nodeModulesPath -PathType Container) "missing DSH runtime: $nodeModulesPath"
  $env:DSH_HOME = $dshHome
  $env:DSH_TELEMETRY_DISABLED = '1'
  $env:DSH_PERMISSION_MODE = 'read-only'

  Push-Location $packageRoot
  try {
    $packOutputText = (& npm pack --pack-destination $packOutput 2>&1 | Out-String).Trim()
    $packExitCode = $LASTEXITCODE
  } finally { Pop-Location }
  Assert-True ($packExitCode -eq 0) "npm pack failed:`n$packOutputText"
  $tarball = Get-ChildItem -LiteralPath $packOutput -Filter '*.tgz' -File | Select-Object -First 1
  Assert-True ($null -ne $tarball) 'npm pack produced no tarball'

  $add = Invoke-Dsh @('plugin', '--profile', 'headless', 'add', $tarball.FullName)
  Assert-True ($add.ExitCode -eq 0) "official plugin add failed:`n$($add.Output)"
  $manifestPath = Join-Path $dshHome 'profiles\headless\package.json'
  $manifest = Get-Content -Raw -LiteralPath $manifestPath -Encoding UTF8 | ConvertFrom-Json
  Assert-True (@($manifest.dsh.profile.bundles) -contains 'zhiji-dsh-plugin') 'S2 Bundle missing from Profile manifest'
  $dump = Invoke-Dsh @('--profile', 'headless', '--dump-config')
  Assert-True ($dump.ExitCode -eq 0) "dump-config failed:`n$($dump.Output)"
  foreach ($entry in @('zhiji-daily-review-skill', 'zhiji-weekly-review-skill', 'zhiji-monthly-review-skill', 'zhiji-project-review-skill')) {
    Assert-True ($dump.Output -match $entry) "dump-config missing $entry"
  }
  Write-Output '[load] daily, weekly, monthly and project Skills are loaded'

  New-Item -ItemType Directory -Path $profileFixtureRoot -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $fixtureRoot 'dsh-s2-mock-llm.mjs') -Destination (Join-Path $profileFixtureRoot 'dsh-s2-mock-llm.mjs') -Force
  $cases = @(
    @{ Name = 'weekly'; Command = '/zhiji-weekly-review'; Material = (Read-Fixture 'weekly-material.md'); Markers = @('趋势只基于这些日期', '## 六、下周规划') },
    @{ Name = 'monthly'; Command = '/zhiji-monthly-review'; Material = (Read-Fixture 'monthly-material.md'); Markers = @('月内反复', '## 六、下月规划') },
    @{ Name = 'project'; Command = '/zhiji-project-review'; Material = (Read-Fixture 'project-material.md'); Markers = @('三个里程碑', '## 六、后续规划') }
  )
  foreach ($case in $cases) {
    $run = Invoke-Dsh @('--profile', 'headless', '--patch', $overlay, "$($case.Command)`n$($case.Material)")
    Assert-True ($run.ExitCode -eq 0) "$($case.Name) Runtime failed:`n$($run.Output)"
    foreach ($fragment in @('## 一、回顾目标', '## 质量自检') + $case.Markers) {
      Assert-True ($run.Output -match [regex]::Escape($fragment)) "$($case.Name) output missing $fragment`n$($run.Output)"
    }
    Write-Output "[runtime] $($case.Name) review route passed"
  }

  $insufficientCases = @(
    @{ Name = 'weekly'; Command = '/zhiji-weekly-review'; Material = ("证据不足 fixture`n" + (Read-Fixture 'insufficient-weekly-material.md')) },
    @{ Name = 'monthly'; Command = '/zhiji-monthly-review'; Material = ("证据不足 fixture`n" + (Read-Fixture 'insufficient-monthly-material.md')) },
    @{ Name = 'project'; Command = '/zhiji-project-review'; Material = ("证据不足 fixture`n" + (Read-Fixture 'insufficient-project-material.md')) }
  )
  foreach ($case in $insufficientCases) {
    $run = Invoke-Dsh @('--profile', 'headless', '--patch', $overlay, "$($case.Command)`n$($case.Material)")
    Assert-True ($run.ExitCode -eq 0) "$($case.Name) insufficient Runtime failed:`n$($run.Output)"
    Assert-True ($run.Output -match '证据不足') "$($case.Name) did not disclose insufficient evidence`n$($run.Output)"
    Write-Output "[degrade] $($case.Name) insufficient-material downgrade passed"
  }

  $remove = Invoke-Dsh @('plugin', '--profile', 'headless', 'remove', 'zhiji-dsh-plugin')
  Assert-True ($remove.ExitCode -eq 0) "official plugin remove failed:`n$($remove.Output)"
  $after = Get-Content -Raw -LiteralPath $manifestPath -Encoding UTF8 | ConvertFrom-Json
  Assert-True (@($after.dsh.profile.bundles) -notcontains 'zhiji-dsh-plugin') 'Bundle remains after remove'
  $restart = Invoke-Dsh @('--profile', 'headless', '--patch', $overlay, 'Profile restart smoke')
  Assert-True ($restart.ExitCode -eq 0) "Profile restart failed after remove:`n$($restart.Output)"
  Assert-True ($restart.Output -match 'DSH profile restart passed') 'Unexpected restart output'
  Write-Output '[remove] remove and restart passed'
  Write-Output 'PASS: S2 daily -> weekly -> monthly -> project runtime and downgrade validation'
}
finally {
  if ($null -eq $previousDshHome) { Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue } else { $env:DSH_HOME = $previousDshHome }
  if ($null -eq $previousTelemetry) { Remove-Item Env:DSH_TELEMETRY_DISABLED -ErrorAction SilentlyContinue } else { $env:DSH_TELEMETRY_DISABLED = $previousTelemetry }
  if ($null -eq $previousPermission) { Remove-Item Env:DSH_PERMISSION_MODE -ErrorAction SilentlyContinue } else { $env:DSH_PERMISSION_MODE = $previousPermission }
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTemp = (Resolve-Path -LiteralPath $tempRoot).Path
    $resolvedParent = (Resolve-Path -LiteralPath $tempRoot).Path | Split-Path -Parent
    if ($resolvedTemp.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force }
  }
}
