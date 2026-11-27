using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace WawaApi;

/// <summary>
/// Generates a printable A5 barangay service certificate.
/// One page per request — ready to print, sign, and hand to the resident.
/// </summary>
public static class CertificatePdf
{
    private static readonly TimeSpan Manila = TimeSpan.FromHours(8);

    private static string Stamp(DateTimeOffset value) =>
        value.ToOffset(Manila).ToString("MMMM d, yyyy");

    public static byte[] Build(CertificateData data, string preparedBy)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A5);
                page.Margin(28);
                page.DefaultTextStyle(style => style.FontSize(10));

                page.Header().Column(col =>
                {
                    col.Item().AlignCenter().Text("Republic of the Philippines").FontSize(8).Italic();
                    col.Item().AlignCenter().Text("Taguig City").FontSize(8);
                    col.Item().PaddingTop(4).AlignCenter()
                       .Text("BARANGAY WAWA UNITED").FontSize(16).Bold();
                    col.Item().AlignCenter().Text("Taguig City, Metro Manila").FontSize(8);
                    col.Item().PaddingTop(6).LineHorizontal(2);
                    col.Item().PaddingTop(4).AlignCenter()
                       .Text($"CERTIFICATE FOR {data.ServiceName.ToUpperInvariant()}")
                       .FontSize(12).SemiBold();
                    col.Item().PaddingTop(2).LineHorizontal(0.5f);
                });

                page.Content().PaddingVertical(12).Column(col =>
                {
                    col.Spacing(10);

                    col.Item().Text(text =>
                    {
                        text.Span("Reference number: ").SemiBold();
                        text.Span(data.Code).FontFamily("Courier New");
                    });

                    col.Item().Text(text =>
                    {
                        text.Span("This is to certify that ").Italic();
                        text.Span(data.ResidentName).Bold();
                        text.Span(", a resident of ").Italic();
                        text.Span(data.Address);
                        if (data.IsSenior)
                            text.Span(" (Senior Citizen)").Italic();
                        if (data.IsPwd)
                            text.Span(" (PWD)").Italic();
                        text.Span(", has filed a request for ").Italic();
                        text.Span(data.ServiceName).Bold();
                        text.Span(" with this barangay.").Italic();
                    });

                    col.Item().Text(text =>
                    {
                        text.Span("Contact number: ").SemiBold();
                        text.Span(data.ContactNumber);
                    });

                    col.Item().Text(text =>
                    {
                        text.Span("Date filed: ").SemiBold();
                        text.Span(Stamp(data.FiledAt));
                    });

                    if (data.PickupDate is not null &&
                        DateOnly.TryParse(data.PickupDate, out var pickup))
                    {
                        col.Item().Text(text =>
                        {
                            text.Span("Estimated pickup date: ").SemiBold();
                            text.Span(pickup.ToString("MMMM d, yyyy"));
                        });
                    }

                    col.Item().PaddingTop(4).Text(
                        "This certificate is issued upon the request of the interested party for " +
                        "whatever legal purpose it may serve."
                    ).Italic().FontSize(9);

                    col.Item().PaddingTop(16).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().BorderTop(1).PaddingTop(2).AlignCenter().Text(preparedBy).SemiBold();
                            c.Item().AlignCenter().Text("Prepared by").FontSize(8);
                        });
                        row.ConstantItem(30);
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().BorderTop(1).PaddingTop(2).AlignCenter().Text(" ");
                            c.Item().AlignCenter().Text("Punong Barangay").FontSize(8);
                        });
                    });
                });

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
