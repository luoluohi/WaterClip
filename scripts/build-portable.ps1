param(
  [string]$OutputRoot = "",
  [string]$MuseScoreRoot = "C:\Program Files\MuseScore 4",
  [string]$NodeExe = "",
  [switch]$SkipArchive,
  [switch]$SkipMuseScoreSourceArchive
)

$ErrorActionPreference = "Stop"

function Get-RemoteFile {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Destination,
    [long]$MinimumBytes = 1
  )
  $curl = (Get-Command curl.exe -ErrorAction Stop).Source
  & $curl --location --fail --silent --show-error --retry 5 --retry-delay 2 --retry-all-errors --max-time 3600 --output $Destination $Uri
  if ($LASTEXITCODE -ne 0) { throw "Download failed: $Uri" }
  $download = Get-Item -LiteralPath $Destination -ErrorAction Stop
  if ($download.Length -lt $MinimumBytes) { throw "Downloaded file is incomplete: $Uri" }
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $OutputRoot) { $OutputRoot = Join-Path $repoRoot "release" }
$outputRootPath = [IO.Path]::GetFullPath($OutputRoot)
$packageName = "WaterClip-0.1.0-win-x64-portable"
$packageDir = [IO.Path]::GetFullPath((Join-Path $outputRootPath $packageName))
$archivePath = [IO.Path]::GetFullPath((Join-Path $outputRootPath "$packageName.zip"))
$stagingRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot ".release-staging"))

