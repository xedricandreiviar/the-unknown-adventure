# Run this script to start the C# certificate/PDF API.
# Double-click it in Explorer, or run it from PowerShell.
#
#   Right-click start.ps1 → Run with PowerShell

$env:SUPABASE_URL              = "https://airibkjrviomoletpdwu.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY  = "sb_publishable_V9vn4Z6ddDjfuUFmIGcyEA_Qy49EfP6"

Write-Host "Starting Wawa C# API on http://localhost:5000 ..."
dotnet run --urls "http://localhost:5000"
