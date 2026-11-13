using System.Text.Json;

namespace WawaApi;

public record RequestRow(string Code, string Status, DateTimeOffset CreatedAt, string Service, string Resident);

public record ProblemRow(
    string Category, string Status, DateTimeOffset CreatedAt, string Resident, string Location, string Description);

public record ReportSummary(
    int RequestsReceived, int RequestsCompleted, int RequestsRejected, int RequestsCancelled,
    int ProblemsReceived, int ProblemsResolved, int ProblemsRejected);

public record ReportData(
    DateTimeOffset From, DateTimeOffset To, ReportSummary Summary,
    List<RequestRow> Requests, List<ProblemRow> Problems);

/// <summary>Builds the barangay service report from requests and problem reports in a date range.</summary>
public class ReportService
{
    private readonly SupabaseClient _db;

    public ReportService(SupabaseClient db) => _db = db;

    private static string Text(JsonElement row, string name) =>
        row.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";

    private static string Person(JsonElement row)
    {
        if (!row.TryGetProperty("resident", out var resident) || resident.ValueKind != JsonValueKind.Object)
            return "Resident not found";
        var name = $"{Text(resident, "first_name")} {Text(resident, "last_name")}".Trim();
        return name.Length == 0 ? "No name on file" : name;
    }

    public async Task<ReportData> BuildAsync(DateTimeOffset from, DateTimeOffset to, string userToken)
    {
        var f = Uri.EscapeDataString(from.ToUniversalTime().ToString("o"));
        var t = Uri.EscapeDataString(to.ToUniversalTime().ToString("o"));

        var requestRows = await _db.GetRowsAsync(
            "/rest/v1/service_requests?select=code,status,created_at,updated_at,service:services(name),resident:profiles(first_name,last_name)"
            + $"&or=(and(created_at.gte.{f},created_at.lte.{t}),and(updated_at.gte.{f},updated_at.lte.{t}))"
            + "&order=created_at.asc",
            userToken);

        var problemRows = await _db.GetRowsAsync(
            "/rest/v1/problem_reports?select=category,description,street,purok,status,created_at,updated_at,resident:profiles(first_name,last_name)"
            + $"&or=(and(created_at.gte.{f},created_at.lte.{t}),and(updated_at.gte.{f},updated_at.lte.{t}))"
            + "&order=created_at.asc",
            userToken);

        var requests = new List<RequestRow>();
        var requestsClosedInRange = new Dictionary<string, int>();
        var received = 0;
        foreach (var row in requestRows.EnumerateArray())
        {
            var created = row.GetProperty("created_at").GetDateTimeOffset();
            var updated = row.GetProperty("updated_at").GetDateTimeOffset();
            var status = Text(row, "status");
            if (created >= from && created <= to) received++;
            if (updated >= from && updated <= to)
                requestsClosedInRange[status] = requestsClosedInRange.GetValueOrDefault(status) + 1;
            var service = row.TryGetProperty("service", out var s) && s.ValueKind == JsonValueKind.Object
                ? Text(s, "name")
                : "Service";
            requests.Add(new RequestRow(Text(row, "code"), status, created, service, Person(row)));
        }

        var problems = new List<ProblemRow>();
        var problemsClosedInRange = new Dictionary<string, int>();
        var problemsReceived = 0;
        foreach (var row in problemRows.EnumerateArray())
        {
            var created = row.GetProperty("created_at").GetDateTimeOffset();
            var updated = row.GetProperty("updated_at").GetDateTimeOffset();
            var status = Text(row, "status");
            if (created >= from && created <= to) problemsReceived++;
            if (updated >= from && updated <= to)
                problemsClosedInRange[status] = problemsClosedInRange.GetValueOrDefault(status) + 1;
            var place = string.Join(", ", new[] { Text(row, "street"), Text(row, "purok") }.Where(p => p.Length > 0));
            problems.Add(new ProblemRow(Text(row, "category"), status, created, Person(row), place, Text(row, "description")));
        }

        var summary = new ReportSummary(
            received,
            requestsClosedInRange.GetValueOrDefault("completed"),
            requestsClosedInRange.GetValueOrDefault("rejected"),
            requestsClosedInRange.GetValueOrDefault("cancelled"),
            problemsReceived,
            problemsClosedInRange.GetValueOrDefault("resolved"),
            problemsClosedInRange.GetValueOrDefault("rejected"));

        return new ReportData(from, to, summary, requests, problems);
    }
}
