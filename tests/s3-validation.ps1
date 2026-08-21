param(
  [string]$DshRoot = $env:DSH_SOURCE_ROOT
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($DshRoot)) { throw 'DSH source root is required; pass -DshRoot or set DSH_SOURCE_ROOT.' }
$packageRoot = Split-Path -Parent $PSScriptRoot
$dshCli = Join-Path $DshRoot 'apps\cli\lib\bin.js'
$fixtureRoot = Join-Path $packageRoot 'tests\fixtures'
$nodeModulesPath = Join-Path $DshRoot 'node_modules'
$tempParent = [System.IO.Path]::GetTempPath()
$tempRoot = Join-Path $tempParent ('zhiji-dsh-s3-' + [Guid]::NewGuid().ToString('N'))
$packOutput = Join-Path $tempRoot 'pack\out'
$dshHome = Join-Path $tempRoot 'dsh-home'
$journalRoot = Join-Path $tempRoot 'configured-journals'
$overlay = Join-Path $fixtureRoot 'headless-s3-overlay.cordis.yml'
$profileFixtureRoot = Join-Path $dshHome 'profiles\headless\tests\fixtures'
$previousDshHome = $env:DSH_HOME
$previousTelemetry = $env:DSH_TELEMETRY_DISABLED
$previousPermission = $env:DSH_PERMISSION_MODE
$previousJournalRoot = $env:ZHIJI_DSH_LOG_ROOT

function Fail([string]$message) { throw ('S3 validation failed: ' + $message) }
function Assert-True([bool]$condition, [string]$message) { if (-not $condition) { Fail $message } }
function Invoke-Dsh([string[]]$arguments) {
  $callId = [Guid]::NewGuid().ToString('N')
  $stdoutPath = Join-Path $tempRoot ("dsh-$callId.stdout")
  $stderrPath = Join-Path $tempRoot ("dsh-$callId.stderr")
  $argumentList = @($dshCli)
  foreach ($argument in $arguments) {
    if ($argument -match '[\s"]') { $argumentList += ('"' + ($argument -replace '"', '\\"') + '"') } else { $argumentList += $argument }
  }
  $process = Start-Process -FilePath 'node.exe' -ArgumentList $argumentList -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $stdout = [System.IO.File]::ReadAllText($stdoutPath)
  $stderr = [System.IO.File]::ReadAllText($stderrPath)
  $output = ([string]::Concat($stdout, $stderr)).Trim()
  [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $output }
}

