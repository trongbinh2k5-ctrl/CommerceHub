$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$tunnelExe = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
if (-not (Test-Path -LiteralPath $tunnelExe)) { throw "Khong tim thay Cloudflare: $tunnelExe" }
function Test-Port($port) {
    $connection = New-Object System.Net.Sockets.TcpClient
    try { $connection.Connect('127.0.0.1', $port); return $true } catch { return $false } finally { $connection.Dispose() }
}
foreach ($service in @(@{ Folder = 'server'; Port = 5000 }, @{ Folder = 'client'; Port = 5173 })) {
    if (-not (Test-Port $service.Port)) {
        Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run dev' -WorkingDirectory (Join-Path $projectRoot $service.Folder) -WindowStyle Hidden
    }
}
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ((Test-Port 5000) -and (Test-Port 5173)) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'Web chua khoi dong duoc. Hay kiem tra backend va frontend.' }
Write-Host 'Web da san sang. Link Internet se hien ben duoi. Giu cua so nay mo.'
& $tunnelExe tunnel --url http://127.0.0.1:5173 --no-autoupdate 2>&1 | ForEach-Object {
    $line = $_.ToString()
    Write-Host $line
    if ($line -match 'https://([a-z0-9-]+\.trycloudflare\.com)') {
        $tunnelHost = $Matches[1]
        $configPath = Join-Path $projectRoot 'client\vite.config.ts'
        $config = Get-Content -LiteralPath $configPath -Raw
        $config = [regex]::Replace($config, 'allowedHosts:\s*\[[^\]]*\]', "allowedHosts: ['$tunnelHost']")
        Set-Content -LiteralPath $configPath -Value $config -Encoding UTF8
        Write-Host "LINK TRUY CAP: https://$tunnelHost" -ForegroundColor Green
    }
}
