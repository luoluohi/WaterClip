param(
  [string]$PackageRoot = "",
  [string]$ScorePath = "example.mscz",
  [int]$Port = 4184
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $PackageRoot) {
  $PackageRoot = Join-Path $repoRoot "release\WaterClip-0.1.0-win-x64-portable"
}
$packagePath = [IO.Path]::GetFullPath($PackageRoot)
$archivePath = "$packagePath.zip"
$checksumPath = "$archivePath.sha256"
$scoreFile = [IO.Path]::GetFullPath((Join-Path $repoRoot $ScorePath))

foreach ($required in $packagePath, $archivePath, $checksumPath, $scoreFile) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Required path not found: $required" }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
$expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split "\s+")[0]
if ($actualHash -ne $expectedHash) { throw "Archive checksum mismatch" }

$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $forbidden = @($zip.Entries | Where-Object {
    $_.FullName -match "(?i)(^|/)(example\.mscz|\.env(?:\.|$))" -or
    [IO.Path]::GetExtension($_.FullName) -in ".mscz", ".waterclip"
  })
  if ($forbidden.Count) { throw "Forbidden archive entries: $($forbidden.FullName -join ', ')" }
  $entryCount = $zip.Entries.Count
} finally {
  $zip.Dispose()
}

$node = Join-Path $packagePath "runtime\node.exe"
$server = Join-Path $packagePath "app\server\dist\index.js"
$prepareMuseScore = Join-Path $packagePath "Prepare-MuseScore.ps1"
$museScore = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $prepareMuseScore -BundleRoot $packagePath | Select-Object -Last 1).Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $museScore)) { throw "MuseScore short-path preparation failed" }
$webRoot = Join-Path $packagePath "app\web"
$buildInfo = Get-Content -LiteralPath (Join-Path $packagePath "BUILD-INFO.json") -Raw | ConvertFrom-Json

$qaRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) "waterclip-portable-qa-$([Guid]::NewGuid().ToString('N'))"))
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $qaRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe QA directory" }
New-Item -ItemType Directory -Path $qaRoot | Out-Null
$musicXml = Join-Path $qaRoot "converted.musicxml"
$stdout = Join-Path $qaRoot "server.stdout.log"
$stderr = Join-Path $qaRoot "server.stderr.log"

$previous = @{}
foreach ($name in "HOST", "PORT", "MUSESCORE_PATH", "WATERCLIP_STATIC_ROOT", "WATERCLIP_OPEN_BROWSER") {
  $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

try {
  $env:HOST = "127.0.0.1"
  $env:PORT = [string]$Port
  $env:MUSESCORE_PATH = $museScore
  $env:WATERCLIP_STATIC_ROOT = $webRoot
  $env:WATERCLIP_OPEN_BROWSER = "0"
  $process = Start-Process -FilePath $node -ArgumentList $server -WorkingDirectory $packagePath -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

  $health = $null
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    if ($process.HasExited) { break }
    try {
      $candidate = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
      if ($candidate.ok -and $candidate.museScore.available) { $health = $candidate; break }
    } catch { }
  }
  if (-not $health) {
    $details = if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw } else { "" }
    throw "Portable server failed: $details"
  }

  & curl.exe --fail-with-body --silent --show-error --form "score=@$scoreFile;type=application/octet-stream" --output $musicXml "http://127.0.0.1:$Port/api/scores/convert"
  if ($LASTEXITCODE -ne 0) {
    $responseBody = if (Test-Path -LiteralPath $musicXml) { Get-Content -LiteralPath $musicXml -Raw } else { "" }
    throw "Example score conversion failed: $responseBody"
  }
  $bytes = [IO.File]::ReadAllBytes($musicXml)
  $head = [Text.Encoding]::UTF8.GetString($bytes, 0, [Math]::Min($bytes.Length, 8192))
  if ($head -notmatch "<score-partwise") { throw "Converted output is not MusicXML" }

  $homepageHtml = & curl.exe --fail --silent "http://127.0.0.1:$Port/"
  if ($LASTEXITCODE -ne 0 -or $homepageHtml -notmatch "<title>WaterClip</title>") { throw "Portable SPA check failed" }

  [ordered]@{
    archiveBytes = (Get-Item -LiteralPath $archivePath).Length
    sha256 = $actualHash
    zipEntries = $entryCount
    gitCommit = $buildInfo.gitCommit
    gitDirty = $buildInfo.gitDirty
    museScoreSourceArchiveBundled = $buildInfo.museScoreSourceArchiveBundled
    exampleMusicXmlBytes = $bytes.Length
    museScoreVersion = $health.museScore.version
    runtimeNode = (& $node --version)
  } | ConvertTo-Json -Depth 3
} finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
  foreach ($name in $previous.Keys) {
    [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process")
  }
  if (Test-Path -LiteralPath $qaRoot) { Remove-Item -LiteralPath $qaRoot -Recurse -Force }
}
