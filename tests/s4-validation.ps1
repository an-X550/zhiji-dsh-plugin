param(
  [string]$DshRoot = $env:DSH_SOURCE_ROOT
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($DshRoot)) { throw 'DSH source root is required; pass -DshRoot or set DSH_SOURCE_ROOT.' }
$packageRoot = Split-Path -Parent $PSScriptRoot
$dshCli = Join-Path $DshRoot 'apps\cli\lib\bin.js'
$fixtureRoot = Join-Path $packageRoot 'tests\fixtures'
$overlay = Join-Path $fixtureRoot 'headless-s3-overlay.cordis.yml'
$tempParent = [System.IO.Path]::GetTempPath()
$tempRoot = Join-Path $tempParent ('zhiji-dsh-s4-' + [Guid]::NewGuid().ToString('N'))
$outsideRoot = Join-Path $tempRoot 'outside-repo'
$packOutput = Join-Path $outsideRoot 'package-output'
$dshHome = Join-Path $outsideRoot 'dsh-home'
$profileFixtureRoot = Join-Path $dshHome 'profiles\headless\tests\fixtures'
$previousDshHome = $env:DSH_HOME
$previousTelemetry = $env:DSH_TELEMETRY_DISABLED
$previousPermission = $env:DSH_PERMISSION_MODE

