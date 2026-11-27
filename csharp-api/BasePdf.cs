using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace WawaApi;

/// <summary>
/// Abstract base class for all barangay PDF documents.
///
/// OOP concepts demonstrated here:
///   - Abstraction  : Build() is declared abstract — subclasses must provide
///                    their own implementation, but callers just call Build().
///   - Inheritance  : CertificatePdf and ReportPdf both extend this class and
///                    inherit the shared helpers (Manila offset, Stamp, DrawBarangayHeader).
///   - Polymorphism : Any code that holds a BasePdf reference can call Build()
///                    and the correct subclass version runs automatically.
/// </summary>
public abstract class BasePdf
{
    // ── Shared constant ────────────────────────────────────────────────────
    /// <summary>UTC+8 offset used to display dates in Philippine time.</summary>
    protected static readonly TimeSpan Manila = TimeSpan.FromHours(8);

    // ── Shared helper inherited by every subclass ──────────────────────────
    /// <summary>Formats a UTC timestamp as a readable Philippine-time date string.</summary>
    protected static string Stamp(DateTimeOffset value) =>
        value.ToOffset(Manila).ToString("MMMM d, yyyy");

    /// <summary>
    /// Draws the standard barangay letterhead used at the top of every document.
    /// Subclasses call this inside their page.Header() lambda so the branding
    /// is consistent across all document types without duplicating the code.
    /// </summary>
    protected static void DrawBarangayHeader(ColumnDescriptor col, string documentTitle)
    {
        col.Item().AlignCenter().Text("Republic of the Philippines").FontSize(8).Italic();
        col.Item().AlignCenter().Text("Taguig City").FontSize(8);
        col.Item().PaddingTop(4).AlignCenter()
           .Text("BARANGAY WAWA UNITED").FontSize(16).Bold();
        col.Item().AlignCenter().Text("Taguig City, Metro Manila").FontSize(8);
        col.Item().PaddingTop(6).LineHorizontal(2);
        col.Item().PaddingTop(4).AlignCenter()
           .Text(documentTitle).FontSize(12).SemiBold();
        col.Item().PaddingTop(2).LineHorizontal(0.5f);
    }

    /// <summary>
    /// Draws the two signature lines (Prepared by / Noted by) used at the
    /// bottom of every barangay document.
    /// </summary>
    protected static void DrawSignatureBlock(RowDescriptor row, string preparedBy)
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
    }

    // ── Abstract method — subclasses MUST override this ───────────────────
    /// <summary>
    /// Generates and returns the PDF as a raw byte array.
    /// Each subclass produces a different document layout but the caller
    /// always uses the same method name — this is polymorphism.
    /// </summary>
    public abstract byte[] Build();
}
