# Windows PowerShell 5.1+. No profile, elevation, desktop automation or process termination.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-CompatibleNode {
    param([string] $Candidate)
    if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) { return $null }
    try {
        $version = & $Candidate --version 2>$null
        if ($LASTEXITCODE -eq 0 -and "$version" -match '^v(\d+)\.\d+\.\d+$' -and [int]$Matches[1] -ge 20) {
            return $Candidate
        }
    } catch {
        # An incompatible or unlaunchable candidate does not block fallback.
    }
    return $null
}

function Install-PortableNode {
    param([string] $ToolsDirectory, [string] $NodeDirectory)
    # Fixed official LTS release, never an unpinned "latest" download.
    $version = '24.11.1'
    $architecture = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $architecture = $env:PROCESSOR_ARCHITEW6432 }
    switch ($architecture.ToUpperInvariant()) {
        'AMD64' { $platform = 'x64' }
        'ARM64' { $platform = 'arm64' }
        default { throw 'Automatic Node download supports Windows x64/ARM64. Install Node >=20 on PATH for this architecture.' }
    }
    $name = "node-v$version-win-$platform"
    $zipName = "$name.zip"
    $base = "https://nodejs.org/dist/v$version"
    # Pin the official checksum as well as fetching SHASUMS256.txt over HTTPS.
    $pinned = @{
        x64 = '5355ae6d7c49eddcfde7d34ac3486820600a831bf81dc3bdca5c8db6a9bb0e76'
        arm64 = 'ce9ee4e547ebdff355beb48e309b166c24df6be0291c9eaf103ce15f3de9e5b4'
    }
    New-Item -ItemType Directory -Path $ToolsDirectory -Force | Out-Null
    $lockPath = Join-Path $ToolsDirectory 'node-download.lock'
    $lock = $null
    $stage = $null
    try {
        $lock = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $ready = Get-CompatibleNode (Join-Path $NodeDirectory 'node.exe')
        if ($ready) { return $ready }
        if (Test-Path -LiteralPath $NodeDirectory) {
            throw 'Cached .tools/node is unusable. Move it aside manually and retry; no existing cache was deleted.'
        }
        $stage = Join-Path $ToolsDirectory ('node-download-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $stage | Out-Null
        $zip = Join-Path $stage $zipName
        $checksums = Join-Path $stage 'SHASUMS256.txt'
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        Write-Host "Downloading official Node.js v$version ($platform); first use requires Internet access."
        Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -OutFile $checksums -UseBasicParsing -TimeoutSec 120
        $pattern = '^([a-fA-F0-9]{64})\s+\*?' + [Regex]::Escape($zipName) + '$'
        $expected = $null
        foreach ($line in [IO.File]::ReadAllLines($checksums)) {
            if ($line -match $pattern) {
                if ($expected) { throw 'Duplicate official checksum entry.' }
                $expected = $Matches[1].ToLowerInvariant()
            }
        }
        if (-not $expected -or $expected -ne $pinned[$platform]) { throw 'Official SHASUMS entry is absent or differs from the pinned checksum.' }
        Invoke-WebRequest -Uri "$base/$zipName" -OutFile $zip -UseBasicParsing -TimeoutSec 600
        if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
            throw 'Node ZIP SHA256 verification failed; nothing was installed.'
        }
        $expanded = Join-Path $stage 'expanded'
        Expand-Archive -LiteralPath $zip -DestinationPath $expanded
        $extracted = Join-Path $expanded $name
        $candidate = Get-CompatibleNode (Join-Path $extracted 'node.exe')
        if (-not $candidate) { throw 'Downloaded Node could not run on this Windows installation.' }
        Move-Item -LiteralPath $extracted -Destination $NodeDirectory
        return (Join-Path $NodeDirectory 'node.exe')
    } finally {
        try {
            if ($stage -and (Test-Path -LiteralPath $stage)) {
                # Recursive deletion is restricted to this invocation's checked staging folder.
                $resolvedTools = [IO.Path]::GetFullPath($ToolsDirectory).TrimEnd('\') + '\'
                $resolvedStage = [IO.Path]::GetFullPath($stage)
                if (-not $resolvedStage.StartsWith($resolvedTools, [StringComparison]::OrdinalIgnoreCase) -or
                    [IO.Path]::GetFileName($resolvedStage) -notmatch '^node-download-[a-f0-9]{32}$') {
                    throw 'Refusing to clean an unexpected staging path.'
                }
                Remove-Item -LiteralPath $resolvedStage -Recurse -Force
            }
        } finally {
            if ($null -ne $lock) {
                $lock.Dispose()
                Remove-Item -LiteralPath $lockPath -Force
            }
        }
    }
}

try {
    if ($args.Count -lt 1 -or $args[0] -notin @('install', 'restore')) { throw 'Use install.bat or restore.bat.' }
    $mode = $args[0]
    [string[]] $cliArguments = @($args | Select-Object -Skip 1)
    if ($mode -eq 'restore') { $cliArguments = @('--restore') + $cliArguments }
    $project = Split-Path -Parent $PSScriptRoot
    $cli = Join-Path $project 'bin/postman-zh-cn.cjs'
    if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw 'Missing CLI. Extract or clone the complete repository first.' }
    $node = $null
    $commands = @(Get-Command node.exe -CommandType Application -All -ErrorAction SilentlyContinue)
    foreach ($command in $commands) {
        $node = Get-CompatibleNode $command.Source
        if ($node) { break }
    }
    $tools = Join-Path $project '.tools'
    $nodeDirectory = Join-Path $tools 'node'
    if (-not $node) { $node = Get-CompatibleNode (Join-Path $nodeDirectory 'node.exe') }
    if (-not $node) { $node = Install-PortableNode $tools $nodeDirectory }
    # Working directory is deliberately unchanged: relative user arguments keep their meaning.
    & $node $cli @cliArguments
    $result = $LASTEXITCODE
    if ($result -ne 0) { Write-Host 'CLI failed. Postman was not closed automatically.' -ForegroundColor Red }
    exit $result
} catch {
    [Console]::Error.WriteLine('Launcher error: ' + $_.Exception.Message)
    exit 1
}
