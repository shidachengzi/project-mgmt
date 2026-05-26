# 从 .env 单行读取 INTERNAL_CRON_SECRET= 的值（去 CRLF、去首尾空白、去成对引号）。
# 用法: powershell -File get-internal-cron-secret-from-env.ps1 <path-to-.env>
param(
  [Parameter(Mandatory = $true)]
  [string] $EnvFilePath
)
if (-not (Test-Path -LiteralPath $EnvFilePath)) {
  exit 2
}
$lines = Get-Content -LiteralPath $EnvFilePath -ErrorAction Stop
$last = $lines | Where-Object { $_ -match '^\s*INTERNAL_CRON_SECRET\s*=' } | Select-Object -Last 1
if (-not $last) {
  exit 3
}
$v = ($last -split '=', 2)[1]
if ($null -eq $v) {
  exit 3
}
$v = $v.Trim()
# 去掉行尾注释（值后空格+# 注释）
$hash = $v.IndexOf('#')
if ($hash -ge 0) {
  $v = $v.Substring(0, $hash).TrimEnd()
}
if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
  if ($v.Length -ge 2) {
    $v = $v.Substring(1, $v.Length - 2)
  }
}
Write-Output $v
