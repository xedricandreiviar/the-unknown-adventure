using System.Net.Http.Headers;
using System.Text.Json;

namespace WawaApi;

/// <summary>
/// Talks to the same Supabase database as the website. Every call carries the signed-in
/// person's own token, so the database's row-level security still decides what they may see.
/// This API never uses a service key.
/// </summary>
public class SupabaseClient
{
    private readonly HttpClient _http;
    private readonly string _baseUrl;
    private readonly string _publishableKey;

    public SupabaseClient(HttpClient http, IConfiguration config)
    {
        _http = http;
        _baseUrl = (config["SUPABASE_URL"] ?? throw new InvalidOperationException("SUPABASE_URL is not set."))
            .TrimEnd('/');
        _publishableKey = config["SUPABASE_PUBLISHABLE_KEY"]
            ?? throw new InvalidOperationException("SUPABASE_PUBLISHABLE_KEY is not set.");
    }

    private HttpRequestMessage Build(HttpMethod method, string path, string userToken)
    {
        var request = new HttpRequestMessage(method, $"{_baseUrl}{path}");
        request.Headers.Add("apikey", _publishableKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userToken);
        return request;
    }

    /// <summary>Is the person behind this token an admin? Uses the database's own is_admin().</summary>
    public async Task<bool> IsAdminAsync(string userToken)
    {
        using var request = Build(HttpMethod.Post, "/rest/v1/rpc/is_admin", userToken);
        request.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
        using var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode) return false;
        var body = (await response.Content.ReadAsStringAsync()).Trim();
        return body == "true";
    }

    /// <summary>GET a PostgREST path such as "/rest/v1/service_requests?select=*" and parse the rows.</summary>
    public async Task<JsonElement> GetRowsAsync(string path, string userToken)
    {
        using var request = Build(HttpMethod.Get, path, userToken);
        using var response = await _http.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Database request failed ({(int)response.StatusCode}): {body}");
        using var document = JsonDocument.Parse(body);
        return document.RootElement.Clone();
    }
}