function Fail([string]$message) { throw "S4 validation failed: $message" }
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
  Assert-True (Test-Path -LiteralPath $dshCli -PathType Leaf) "missing DSH CLI: $dshCli"

  $manifest = Get-Content -Raw -LiteralPath (Join-Path $packageRoot 'package.json') -Encoding UTF8 | ConvertFrom-Json
  Assert-True ($manifest.version -eq '0.3.1') "unexpected plugin version: $($manifest.version)"
  Assert-True (@($manifest.keywords) -contains 'dsh-plugin') 'package metadata is missing the dsh-plugin keyword'
  Assert-True ($manifest.publishConfig.access -eq 'public') 'package metadata is not publish-ready'
  Assert-True ($manifest.engines.node -eq '^22.19.0 || >=24.0.0') 'Node compatibility metadata is not exact'
  Assert-True (($manifest.dependencies | Get-Member -MemberType NoteProperty -ErrorAction SilentlyContinue) -eq $null) 'runtime dependencies must remain empty'
  Assert-True ($null -eq $manifest.scripts.install) 'install script is forbidden'
  Assert-True ($null -eq $manifest.scripts.prepare) 'prepare script is forbidden'
  Write-Output '[metadata] version, dsh-plugin keyword, public access, Node and no-install metadata passed'

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
  Assert-True ($null -ne $tarball) 'npm pack produced no tarball outside the package directory'
  $tarList = (& tar -tzf $tarball.FullName 2>&1 | Out-String).Trim()
  Assert-True ($LASTEXITCODE -eq 0) "tarball listing failed:`n$tarList"
  $required = @(
    'package/package.json',
    'package/index.js',
    'package/read-journal-range.js',
    'package/cordis.patch.yml',
    'package/README.md',
    'package/skills/daily-review.md',
    'package/skills/weekly-review.md',
    'package/skills/monthly-review.md',
    'package/skills/project-review.md'
  )
  foreach ($entry in $required) { Assert-True ($tarList -match [regex]::Escape($entry)) "tarball missing $entry" }
  Assert-True ($tarList -notmatch 'package/tests/') 'tarball contains tests or fixtures'
  Assert-True ($tarList -notmatch 'node_modules|package-lock|\.review-') 'tarball contains development-only files'
  $runtimeSource = (& tar -xOzf $tarball.FullName package/read-journal-range.js 2>&1 | Out-String)
  Assert-True ($runtimeSource -notmatch 'D:\\AI\\deepseek-harness|\.claude[\\/]') 'tarball contains a project absolute path'
  Write-Output '[pack] local tarball whitelist and runtime source check passed'

  $dshPackage = Get-Content -Raw -LiteralPath (Join-Path $DshRoot 'apps\cli\package.json') -Encoding UTF8 | ConvertFrom-Json
  $upstreamCommit = (& git -C $DshRoot rev-parse HEAD 2>&1 | Out-String).Trim()
  Assert-True ($dshPackage.version -eq '0.1.0-rc.8') "unexpected DSH package version: $($dshPackage.version)"
  Assert-True ($upstreamCommit -eq '141eb6fef83422698aef7a981029e843e8161534') "unexpected DSH upstream commit: $upstreamCommit"
  Write-Output "[compatibility] DSH $($dshPackage.version), commit $upstreamCommit"

  $env:DSH_HOME = $dshHome
  $env:DSH_TELEMETRY_DISABLED = '1'
  $env:DSH_PERMISSION_MODE = 'read-only'
  New-Item -ItemType Directory -Path $profileFixtureRoot -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $fixtureRoot 'dsh-s3-mock-llm.mjs') -Destination (Join-Path $profileFixtureRoot 'dsh-s3-mock-llm.mjs') -Force

  Push-Location $outsideRoot
  try {
    $add = Invoke-Dsh @('plugin', '--profile', 'headless', 'add', $tarball.FullName)
  } finally { Pop-Location }
  Assert-True ($add.ExitCode -eq 0) ('outside-repo official add failed:' + [Environment]::NewLine + $add.Output)
  $manifestPath = Join-Path $dshHome 'profiles\headless\package.json'
  $profileManifest = Get-Content -Raw -LiteralPath $manifestPath -Encoding UTF8 | ConvertFrom-Json
  Assert-True (@($profileManifest.dsh.profile.bundles) -contains 'zhiji-dsh-plugin') 'outside-repo install did not activate Bundle'
  $dump = Invoke-Dsh @('--profile', 'headless', '--dump-config')
  Assert-True ($dump.ExitCode -eq 0) ('dump-config failed after outside-repo install:' + [Environment]::NewLine + $dump.Output)
  Assert-True ($dump.Output -match 'zhiji-dsh-plugin') 'dump-config missing installed Bundle'
  Write-Output '[install-outside-repo] official tarball add and Bundle recognition passed'

  $remove = Invoke-Dsh @('plugin', '--profile', 'headless', 'remove', 'zhiji-dsh-plugin')
  Assert-True ($remove.ExitCode -eq 0) "official remove failed:`n$($remove.Output)"
  $afterRemove = Get-Content -Raw -LiteralPath $manifestPath -Encoding UTF8 | ConvertFrom-Json
  Assert-True (@($afterRemove.dsh.profile.bundles) -notcontains 'zhiji-dsh-plugin') 'Bundle remains after remove'
  $restart = Invoke-Dsh @('--profile', 'headless', '--patch', $overlay, 'S4 restart smoke')
  Assert-True ($restart.ExitCode -eq 0) ('restart after remove failed:' + [Environment]::NewLine + $restart.Output)
  Assert-True ($restart.Output -match 'DSH profile restart passed') 'restart output was not the expected smoke result'
  Write-Output '[remove-restart] official remove and clean Profile restart passed'
  Write-Output 'PASS: S4 package metadata -> whitelist -> outside-repo add -> remove -> restart validation'
}
finally {
  if ($null -eq $previousDshHome) { Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue } else { $env:DSH_HOME = $previousDshHome }
  if ($null -eq $previousTelemetry) { Remove-Item Env:DSH_TELEMETRY_DISABLED -ErrorAction SilentlyContinue } else { $env:DSH_TELEMETRY_DISABLED = $previousTelemetry }
  if ($null -eq $previousPermission) { Remove-Item Env:DSH_PERMISSION_MODE -ErrorAction SilentlyContinue } else { $env:DSH_PERMISSION_MODE = $previousPermission }
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTemp = (Resolve-Path -LiteralPath $tempRoot).Path
    $resolvedParent = Split-Path -Parent $resolvedTemp
    if ($resolvedTemp.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force }
  }
}
