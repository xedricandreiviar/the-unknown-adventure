using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace WawaApi;

/// <summary>
/// Draws the barangay service report as a printable A4 PDF.
///
/// Inherits from BasePdf:
///   - Reuses Manila offset, Stamp(), DrawBarangayHeader(), DrawSignatureBlock()
///   - Overrides Build() with its own A4 report layout (polymorphism)
/// </summary>
public class ReportPdf : BasePdf               // ← Inheritance
{
    private readonly ReportData _data;
    private readonly string _preparedBy;

    public ReportPdf(ReportData data, string preparedBy)
    {
        _data       = data;
        _preparedBy = preparedBy;
    }

    private static string Label(string status) =>
        System.Globalization.CultureInfo.InvariantCulture
              .TextInfo.ToTitleCase(status.Replace('_', ' '));

    /// <summary>
    /// Polymorphism: same method name as CertificatePdf.Build(), but produces
    /// a completely different A4 report layout with summary tables.
    /// </summary>
    public override byte[] Build()             // ← Polymorphism (override)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(style => style.FontSize(9));

                // ── Header — uses inherited helper ─────────────────────────
                page.Header().Column(column =>
                {
                    DrawBarangayHeader(column, "Barangay Service Report");
                    column.Item().AlignCenter()
                          .Text($"Period: {Stamp(_data.From)} to {Stamp(_data.To)}");
                });

                // ── Content ────────────────────────────────────────────────
                page.Content().PaddingVertical(10).Column(column =>
                {
                    column.Spacing(8);

                    column.Item().Text("Summary").Bold().FontSize(11);
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn();
                            c.ConstantColumn(60);
                        });

                        void Row(string label, int value)
                        {
                            table.Cell().BorderBottom(0.5f).PaddingVertical(2).Text(label);
                            table.Cell().BorderBottom(0.5f).PaddingVertical(2)
                                 .AlignRight().Text(value.ToString());
                        }

                        Row("Requests received",              _data.Summary.RequestsReceived);
                        Row("Requests completed",             _data.Summary.RequestsCompleted);
                        Row("Requests rejected",              _data.Summary.RequestsRejected);
                        Row("Requests cancelled by resident", _data.Summary.RequestsCancelled);
                        Row("Problem reports received",       _data.Summary.ProblemsReceived);
                        Row("Problem reports resolved",       _data.Summary.ProblemsResolved);
                        Row("Problem reports rejected",       _data.Summary.ProblemsRejected);
                    });

                    // Service requests table
                    column.Item().PaddingTop(6)
                          .Text($"Service requests ({_data.Requests.Count})").Bold().FontSize(11);

                    if (_data.Requests.Count == 0)
                    {
                        column.Item().Text("No request activity in this period.");
                    }
                    else
                    {
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.ConstantColumn(80);
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                                c.ConstantColumn(70);
                            });
                            table.Header(header =>
                            {
                                foreach (var title in new[] { "Reference", "Resident", "Service", "Filed", "Status" })
                                    header.Cell().Background(Colors.Grey.Lighten3).Padding(3).Text(title).Bold();
                            });
                            foreach (var row in _data.Requests)
                            {
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(row.Code);
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(row.Resident);
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(row.Service);
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(Stamp(row.CreatedAt));
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(Label(row.Status));
                            }
                        });
                    }

                    // Problem reports table
                    column.Item().PaddingTop(6)
                          .Text($"Problem reports ({_data.Problems.Count})").Bold().FontSize(11);

                    if (_data.Problems.Count == 0)
                    {
                        column.Item().Text("No problem reports in this period.");
                    }
                    else
                    {
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                                c.RelativeColumn(3);
                                c.ConstantColumn(70);
                            });
                            table.Header(header =>
                            {
                                foreach (var title in new[] { "Filed", "Resident", "Category / place", "Problem", "Status" })
                                    header.Cell().Background(Colors.Grey.Lighten3).Padding(3).Text(title).Bold();
                            });
                            foreach (var row in _data.Problems)
                            {
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(Stamp(row.CreatedAt));
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(row.Resident);
                                table.Cell().BorderBottom(0.5f).Padding(3).Text($"{row.Category}\n{row.Location}");
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(row.Description);
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(Label(row.Status));
                            }
                        });
                    }

                    // ── Signature block — uses inherited helper ────────────
                    column.Item().PaddingTop(30).Row(row =>
                        DrawSignatureBlock(row, _preparedBy));
                });

                // ── Footer ─────────────────────────────────────────────────
                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span("Page ");
                    text.CurrentPageNumber();
                    text.Span(" of ");
                    text.TotalPages();
                });
            });
        }).GeneratePdf();
    }
}