try {
  New-Item -ItemType Directory -Path $packOutput -Force | Out-Null
  New-Item -ItemType Directory -Path $dshHome -Force | Out-Null
  New-Item -ItemType Directory -Path $journalRoot -Force | Out-Null
  Assert-True (Test-Path -LiteralPath $dshCli -PathType Leaf) ('missing DSH CLI: ' + $dshCli)
  Assert-True (Test-Path -LiteralPath $nodeModulesPath -PathType Container) ('missing DSH runtime: ' + $nodeModulesPath)

  Set-Content -LiteralPath (Join-Path $journalRoot '2026-08-17.md') -Encoding UTF8 -Value ('# 2026-08-17' + [Environment]::NewLine + [Environment]::NewLine + 'S3_RANGE_MATERIAL_2026_08_17: confirm the risk.')
  Set-Content -LiteralPath (Join-Path $journalRoot '2026-08-19.md') -Encoding UTF8 -Value ('# 2026-08-19' + [Environment]::NewLine + [Environment]::NewLine + 'S3_RANGE_MATERIAL_2026_08_19: adjust after verification.')
  Set-Content -LiteralPath (Join-Path $journalRoot '2026-08-21.md') -Encoding UTF8 -Value ('# 2026-08-21' + [Environment]::NewLine + [Environment]::NewLine + 'S3_RANGE_MATERIAL_2026_08_21: record the counterexample.')

  $env:DSH_HOME = $dshHome
  $env:DSH_TELEMETRY_DISABLED = '1'
  $env:DSH_PERMISSION_MODE = 'read-only'
  $env:ZHIJI_DSH_LOG_ROOT = $journalRoot

  Push-Location $packageRoot
  try {
    $packStdout = Join-Path $tempRoot 'npm-pack.stdout'
    $packStderr = Join-Path $tempRoot 'npm-pack.stderr'
    $packProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList @('pack', '--pack-destination', $packOutput) -WorkingDirectory $packageRoot -Wait -PassThru -RedirectStandardOutput $packStdout -RedirectStandardError $packStderr
    $packExitCode = $packProcess.ExitCode
    $packStdoutText = [System.IO.File]::ReadAllText($packStdout)
    $packStderrText = [System.IO.File]::ReadAllText($packStderr)
    $packOutputText = ([string]::Concat($packStdoutText, $packStderrText)).Trim()
  } finally { Pop-Location }
  Assert-True ($packExitCode -eq 0) ('npm pack failed:' + [Environment]::NewLine + $packOutputText)
  $tarball = Get-ChildItem -LiteralPath $packOutput -Filter '*.tgz' -File | Select-Object -First 1
  Assert-True ($null -ne $tarball) 'npm pack produced no tarball'
  $tarList = (& tar -tzf $tarball.FullName 2>&1 | Out-String).Trim()
  Assert-True ($LASTEXITCODE -eq 0) ('tarball content listing failed:' + [Environment]::NewLine + $tarList)
  foreach ($entry in @('package/index.js', 'package/read-journal-range.js', 'package/cordis.patch.yml', 'package/skills/weekly-review.md', 'package/skills/monthly-review.md', 'package/skills/project-review.md')) {
    Assert-True ($tarList -match [regex]::Escape($entry)) ('tarball missing ' + $entry)
  }
  Assert-True ($tarList -notmatch 'tests/fixtures') 'tarball unexpectedly contains test fixtures'

  $add = Invoke-Dsh @('plugin', '--profile', 'headless', 'add', $tarball.FullName)
  Assert-True ($add.ExitCode -eq 0) ('official plugin add failed:' + [Environment]::NewLine + $add.Output)
  $manifestPath = Join-Path $dshHome 'profiles\headless\package.json'
  $manifest = Get-Content -Raw -LiteralPath $manifestPath -Encoding UTF8 | ConvertFrom-Json
  Assert-True (@($manifest.dsh.profile.bundles) -contains 'zhiji-dsh-plugin') 'S3 Bundle missing from Profile manifest'
  $dump = Invoke-Dsh @('--profile', 'headless', '--dump-config')
  Assert-True ($dump.ExitCode -eq 0) ('dump-config failed:' + [Environment]::NewLine + $dump.Output)
  Assert-True ($dump.Output -match 'zhiji-dsh-plugin') 'dump-config missing the consolidated Bundle entry'
  Assert-True ($dump.Output -match 'tools') 'dump-config does not show the Tool injection'
  Write-Output '[load] Bundle, four Skills and Tool injection are loaded'

  New-Item -ItemType Directory -Path $profileFixtureRoot -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $fixtureRoot 'dsh-s3-mock-llm.mjs') -Destination (Join-Path $profileFixtureRoot 'dsh-s3-mock-llm.mjs') -Force
  $cases = @(
    @{ Name = 'weekly'; Command = '/zhiji-weekly-review'; Request = 'Use the configured journal root for 2026-08-17 through 2026-08-23 and complete a weekly review.'; Markers = @('S3_RANGE_MATERIAL_2026_08_19', 'S3_WEEKLY_ACTION_SINGLE') },
    @{ Name = 'monthly'; Command = '/zhiji-monthly-review'; Request = 'Use the configured journal root for 2026-08-01 through 2026-08-31 and complete a monthly review.'; Markers = @('S3_RANGE_MATERIAL_2026_08_19', 'S3_MONTHLY_ACTION_SINGLE') },
    @{ Name = 'project'; Command = '/zhiji-project-review'; Request = 'Use the configured journal root for 2026-08-17 through 2026-08-21 as project evidence and complete a project review.'; Markers = @('S3_RANGE_MATERIAL_2026_08_19', 'S3_PROJECT_ACTION_SINGLE') }
  )
  foreach ($case in $cases) {
    $run = Invoke-Dsh @('--profile', 'headless', '--patch', $overlay, ($case.Command + [Environment]::NewLine + $case.Request))
    Assert-True ($run.ExitCode -eq 0) ($case.Name + ' Runtime failed:' + [Environment]::NewLine + $run.Output)
    foreach ($fragment in @('## ') + $case.Markers) {
      Assert-True ($run.Output.Contains($fragment)) ($case.Name + ' output missing ' + $fragment + [Environment]::NewLine + $run.Output)
    }
    Write-Output ('[runtime] ' + $case.Name + ' consumed Tool aggregate and produced a review')
  }

  $remove = Invoke-Dsh @('plugin', '--profile', 'headless', 'remove', 'zhiji-dsh-plugin')
  Assert-True ($remove.ExitCode -eq 0) ('official plugin remove failed:' + [Environment]::NewLine + $remove.Output)
  $after = Get-Content -Raw -LiteralPath $manifestPath -Encoding UTF8 | ConvertFrom-Json
  Assert-True (@($after.dsh.profile.bundles) -notcontains 'zhiji-dsh-plugin') 'Bundle remains after remove'
  $restart = Invoke-Dsh @('--profile', 'headless', '--patch', $overlay, 'Profile restart smoke')
  if ($restart.ExitCode -ne 0) { Fail ('Profile restart failed after remove: ' + [Environment]::NewLine + $restart.Output) }
  Assert-True ($restart.Output -match 'DSH profile restart passed') 'Unexpected restart output'
  Write-Output '[remove] remove and restart passed'
  Write-Output 'PASS: S3 configured-root read-only range Tool and weekly/monthly/project Runtime validation'
}
finally {
  if ($null -eq $previousDshHome) { Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue } else { $env:DSH_HOME = $previousDshHome }
  if ($null -eq $previousTelemetry) { Remove-Item Env:DSH_TELEMETRY_DISABLED -ErrorAction SilentlyContinue } else { $env:DSH_TELEMETRY_DISABLED = $previousTelemetry }
  if ($null -eq $previousPermission) { Remove-Item Env:DSH_PERMISSION_MODE -ErrorAction SilentlyContinue } else { $env:DSH_PERMISSION_MODE = $previousPermission }
  if ($null -eq $previousJournalRoot) { Remove-Item Env:ZHIJI_DSH_LOG_ROOT -ErrorAction SilentlyContinue } else { $env:ZHIJI_DSH_LOG_ROOT = $previousJournalRoot }
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTemp = (Resolve-Path -LiteralPath $tempRoot).Path
    $resolvedParent = Split-Path -Parent $resolvedTemp
    if ($resolvedTemp.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force }
  }
}
