using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace WawaApi;

/// <summary>Draws the report as an A4 PDF, ready to print.</summary>
public static class ReportPdf
{
    private static readonly TimeSpan Manila = TimeSpan.FromHours(8);

    private static string Stamp(DateTimeOffset value) =>
        value.ToOffset(Manila).ToString("MMM d, yyyy h:mm tt");

    private static string Label(string status) =>
        System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(status.Replace('_', ' '));

    public static byte[] Build(ReportData data, string preparedBy)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(style => style.FontSize(9));

                page.Header().Column(column =>
                {
                    column.Item().AlignCenter().Text("Barangay Wawa United").FontSize(18).Bold();
                    column.Item().AlignCenter().Text("Taguig City");
                    column.Item().PaddingTop(4).AlignCenter().Text("Barangay Service Report").FontSize(13).SemiBold();
                    column.Item().AlignCenter().Text($"Period: {Stamp(data.From)} to {Stamp(data.To)}");
                    column.Item().PaddingTop(6).LineHorizontal(1);
                });

                page.Content().PaddingVertical(10).Column(column =>
                {
                    column.Spacing(8);

                    column.Item().Text("Summary").Bold().FontSize(11);
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c => { c.RelativeColumn(); c.ConstantColumn(60); });
                        void Row(string label, int value)
                        {
                            table.Cell().BorderBottom(0.5f).PaddingVertical(2).Text(label);
                            table.Cell().BorderBottom(0.5f).PaddingVertical(2).AlignRight().Text(value.ToString());
                        }
                        Row("Requests received", data.Summary.RequestsReceived);
                        Row("Requests completed", data.Summary.RequestsCompleted);
                        Row("Requests rejected", data.Summary.RequestsRejected);
                        Row("Requests cancelled by resident", data.Summary.RequestsCancelled);
                        Row("Problem reports received", data.Summary.ProblemsReceived);
                        Row("Problem reports resolved", data.Summary.ProblemsResolved);
                        Row("Problem reports rejected", data.Summary.ProblemsRejected);
                    });

                    column.Item().PaddingTop(6).Text($"Service requests ({data.Requests.Count})").Bold().FontSize(11);
                    if (data.Requests.Count == 0)
                    {
                        column.Item().Text("No request activity in this period.");
                    }
                    else
                    {
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.ConstantColumn(80); c.RelativeColumn(2); c.RelativeColumn(2);
                                c.RelativeColumn(2); c.ConstantColumn(70);
                            });
                            table.Header(header =>
                            {
                                foreach (var title in new[] { "Reference", "Resident", "Service", "Filed", "Status" })
                                    header.Cell().Background(Colors.Grey.Lighten3).Padding(3).Text(title).Bold();
                            });
                            foreach (var row in data.Requests)
                            {
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(row.Code);
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(row.Resident);
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(row.Service);
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(Stamp(row.CreatedAt));
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(Label(row.Status));
                            }
                        });
                    }

                    column.Item().PaddingTop(6).Text($"Problem reports ({data.Problems.Count})").Bold().FontSize(11);
                    if (data.Problems.Count == 0)
                    {
                        column.Item().Text("No problem reports in this period.");
                    }
                    else
                    {
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(2); c.RelativeColumn(2); c.RelativeColumn(2);
                                c.RelativeColumn(3); c.ConstantColumn(70);
                            });
                            table.Header(header =>
                            {
                                foreach (var title in new[] { "Filed", "Resident", "Category / place", "Problem", "Status" })
                                    header.Cell().Background(Colors.Grey.Lighten3).Padding(3).Text(title).Bold();
                            });
                            foreach (var row in data.Problems)
                            {
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(Stamp(row.CreatedAt));
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(row.Resident);
                                table.Cell().BorderBottom(0.5f).Padding(3).Text($"{row.Category}\n{row.Location}");
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(row.Description);
                                table.Cell().BorderBottom(0.5f).Padding(3).Text(Label(row.Status));
                            }
                        });
                    }

                    column.Item().PaddingTop(30).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().BorderTop(1).PaddingTop(2).AlignCenter().Text(preparedBy).SemiBold();
                            c.Item().AlignCenter().Text("Prepared by");
                        });
                        row.ConstantItem(40);
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().BorderTop(1).PaddingTop(2).AlignCenter().Text(" ");
                            c.Item().AlignCenter().Text("Noted by (Punong Barangay / Secretary)");
                        });
                    });
                });

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
