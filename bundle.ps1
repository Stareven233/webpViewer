[CmdletBinding()]
param(
    # 可选的 dist 内容复制目标目录；留空时不执行复制。
    [Parameter()]
    [string]$CopyTargetDirectory = ''
)
# .\bundle.ps1 -CopyTargetDirectory 'D:\your\target'

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$PackageJsonPath = Join-Path $ProjectRoot 'package.json'
$DistDirectory = Join-Path $ProjectRoot 'dist'

Push-Location -LiteralPath $ProjectRoot
try {
    Write-Host 'Running bun run build...'
    & bun run build
    if ($LASTEXITCODE -ne 0) {
        throw "bun run build failed with exit code $LASTEXITCODE."
    }

    if (-not (Test-Path -LiteralPath $PackageJsonPath -PathType Leaf)) {
        throw "package.json was not found: $PackageJsonPath"
    }

    $PackageJson = Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json
    $Version = [string]$PackageJson.version
    if ([string]::IsNullOrWhiteSpace($Version)) {
        throw 'The version field in package.json is empty.'
    }

    if (-not (Test-Path -LiteralPath $DistDirectory -PathType Container)) {
        throw "dist directory was not created: $DistDirectory"
    }

    $ArchiveName = "webpviewer-v$Version-win_amd64.zip"
    $ArchivePath = Join-Path $DistDirectory $ArchiveName
    # 临时压缩包必须放在 dist 外部，避免压缩时把自身纳入源目录。
    $TempArchivePath = Join-Path $ProjectRoot $ArchiveName
    if (Test-Path -LiteralPath $TempArchivePath -PathType Leaf) {
        Remove-Item -LiteralPath $TempArchivePath -Force
    }
    elseif (Test-Path -LiteralPath $TempArchivePath) {
        throw "Temporary archive path is not a file: $TempArchivePath"
    }
    if (Test-Path -LiteralPath $ArchivePath -PathType Leaf) {
        Remove-Item -LiteralPath $ArchivePath -Force
    }
    elseif (Test-Path -LiteralPath $ArchivePath) {
        throw "Archive path is not a file: $ArchivePath"
    }

    # 使用 .NET 压缩 API，并关闭根目录包含，确保 ZIP 内直接是 dist 的内容。
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $DistDirectory,
        $TempArchivePath,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )
    Move-Item -LiteralPath $TempArchivePath -Destination $ArchivePath -Force
    Write-Host "Created archive: $ArchivePath"

    if (-not [string]::IsNullOrWhiteSpace($CopyTargetDirectory)) {
        if (Test-Path -LiteralPath $CopyTargetDirectory -PathType Container) {
            # -Force 覆盖同名文件；-Recurse 保留 dist 内部的目录结构。
            Get-ChildItem -LiteralPath $DistDirectory -Force |
                Copy-Item -Destination $CopyTargetDirectory -Recurse -Force
            Write-Host "Copied dist contents to: $CopyTargetDirectory"
        }
        else {
            Write-Warning "Copy target directory does not exist, skipping copy: $CopyTargetDirectory"
        }
    }
}
finally {
    Pop-Location
}
