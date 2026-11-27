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

    private static string Text(JsonElement row, string name) =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() ?? "" : "";

    private static T? Bool<T>(JsonElement row, string name) where T : struct =>
        row.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True ? (T)(object)true : default;

    public async Task<CertificateData> GetAsync(string requestId, string userToken)
    {
        var row = await _db.GetRowsAsync(
            $"/rest/v1/service_requests?id=eq.{Uri.EscapeDataString(requestId)}" +
            "&select=code,created_at,pickup_date,service:services(name),resident:profiles(first_name,middle_name,last_name,street,purok,barangay,contact_number,is_senior,is_pwd)" +
            "&limit=1",
            userToken);

        if (row.ValueKind != JsonValueKind.Array || row.GetArrayLength() == 0)
            throw new InvalidOperationException("Request not found.");

        var r = row[0];

        var resident = r.TryGetProperty("resident", out var res) && res.ValueKind == JsonValueKind.Object
            ? res : default;

        var fullName = string.Join(" ", new[]
        {
            Text(resident, "first_name"),
            Text(resident, "middle_name"),
            Text(resident, "last_name"),
        }.Where(s => s.Length > 0));

        var address = string.Join(", ", new[]
        {
            Text(resident, "street"),
            Text(resident, "purok"),
            Text(resident, "barangay"),
        }.Where(s => s.Length > 0));

        var serviceName = r.TryGetProperty("service", out var svc) && svc.ValueKind == JsonValueKind.Object
            ? Text(svc, "name") : "Barangay Service";

        return new CertificateData(
            Code:          Text(r, "code"),
            ServiceName:   serviceName,
            ResidentName:  fullName,
            Address:       address,
            ContactNumber: Text(resident, "contact_number"),
            PickupDate:    r.TryGetProperty("pickup_date", out var pd) && pd.ValueKind == JsonValueKind.String
                             ? pd.GetString() : null,
            FiledAt:       r.GetProperty("created_at").GetDateTimeOffset(),
            IsSenior:      resident.TryGetProperty("is_senior", out var sr) && sr.GetBoolean(),
            IsPwd:         resident.TryGetProperty("is_pwd", out var pw) && pw.GetBoolean()
        );
    }
}