if ($packageDir -eq $outputRootPath -or -not $packageDir.StartsWith($outputRootPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe release directory: $packageDir"
}
if (-not (Test-Path -LiteralPath (Join-Path $MuseScoreRoot "bin\MuseScore4.exe"))) {
  throw "MuseScore4.exe not found: $MuseScoreRoot"
}
if (-not $NodeExe) { $NodeExe = (Get-Command node -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $NodeExe)) { throw "Node.js runtime not found: $NodeExe" }

New-Item -ItemType Directory -Path $outputRootPath -Force | Out-Null
if (Test-Path -LiteralPath $packageDir) { Remove-Item -LiteralPath $packageDir -Recurse -Force }
if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
New-Item -ItemType Directory -Path $packageDir, $stagingRoot -Force | Out-Null

Push-Location $repoRoot
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "Production build failed" }

  $serverDir = Join-Path $packageDir "app\server"
  $webDir = Join-Path $packageDir "app\web"
  $runtimeDir = Join-Path $packageDir "runtime"
  $licenseDir = Join-Path $packageDir "licenses"
  $sourceDir = Join-Path $packageDir "corresponding-source"
  $thirdPartyDir = Join-Path $packageDir "third_party"
  New-Item -ItemType Directory -Path $serverDir, $webDir, $runtimeDir, $licenseDir, $sourceDir, $thirdPartyDir -Force | Out-Null

  Copy-Item -LiteralPath "apps\server\dist" -Destination $serverDir -Recurse
  Copy-Item -Path "apps\web\dist\*" -Destination $webDir -Recurse
  Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $runtimeDir "node.exe")
  Copy-Item -LiteralPath "packaging\windows\WaterClip.vbs", "packaging\windows\WaterClip-console.cmd", "packaging\windows\Stop-WaterClip.cmd", "packaging\windows\README.txt" -Destination $packageDir
  Copy-Item -LiteralPath "docs\OPEN_SOURCE_AUDIT.md" -Destination (Join-Path $packageDir "OPEN-SOURCE-AUDIT.md")
  Copy-Item -LiteralPath "SECURITY.md" -Destination $packageDir

  $serverPackage = Get-Content -LiteralPath "apps\server\package.json" -Raw | ConvertFrom-Json
  $runtimePackage = [ordered]@{
    name = "waterclip-portable-server"
    version = "0.1.0"
    private = $true
    type = "module"
    dependencies = $serverPackage.dependencies
  }
  $runtimePackage | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $serverDir "package.json") -Encoding utf8
  & npm install --omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --prefix $serverDir
  if ($LASTEXITCODE -ne 0) { throw "Production dependency install failed" }

  Copy-Item -LiteralPath $MuseScoreRoot -Destination (Join-Path $thirdPartyDir "MuseScore 4") -Recurse
  $bundledMuseScore = Join-Path $packageDir "third_party\MuseScore 4\bin\MuseScore4.exe"
  $bundledAutomationAssets = Join-Path $packageDir "third_party\MuseScore 4\autobotscripts"
  if (Test-Path -LiteralPath $bundledAutomationAssets) {
    Remove-Item -LiteralPath $bundledAutomationAssets -Recurse -Force
  }
  $museVersionText = (& $bundledMuseScore --long-version 2>&1 | Out-String).Trim()
  if ($museVersionText -notmatch "Version\s+(?<version>4\.\d+\.\d+).*Build\s+(?<build>[0-9a-f]+)") {
    throw "Unable to verify bundled MuseScore version: $museVersionText"
  }
  $museVersion = $Matches.version
  $museBuild = $Matches.build
  $museTag = "v$museVersion"

  Get-RemoteFile -Uri "https://raw.githubusercontent.com/musescore/MuseScore/$museTag/LICENSE.txt" -Destination (Join-Path $licenseDir "MuseScore-GPL-3.0.txt") -MinimumBytes 10kb
  Copy-Item -LiteralPath (Join-Path $MuseScoreRoot "sound\MS Basic_License.md") -Destination (Join-Path $licenseDir "MuseScore-MS-Basic-SoundFont.md")

  $nodeVersion = (& $NodeExe --version).Trim().TrimStart("v")
  Get-RemoteFile -Uri "https://raw.githubusercontent.com/nodejs/node/v$nodeVersion/LICENSE" -Destination (Join-Path $licenseDir "Node.js-LICENSE.txt") -MinimumBytes 10kb
  if (-not $SkipMuseScoreSourceArchive) {
    $sourceArchiveName = "MuseScore-$museVersion-source.zip"
    Get-RemoteFile -Uri "https://codeload.github.com/musescore/MuseScore/zip/refs/tags/$museTag" -Destination (Join-Path $sourceDir $sourceArchiveName) -MinimumBytes 1mb
  }

  $sourceStatus = if ($SkipMuseScoreSourceArchive) {
    "The source archive is not bundled in this internal candidate. Do not publicly redistribute this binary until equivalent access to the exact corresponding source is provided beside the download."
  } else {
    "The main-repository source archive is bundled at corresponding-source/MuseScore-$museVersion-source.zip. Public distributors must also verify required submodule and third-party source availability."
  }
  @(
    "MuseScore Studio source availability",
    "Version: $museVersion",
    "Build commit: $museBuild",
    "Tag: https://github.com/musescore/MuseScore/releases/tag/$museTag",
    "Source: https://github.com/musescore/MuseScore/tree/$museTag",
    "Archive: https://codeload.github.com/musescore/MuseScore/zip/refs/tags/$museTag",
    "",
    $sourceStatus
  ) | Set-Content -LiteralPath (Join-Path $sourceDir "MUSESCORE-SOURCE.txt") -Encoding utf8

  $notices = @(
    "# Third-party components and source code",
    "",
    "- MuseScore Studio $museVersion (Build $museBuild): GNU GPL version 3. See licenses/MuseScore-GPL-3.0.txt and corresponding-source/MUSESCORE-SOURCE.txt. Upstream tag: https://github.com/musescore/MuseScore/releases/tag/$museTag",
    "- MuseScore MS Basic SoundFont: MIT plus the attribution requirements in licenses/MuseScore-MS-Basic-SoundFont.md.",
    "- Node.js ${nodeVersion}: see licenses/Node.js-LICENSE.txt.",
    "- The WaterClip frontend includes alphaTab, React, ExcelJS, Bravura, Sonivox, and other dependencies whose licenses remain in package metadata or bundled asset directories.",
    "",
    "WaterClip and MuseScore interact across a command-line and temporary-file boundary as separate programs. Bundling them on one medium does not restrict MuseScore GPLv3 rights. Distributors remain responsible for corresponding-source availability. This is not legal advice."
  )
  $notices | Set-Content -LiteralPath (Join-Path $licenseDir "THIRD-PARTY-NOTICES.md") -Encoding utf8

  $gitCommit = (& git rev-parse HEAD).Trim()
  $gitDirty = [bool]((& git status --porcelain) | Select-Object -First 1)
  $buildInfo = [ordered]@{
    product = "WaterClip"
    version = "0.1.0"
    platform = "win-x64"
    builtAtUtc = [DateTime]::UtcNow.ToString("o")
    gitCommit = $gitCommit
    gitDirty = $gitDirty
    nodeVersion = $nodeVersion
    museScoreVersion = $museVersion
    museScoreBuild = $museBuild
    museScoreSourceArchiveBundled = -not [bool]$SkipMuseScoreSourceArchive
    nodeSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $runtimeDir "node.exe")).Hash.ToLowerInvariant()
    museScoreSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $bundledMuseScore).Hash.ToLowerInvariant()
  }
  $buildInfo | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $packageDir "BUILD-INFO.json") -Encoding utf8

  if (Get-ChildItem -LiteralPath $packageDir -File -Recurse | Where-Object { $_.Extension -in ".mscz", ".waterclip" }) {
    throw "Release unexpectedly contains a user project or score"
  }

  $smokeLog = Join-Path $stagingRoot "portable-smoke.log"
  $smokeError = Join-Path $stagingRoot "portable-smoke-error.log"
  $previous = @{}
  foreach ($name in "HOST", "PORT", "MUSESCORE_PATH", "WATERCLIP_STATIC_ROOT", "WATERCLIP_PID_FILE", "WATERCLIP_OPEN_BROWSER") {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
  }
  try {
    $env:HOST = "127.0.0.1"
    $env:PORT = "4174"
    $env:MUSESCORE_PATH = $bundledMuseScore
    $env:WATERCLIP_STATIC_ROOT = $webDir
    $env:WATERCLIP_PID_FILE = Join-Path $stagingRoot "waterclip.pid"
    $env:WATERCLIP_OPEN_BROWSER = "0"
    $process = Start-Process -FilePath (Join-Path $runtimeDir "node.exe") -ArgumentList (Join-Path $serverDir "dist\index.js") -WorkingDirectory $packageDir -WindowStyle Hidden -RedirectStandardOutput $smokeLog -RedirectStandardError $smokeError -PassThru
    $healthy = $false
    for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
      Start-Sleep -Milliseconds 250
      if ($process.HasExited) { break }
      try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:4174/api/health" -TimeoutSec 2
        if ($health.ok -and $health.museScore.available) { $healthy = $true; break }
      } catch { }
    }
    if (-not $healthy) {
      $details = if (Test-Path $smokeError) { Get-Content -LiteralPath $smokeError -Raw } else { "" }
      throw "Portable health check failed. $details"
    }
  } finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
  }

  if (-not $SkipArchive) {
    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    Compress-Archive -LiteralPath $packageDir -DestinationPath $archivePath -CompressionLevel Optimal
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    "$hash  $([IO.Path]::GetFileName($archivePath))" | Set-Content -LiteralPath "$archivePath.sha256" -Encoding ascii
  }

  Write-Host "Portable release created: $packageDir"
  if (-not $SkipArchive) { Write-Host "Archive: $archivePath" }
} finally {
  Pop-Location
}
