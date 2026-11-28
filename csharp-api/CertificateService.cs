using System.Text.Json;

namespace WawaApi;

public record CertificateRequest(string RequestId);

public record CertificateData(
    string Code,
    string ServiceName,
    string ResidentName,
    string Address,
    string ContactNumber,
    string? PickupDate,
    DateTimeOffset FiledAt,
    bool IsSenior,
    bool IsPwd
);

/// <summary>
/// Fetches request details from Supabase and builds a certificate PDF.
/// </summary>
public class CertificateService
{
    private readonly SupabaseClient _db;

    public CertificateService(SupabaseClient db) => _db = db;

    /// Safe string read — returns "" on any failure.
    private static string Text(JsonElement? el, string name)
    {
        if (el is null) return "";
        try
        {
            if (el.Value.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String)
                return v.GetString() ?? "";
        }
        catch { /* struct default or bad element */ }
        return "";
    }

    /// Safe bool read.
    private static bool Bool(JsonElement? el, string name)
    {
        if (el is null) return false;
        try
        {
            if (el.Value.TryGetProperty(name, out var v))
                return v.ValueKind == JsonValueKind.True;
        }
        catch { }
        return false;
    }

    /// PostgREST can return a joined row as either an object or a single-element array.
    private static JsonElement? OneOf(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Object) return v;
        if (v.ValueKind == JsonValueKind.Array && v.GetArrayLength() > 0)
            return v[0];
        return null;
    }

    public async Task<CertificateData> GetAsync(string requestId, string userToken)
    {
        // Use admin select via RPC-style query — no join needed to avoid PostgREST embed issues.
        // We fetch service_requests + profiles separately to keep it simple and reliable.
        var reqRows = await _db.GetRowsAsync(
            $"/rest/v1/service_requests?id=eq.{Uri.EscapeDataString(requestId)}" +
            "&select=code,created_at,pickup_date,status,user_id,service_id" +
            "&limit=1",
            userToken);

        if (reqRows.ValueKind != JsonValueKind.Array || reqRows.GetArrayLength() == 0)
            throw new InvalidOperationException($"Request {requestId} not found or you do not have access.");

        var req = reqRows[0];
        var userId    = Text(req, "user_id");
        var serviceId = Text(req, "service_id");

        // Fetch service name
        string serviceName = "Barangay Service";
        if (!string.IsNullOrEmpty(serviceId))
        {
            try
            {
                var svcRows = await _db.GetRowsAsync(
                    $"/rest/v1/services?id=eq.{Uri.EscapeDataString(serviceId)}&select=name&limit=1",
                    userToken);
                if (svcRows.ValueKind == JsonValueKind.Array && svcRows.GetArrayLength() > 0)
                    serviceName = Text(svcRows[0], "name").Length > 0 ? Text(svcRows[0], "name") : serviceName;
            }
            catch { /* non-fatal */ }
        }

        // Fetch resident profile
        JsonElement? profile = null;
        if (!string.IsNullOrEmpty(userId))
        {
            try
            {
                var profRows = await _db.GetRowsAsync(
                    $"/rest/v1/profiles?id=eq.{Uri.EscapeDataString(userId)}" +
                    "&select=first_name,middle_name,last_name,street,purok,barangay,contact_number,is_senior,is_pwd" +
                    "&limit=1",
                    userToken);
                if (profRows.ValueKind == JsonValueKind.Array && profRows.GetArrayLength() > 0)
                    profile = profRows[0];
            }
            catch { /* non-fatal — certificate still prints without name */ }
        }

        var fullName = string.Join(" ", new[]
        {
            Text(profile, "first_name"),
            Text(profile, "middle_name"),
            Text(profile, "last_name"),
        }.Where(s => s.Length > 0));

        var address = string.Join(", ", new[]
        {
            Text(profile, "street"),
            Text(profile, "purok"),
            Text(profile, "barangay"),
        }.Where(s => s.Length > 0));

        DateTimeOffset filedAt = DateTimeOffset.UtcNow;
        try { filedAt = req.GetProperty("created_at").GetDateTimeOffset(); }
        catch { }

        string? pickupDate = null;
        try
        {
            if (req.TryGetProperty("pickup_date", out var pd) && pd.ValueKind == JsonValueKind.String)
                pickupDate = pd.GetString();
        }
        catch { }

        return new CertificateData(
            Code:          Text(req, "code"),
            ServiceName:   serviceName,
            ResidentName:  fullName.Length > 0 ? fullName : "Resident",
            Address:       address.Length > 0 ? address : "Wawa, Taguig City",
            ContactNumber: Text(profile, "contact_number"),
            PickupDate:    pickupDate,
            FiledAt:       filedAt,
            IsSenior:      Bool(profile, "is_senior"),
            IsPwd:         Bool(profile, "is_pwd")
        );
    }
}
