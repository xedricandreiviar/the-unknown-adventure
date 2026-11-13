using WawaApi;

var builder = WebApplication.CreateBuilder(args);

// Which websites may call this API from the browser, for example the Vercel site.
// Set ALLOWED_ORIGINS to a comma-separated list; the local dev site is always allowed.
var allowedOrigins = (builder.Configuration["ALLOWED_ORIGINS"] ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Concat(new[] { "http://localhost:8080", "http://localhost:5173", "http://localhost:3000" })
    .ToArray();

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddHttpClient<SupabaseClient>();
builder.Services.AddScoped<ReportService>();

var app = builder.Build();
app.UseCors();

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "wawa-api" }));

static string? TokenFrom(HttpRequest request)
{
    var header = request.Headers.Authorization.ToString();
    return header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header[7..].Trim() : null;
}

static bool TryRange(HttpRequest request, out DateTimeOffset from, out DateTimeOffset to, out string error)
{
    from = default;
    to = default;
    error = "";
    if (!DateTimeOffset.TryParse(request.Query["from"].ToString(), out from) ||
        !DateTimeOffset.TryParse(request.Query["to"].ToString(), out to))
    {
        error = "Send from and to as ISO dates, for example ?from=2026-11-13T00:00:00%2B08:00&to=2026-11-13T23:59:59%2B08:00.";
        return false;
    }
    if (from > to) { error = "The start must be before the end."; return false; }
    if ((to - from).TotalDays > 366) { error = "Choose a range of one year or less."; return false; }
    return true;
}

// JSON version of the report.
app.MapGet("/api/reports/summary", async (HttpRequest request, SupabaseClient db, ReportService reports) =>
{
    var token = TokenFrom(request);
    if (token is null) return Results.Unauthorized();
    if (!await db.IsAdminAsync(token)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    if (!TryRange(request, out var from, out var to, out var error)) return Results.BadRequest(new { error });
    return Results.Ok(await reports.BuildAsync(from, to, token));
});

// The same report as a printable PDF.
app.MapGet("/api/reports/pdf", async (HttpRequest request, SupabaseClient db, ReportService reports) =>
{
    var token = TokenFrom(request);
    if (token is null) return Results.Unauthorized();
    if (!await db.IsAdminAsync(token)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    if (!TryRange(request, out var from, out var to, out var error)) return Results.BadRequest(new { error });
    var data = await reports.BuildAsync(from, to, token);
    var pdf = ReportPdf.Build(data, preparedBy: request.Query["preparedBy"].ToString());
    return Results.File(pdf, "application/pdf", $"wawa-report-{from:yyyy-MM-dd}.pdf");
});

app.Run();
