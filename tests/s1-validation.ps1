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
$tempRoot = Join-Path $tempParent ('zhiji-dsh-s1-' + [Guid]::NewGuid().ToString('N'))
$packRoot = Join-Path $tempRoot 'pack'
$dshHome = Join-Path $tempRoot 'dsh-home'
$packOutput = Join-Path $packRoot 'out'
$overlay = Join-Path $fixtureRoot 'headless-overlay.cordis.yml'
$profileFixtureRoot = Join-Path $dshHome 'profiles\headless\tests\fixtures'
$journal = (Get-Content -Raw -LiteralPath (Join-Path $fixtureRoot 'daily-journal.md') -Encoding UTF8).Trim()
$task = "/zhiji-daily-review`n$journal"
$previousDshHome = $env:DSH_HOME
$previousTelemetry = $env:DSH_TELEMETRY_DISABLED
$previousPermission = $env:DSH_PERMISSION_MODE

function Fail([string]$message) {
  throw "S1 validation failed: $message"
}

function Assert-True([bool]$condition, [string]$message) {
  if (-not $condition) { Fail $message }
}

function Invoke-Dsh([string[]]$arguments) {
  $output = (& node $dshCli @arguments 2>&1 | Out-String).Trim()
  [pscustomobject]@{
    Arguments = ($arguments -join ' ')
    ExitCode = $LASTEXITCODE
    Output = $output
  }
}

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
  }
  finally {
    Pop-Location
  }
  Assert-True ($packExitCode -eq 0) "npm pack failed:`n$packOutputText"
  $tarball = Get-ChildItem -LiteralPath $packOutput -Filter '*.tgz' -File | Select-Object -First 1
  Assert-True ($null -ne $tarball) "npm pack produced no tarball"

  $add = Invoke-Dsh @('plugin', '--profile', 'headless', 'add', $tarball.FullName)
  Assert-True ($add.ExitCode -eq 0) "official plugin add failed:`n$($add.Output)"
  Write-Output "[add] $($add.Output)"

  $profileManifestPath = Join-Path $dshHome 'profiles\headless\package.json'
  Assert-True (Test-Path -LiteralPath $profileManifestPath -PathType Leaf) 'Profile manifest was not created'
  $profileManifest = Get-Content -Raw -LiteralPath $profileManifestPath -Encoding UTF8 | ConvertFrom-Json
  $bundles = @($profileManifest.dsh.profile.bundles)
  Assert-True ($bundles -contains 'zhiji-dsh-plugin') 'Profile manifest does not list zhiji-dsh-plugin'
  Assert-True ($profileManifest.dependencies.'zhiji-dsh-plugin' -ne $null) 'Profile dependency was not recorded'

  $dump = Invoke-Dsh @('--profile', 'headless', '--dump-config')
  Assert-True ($dump.ExitCode -eq 0) "official dump-config failed:`n$($dump.Output)"
  Assert-True ($dump.Output -match 'zhiji-dsh-plugin') 'dump-config did not show the Bundle layer'
  Write-Output "[dump-config] Bundle and Skill entry are present"

  New-Item -ItemType Directory -Path $profileFixtureRoot -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $fixtureRoot 'dsh-mock-llm.mjs') -Destination (Join-Path $profileFixtureRoot 'dsh-mock-llm.mjs') -Force
  $run = Invoke-Dsh @('--profile', 'headless', '--patch', $overlay, $task)
  Assert-True ($run.ExitCode -eq 0) "official headless runtime failed:`n$($run.Output)"
  foreach ($fragment in @('📋 8月21日 知己每日复盘', '📌 事实', '🔍 主要洞察', '推断：', '⚡ 单一行动', '验证：')) {
    Assert-True ($run.Output -match [regex]::Escape($fragment)) "runtime output missing: $fragment`n$($run.Output)"
  }
  Write-Output "[runtime] fixed journal produced a Skill-injected daily review"
  Write-Output $run.Output

  $remove = Invoke-Dsh @('plugin', '--profile', 'headless', 'remove', 'zhiji-dsh-plugin')
  Assert-True ($remove.ExitCode -eq 0) "official plugin remove failed:`n$($remove.Output)"
  Write-Output "[remove] $($remove.Output)"

  $profileManifestAfterRemove = Get-Content -Raw -LiteralPath $profileManifestPath -Encoding UTF8 | ConvertFrom-Json
  $bundlesAfterRemove = @($profileManifestAfterRemove.dsh.profile.bundles)
  Assert-True ($bundlesAfterRemove -notcontains 'zhiji-dsh-plugin') 'Profile manifest still lists the removed Bundle'
  Assert-True ($profileManifestAfterRemove.dependencies.'zhiji-dsh-plugin' -eq $null) 'Profile dependency still exists after remove'

  $dumpAfterRemove = Invoke-Dsh @('--profile', 'headless', '--dump-config')
  Assert-True ($dumpAfterRemove.ExitCode -eq 0) "Profile dump-config failed after remove:`n$($dumpAfterRemove.Output)"
  Assert-True ($dumpAfterRemove.Output -notmatch 'zhiji-dsh-plugin') 'Removed Bundle still appears in dump-config'

  $restart = Invoke-Dsh @('--profile', 'headless', '--patch', $overlay, 'Profile restart smoke')
  Assert-True ($restart.ExitCode -eq 0) "Profile failed to start after remove:`n$($restart.Output)"
  Assert-True ($restart.Output -match 'DSH profile restart passed') 'Profile restart output was unexpected'
  Write-Output "[restart] Profile starts successfully after official remove"

  Write-Output 'PASS: S1 official DSH add -> load -> runtime -> remove -> restart validation'
}
finally {
  if ($null -eq $previousDshHome) { Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue } else { $env:DSH_HOME = $previousDshHome }
  if ($null -eq $previousTelemetry) { Remove-Item Env:DSH_TELEMETRY_DISABLED -ErrorAction SilentlyContinue } else { $env:DSH_TELEMETRY_DISABLED = $previousTelemetry }
  if ($null -eq $previousPermission) { Remove-Item Env:DSH_PERMISSION_MODE -ErrorAction SilentlyContinue } else { $env:DSH_PERMISSION_MODE = $previousPermission }
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTemp = (Resolve-Path -LiteralPath $tempRoot).Path
    $resolvedParent = (Resolve-Path -LiteralPath $tempParent).Path
    if ($resolvedTemp.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
  }
}
