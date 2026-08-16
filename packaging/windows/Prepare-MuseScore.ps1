param(
  [Parameter(Mandatory = $true)][string]$BundleRoot
)

$ErrorActionPreference = "Stop"
$bundlePath = [IO.Path]::GetFullPath($BundleRoot)
$target = [IO.Path]::GetFullPath((Join-Path $bundlePath "third_party\MuseScore 4"))
$targetExe = Join-Path $target "bin\MuseScore4.exe"
if (-not (Test-Path -LiteralPath $targetExe)) { throw "Bundled MuseScore4.exe not found: $targetExe" }

$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "WaterClip\runtime"))
$link = [IO.Path]::GetFullPath((Join-Path $runtimeRoot "musescore-4.7.4"))
if (-not $link.StartsWith($runtimeRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe MuseScore runtime link path"
}
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

if (Test-Path -LiteralPath $link) {
  $item = Get-Item -LiteralPath $link -Force
  $currentTarget = if ($item.LinkType -eq "Junction") { [IO.Path]::GetFullPath([string]$item.Target) } else { "" }
  if ($currentTarget -ne $target) {
    if ($item.LinkType -ne "Junction") { throw "Runtime link path is occupied by a real directory: $link" }
    Remove-Item -LiteralPath $link -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $link) {
      & cmd.exe /c rmdir "$link" | Out-Null
    }
  }
}
if (-not (Test-Path -LiteralPath $link)) {
  New-Item -ItemType Junction -Path $link -Target $target | Out-Null
}

Write-Output (Join-Path $link "bin\MuseScore4.exe")
