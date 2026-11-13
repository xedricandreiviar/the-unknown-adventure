# Wawa C# API

A small ASP.NET Core service written in C#. It reads the same Supabase database as the
website and builds the barangay service report as JSON or as a printable PDF.

The website is not changed by this folder. Nothing here runs unless you start it.

## What you need
- .NET 8 SDK (check with `dotnet --version`). If you only have a newer SDK, change
  `net8.0` in `WawaApi.csproj` to match, for example `net9.0`.

## First run (PowerShell, inside the `csharp-api` folder)

```powershell
dotnet add package QuestPDF
$env:SUPABASE_URL = "<the same SUPABASE_URL as in the website .env>"
$env:SUPABASE_PUBLISHABLE_KEY = "<the same SUPABASE_PUBLISHABLE_KEY>"
dotnet run
```

`dotnet run` prints the address, for example `http://localhost:5000`.

Check it: open `http://localhost:5000/health`. You should see `{"ok":true,...}`.

## Endpoints
Both report endpoints need `Authorization: Bearer <the signed-in admin's Supabase token>`.
A resident's token is refused (403), and so is a missing token (401).

- `GET /health`
- `GET /api/reports/summary?from=<iso>&to=<iso>` returns the report as JSON
- `GET /api/reports/pdf?from=<iso>&to=<iso>&preparedBy=<name>` returns the PDF

## How it stays safe
The API forwards the admin's own token to Supabase. The database's existing
row-level security still decides what is visible. The API never holds a service key.
