using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace WawaApi;

/// <summary>
/// Generates a printable A5 barangay service certificate.
/// One page per request — ready to print, sign, and hand to the resident.
///
/// Inherits from BasePdf:
///   - Reuses Manila offset, Stamp(), DrawBarangayHeader(), DrawSignatureBlock()
///   - Overrides Build() with its own A5 certificate layout (polymorphism)
/// </summary>
public class CertificatePdf : BasePdf          // ← Inheritance
{
    private readonly CertificateData _data;
    private readonly string _preparedBy;

    public CertificatePdf(CertificateData data, string preparedBy)
    {
        _data       = data;
        _preparedBy = preparedBy;
    }

    /// <summary>
    /// Polymorphism: BasePdf declares Build() as abstract.
    /// This override produces an A5 certificate layout.
    /// ReportPdf.Build() produces a different layout from the same method name.
    /// </summary>
    public override byte[] Build()             // ← Polymorphism (override)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A5);
                page.Margin(28);
                page.DefaultTextStyle(style => style.FontSize(10));

                // ── Header — uses inherited helper ─────────────────────────
                page.Header().Column(col =>
                    DrawBarangayHeader(col,
                        $"CERTIFICATE FOR {_data.ServiceName.ToUpperInvariant()}"));

                // ── Content ────────────────────────────────────────────────
                page.Content().PaddingVertical(12).Column(col =>
                {
                    col.Spacing(10);

                    col.Item().Text(text =>
                    {
                        text.Span("Reference number: ").SemiBold();
                        text.Span(_data.Code).SemiBold();
                    });

                    col.Item().Text(text =>
                    {
                        text.Span("This is to certify that ").Italic();
                        text.Span(_data.ResidentName).Bold();
                        text.Span(", a resident of ").Italic();
                        text.Span(_data.Address);
                        if (_data.IsSenior)
                            text.Span(" (Senior Citizen)").Italic();
                        if (_data.IsPwd)
                            text.Span(" (PWD)").Italic();
                        text.Span(", has filed a request for ").Italic();
                        text.Span(_data.ServiceName).Bold();
                        text.Span(" with this barangay.").Italic();
                    });

                    col.Item().Text(text =>
                    {
                        text.Span("Contact number: ").SemiBold();
                        text.Span(_data.ContactNumber);
                    });

                    col.Item().Text(text =>
                    {
                        text.Span("Date filed: ").SemiBold();
                        text.Span(Stamp(_data.FiledAt));   // ← inherited from BasePdf
                    });

                    if (_data.PickupDate is not null &&
                        DateOnly.TryParse(_data.PickupDate, out var pickup))
                    {
                        col.Item().Text(text =>
                        {
                            text.Span("Estimated pickup date: ").SemiBold();
                            text.Span(pickup.ToString("MMMM d, yyyy"));
                        });
                    }

                    col.Item().PaddingTop(4).Text(
                        "This certificate is issued upon the request of the interested " +
                        "party for whatever legal purpose it may serve."
                    ).Italic().FontSize(9);

                    // ── Signature block — uses inherited helper ────────────
                    col.Item().PaddingTop(16).Row(row =>
                        DrawSignatureBlock(row, _preparedBy));
                });

                // ── Footer ─────────────────────────────────────────────────
                page.Footer().AlignRight().Text(text =>
                {
                    text.Span($"Issued: {DateTimeOffset.UtcNow.ToOffset(Manila):MMM d, yyyy}  ·  ");
                    text.Span("Page ");
                    text.CurrentPageNumber();
                });
            });
        }).GeneratePdf();
    }
}
