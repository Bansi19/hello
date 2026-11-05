$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'

if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Missing $envFile. Add VITE_SUPABASE_URL before running this script."
}

$urlLine = Get-Content -LiteralPath $envFile |
  Where-Object { $_ -match '^\s*VITE_SUPABASE_URL\s*=\s*(.+?)\s*$' } |
  Select-Object -First 1

if (-not $urlLine) {
  throw 'VITE_SUPABASE_URL was not found in .env.'
}

$supabaseUrl = ($urlLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
$uri = [Uri]$supabaseUrl
$projectRef = $uri.Host.Split('.')[0]

if (-not $projectRef) {
  throw 'Could not determine the Supabase project reference from VITE_SUPABASE_URL.'
}

$secureToken = Read-Host 'Supabase personal access token' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
  $accessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  $headers = @{
    Authorization = "Bearer $accessToken"
    'Content-Type' = 'application/json'
  }

  $result = Invoke-RestMethod `
    -Method Patch `
    -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" `
    -Headers $headers `
    -Body '{"mailer_autoconfirm":true}'

  if ($result.mailer_autoconfirm -ne $true) {
    throw 'Supabase did not confirm that automatic confirmation was enabled.'
  }

  Write-Host 'Email confirmation is disabled. New sign-ups will receive a session immediately.' -ForegroundColor Green
}
finally {
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  Remove-Variable accessToken -ErrorAction SilentlyContinue
}
