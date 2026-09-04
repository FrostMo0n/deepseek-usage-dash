# serve-phone.ps1 — start the PWA gateway and an optional HTTPS tunnel.
# Usage:
#   powershell -File serve-phone.ps1                # default upstream = sandbox example
#   powershell -File serve-phone.ps1 -Target "http://127.0.0.1:3080/api/dsh/usage-stats"
#   powershell -File serve-phone.ps1 -NoTunnel      # LAN only, no cloudflared
# Prints the URL(s) to open on your phone.
param(
    [string]$Target = 'http://127.0.0.1:3081/api/dsh/usage-stats',
    [int]$Port = 8090,
    [switch]$NoTunnel
)
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$nodeCmd = Get-Command node -ErrorAction Stop | Select-Object -ExpandProperty Source
$tools = Join-Path $dir '.tools'
$logDir = Join-Path $dir 'logs'
New-Item -ItemType Directory -Force -Path $tools, $logDir | Out-Null

# stop leftovers
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 700

# 1) gateway (serves ./public and proxies $Target under /api/dsh/usage-stats)
$gwOut = Join-Path $logDir 'gw.out'
$gwErr = Join-Path $logDir 'gw.err'
Start-Process -FilePath $nodeCmd -ArgumentList "`"$dir\gateway.js`" $Port `"$Target`"" -WorkingDirectory $dir -WindowStyle Hidden -RedirectStandardOutput $gwOut -RedirectStandardError $gwErr | Out-Null
Start-Sleep -Seconds 1

$url = ''
if (-not $NoTunnel) {
    # 2) cloudflared quick tunnel (downloads once into .tools)
    $cf = Join-Path $tools 'cloudflared.exe'
    if (-not (Test-Path $cf)) {
        Write-Output 'downloading cloudflared from GitHub (~50MB)...'
        & $nodeCmd "$dir\download-cloudflared.cjs" $cf
    }
    $cfLog = Join-Path $logDir 'cloudflared.log'
    $cfOut = Join-Path $logDir 'cloudflared.out.log'
    if (Test-Path $cfLog) { Remove-Item $cfLog -Force }
    Start-Process -FilePath $cf -ArgumentList "tunnel --no-autoupdate --url http://127.0.0.1:$Port" -WorkingDirectory $logDir -WindowStyle Hidden -RedirectStandardError $cfLog -RedirectStandardOutput $cfOut | Out-Null

    Write-Output "gateway+tunnel starting (target=$Target)..."
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        if (Test-Path $cfLog) {
            $text = Get-Content $cfLog -Raw -ErrorAction SilentlyContinue
            if ($text) {
                $m = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
                if ($m.Success) { $url = $m.Value; break }
            }
        }
    }
} else {
    Write-Output "gateway starting (target=$Target, LAN only)..."
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' } | Select-Object -First 1).IPAddress
Write-Output ''
if ($url) {
    Write-Output "HTTPS URL (any network): $url"
    Write-Output 'Open in Chrome on the phone -> menu -> "Add to Home screen".'
} else {
    Write-Output "LAN URL (same Wi-Fi): http://${ip}:$Port/"
    Write-Output '(no tunnel — install-to-home-screen needs HTTPS; the LAN URL works for browsing)'
}
