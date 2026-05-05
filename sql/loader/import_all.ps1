param(
  [string]$User = "app_user",
  [string]$Password = "",
  [string]$ConnectString = "127.0.0.1:1521/XE",
  [switch]$TruncateFirst
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Password)) {
  Write-Host "Usage example:"
  Write-Host "  .\import_all.ps1 -User app_user -Password 'YourPassword' -ConnectString '127.0.0.1:1521/XE' -TruncateFirst"
  exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $scriptDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$safePassword = $Password.Replace('"', '""')
$connSqlPlus = "$User/`"$safePassword`"@$ConnectString"
$connSqlLdr = "$User/$Password@$ConnectString"

function Run-SqlLoader {
  param([string]$CtlName)
  $ctl = Join-Path $scriptDir $CtlName
  $base = [System.IO.Path]::GetFileNameWithoutExtension($CtlName)
  $log = Join-Path $logDir "$base.log"
  $bad = Join-Path $logDir "$base.bad"
  $discard = Join-Path $logDir "$base.dsc"

  Write-Host "Loading $CtlName ..."
  $out = & sqlldr $connSqlLdr "control=`"$ctl`"" "log=`"$log`"" "bad=`"$bad`"" "discard=`"$discard`"" direct=true 2>&1
  $outText = ($out | Out-String)
  if ($LASTEXITCODE -ne 0 -or $outText -match "SQL\*Loader-100|LRM-00112|Syntax error on command-line") {
    if ($outText) { Write-Host $outText }
    throw "SQL*Loader failed for $CtlName. Check $log"
  }
}

if ($TruncateFirst) {
  Write-Host "Truncating target tables first ..."
  $truncateSql = @"
WHENEVER SQLERROR EXIT SQL.SQLCODE
TRUNCATE TABLE FACT_TRANSACTIONS;
TRUNCATE TABLE FACT_BUDGET;
DELETE FROM DIM_DATE;
DELETE FROM DIM_CATEGORY;
DELETE FROM DIM_ACCOUNT;
COMMIT;
EXIT
"@
  $truncateOut = $truncateSql | sqlplus -s $connSqlPlus
  if ($LASTEXITCODE -ne 0) {
    if ($truncateOut) { Write-Host $truncateOut }
    throw "Failed to truncate tables."
  }
}

Run-SqlLoader "dim_date.ctl"
Run-SqlLoader "dim_category.ctl"
Run-SqlLoader "dim_account.ctl"
Run-SqlLoader "fact_budget.ctl"
Run-SqlLoader "fact_transactions.ctl"

Write-Host "Refreshing MV_MONTHLY_SPEND ..."
$refreshSql = @"
WHENEVER SQLERROR EXIT SQL.SQLCODE
BEGIN
  DBMS_MVIEW.REFRESH('MV_MONTHLY_SPEND', 'C');
END;
/
EXIT
"@
$refreshOut = $refreshSql | sqlplus -s $connSqlPlus
if ($LASTEXITCODE -ne 0) {
  if ($refreshOut) { Write-Host $refreshOut }
  throw "Materialized view refresh failed."
}

Write-Host ""
Write-Host "Import complete."
Write-Host "Logs: $logDir"
