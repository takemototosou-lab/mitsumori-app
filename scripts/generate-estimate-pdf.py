import base64
import json
import math
import sys
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.platypus import PageBreak
from reportlab.pdfgen import canvas


BLUE = colors.HexColor("#063f83")
LIGHT_BLUE = colors.HexColor("#eef5ff")
LINE = colors.HexColor("#c7d7ea")
TEXT = colors.HexColor("#122033")
RED = colors.HexColor("#b10000")


def register_font():
    pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
    pdfmetrics.registerFont(UnicodeCIDFont("HeiseiMin-W3"))
    return "HeiseiKakuGo-W5"


FONT = register_font()
BOLD_FONT = "HeiseiKakuGo-W5"


def yen(value):
    return f"¥{int(value):,}"


def to_number(value):
    if value in ("", None):
        return None
    try:
        return float(value)
    except Exception:
        return None


def line_amount(item):
    qty = to_number(item.get("quantity"))
    price = to_number(item.get("unitPrice"))
    if qty is None or price is None:
        return None
    return round(qty * price)


def calculate_totals(quote):
    items = quote.get("items") or []
    subtotal = sum(line_amount(item) or 0 for item in items)
    discount = max(0, round(to_number(quote.get("discount")) or 0))
    taxable = max(0, subtotal - discount)
    tax = math.floor(taxable * 0.1)
    rounding = max(0, round(to_number(quote.get("roundingAdjustment")) or 0))
    total = max(0, taxable + tax - rounding)
    return {
        "subtotalBeforeDiscount": subtotal,
        "discount": discount,
        "taxableSubtotal": taxable,
        "tax": tax,
        "roundingAdjustment": rounding,
        "totalWithTax": total,
    }


def p(text, style):
    return Paragraph(str(text or "-").replace("\n", "<br/>"), style)


def image_from_data_uri(value, width_mm, height_mm):
    if not value or "," not in value:
        return ""
    try:
        raw = base64.b64decode(value.split(",", 1)[1])
        img = Image(BytesIO(raw), width=width_mm * mm, height=height_mm * mm)
        img.hAlign = "LEFT"
        return img
    except Exception:
        return ""


class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            draw_page_header(self, self._pageNumber, total)
            super().showPage()
        super().save()


def draw_page_header(c, page_number, total_pages):
    width, height = A4
    title = "御見積書" if page_number == 1 else "御見積書（明細続き）"
    c.saveState()
    c.setStrokeColor(BLUE)
    c.setLineWidth(0.7)
    c.line(62 * mm, height - 17 * mm, width - 62 * mm, height - 17 * mm)
    c.line(62 * mm, height - 30 * mm, width - 62 * mm, height - 30 * mm)
    c.setFillColor(BLUE)
    c.setFont(BOLD_FONT, 22)
    c.drawCentredString(width / 2, height - 26 * mm, title)
    c.setFont(BOLD_FONT, 9)
    c.drawRightString(width - 12 * mm, height - 20 * mm, f"{page_number} / {total_pages}")
    c.restoreState()


def build_pdf(data, output_path):
    quote = data["quote"]
    company = data.get("company") or {}
    assets = data.get("companyAssets") or {}
    totals = calculate_totals(quote)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=36 * mm,
        bottomMargin=12 * mm,
    )
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("NormalJa", parent=styles["Normal"], fontName=FONT, fontSize=9, leading=14, textColor=TEXT)
    small = ParagraphStyle("SmallJa", parent=normal, fontSize=8.5, leading=13)
    bold = ParagraphStyle("BoldJa", parent=normal, fontName=BOLD_FONT)
    label = ParagraphStyle("LabelJa", parent=bold, textColor=BLUE)
    recipient = ParagraphStyle("Recipient", parent=bold, fontSize=15, leading=20)
    amount_style = ParagraphStyle("Amount", parent=bold, fontSize=22, leading=26, alignment=1)

    story = []
    recipient_line = f"{quote.get('recipientName') or '宛名未入力'} {quote.get('recipientTitle') or ''}".strip()
    project_rows = [
        [p("件名", label), p(quote.get("subject"), normal)],
        [p("現場名", label), p(quote.get("siteName"), normal)],
        [p("工期", label), p(quote.get("constructionPeriod"), normal)],
        [p("有効期限", label), p(quote.get("expiryDate"), normal)],
        [p("見積番号", label), p(quote.get("quoteNumber"), normal)],
        [p("発行日", label), p(quote.get("issueDate"), normal)],
    ]
    left = [
        p(recipient_line, recipient),
        p(f"ご担当 {quote.get('contactPerson')} 様" if quote.get("contactPerson") else "", bold),
        p(quote.get("postalCode") or "", small),
        p(quote.get("address") or "", small),
        Spacer(1, 4 * mm),
        Table(project_rows, colWidths=[22 * mm, 82 * mm]),
    ]
    logo = image_from_data_uri(assets.get("logoImage"), 18, 18)
    seal = image_from_data_uri(assets.get("sealImage"), 16, 16)
    company_name = company.get("name") or "竹本塗装店"
    company_lines = [
        p(company_name, ParagraphStyle("CompanyName", parent=bold, fontSize=14, leading=18)),
        p(f"代表 {company.get('representative')}" if company.get("representative") else "", small),
        p(company.get("postalCode") or "", small),
        p(company.get("address") or "", small),
        p(f"TEL {company.get('phone')}" if company.get("phone") else "", small),
        p(f"Mail {company.get('email')}" if company.get("email") else "", small),
        p(f"登録番号 {company.get('registrationNumber')}" if company.get("registrationNumber") else "", small),
    ]
    company_head = Table([[logo, company_lines[:2]]], colWidths=[20 * mm, 42 * mm]) if logo else company_lines[:2]
    right = []
    if isinstance(company_head, Table):
        right.append(company_head)
    else:
        right += company_head
    right += company_lines[2:]
    if seal:
        right += [Spacer(1, 3 * mm), seal]
    intro = Table([[left, right]], colWidths=[112 * mm, 62 * mm])
    intro.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBEFORE", (1, 0), (1, 0), 1, LINE), ("LEFTPADDING", (1, 0), (1, 0), 5 * mm)]))
    story.append(intro)
    story.append(Spacer(1, 5 * mm))

    total_box = Table([[p("御見積金額（税込）", ParagraphStyle("White", parent=bold, textColor=colors.white, alignment=1)), p(yen(totals["totalWithTax"]), amount_style)]], colWidths=[55 * mm, 87 * mm])
    total_box.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), BLUE), ("BOX", (0, 0), (-1, -1), 1.2, BLUE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.append(total_box)
    story.append(Spacer(1, 5 * mm))

    header = [p("No.", bold), p("工事項目", bold), p("内容・仕様", bold), p("数量", bold), p("単位", bold), p("単価", bold), p("金額", bold)]
    rows = [header]
    for index, item in enumerate(quote.get("items") or [], 1):
        amount = line_amount(item)
        rows.append([
            p(index, normal),
            p(item.get("workItem"), normal),
            p(item.get("description"), normal),
            p(item.get("quantity"), normal),
            p(item.get("unit"), normal),
            p("" if item.get("unitPrice") == "" else yen(to_number(item.get("unitPrice")) or 0), normal),
            p("-" if amount is None else yen(amount), normal),
        ])
    table = Table(rows, colWidths=[10 * mm, 30 * mm, 62 * mm, 13 * mm, 11 * mm, 24 * mm, 26 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, 0), (-1, -1), FONT),
    ]))
    story.append(table)
    story.append(Spacer(1, 5 * mm))

    summary_rows = [
        [p("税抜合計", label), p(yen(totals["subtotalBeforeDiscount"]), normal)],
        [p("値引き", label), p("-" + yen(totals["discount"]), ParagraphStyle("Minus", parent=normal, textColor=RED))],
        [p("消費税（10%）", label), p(yen(totals["tax"]), normal)],
        [p("端数調整", label), p("-" + yen(totals["roundingAdjustment"]), ParagraphStyle("Minus2", parent=normal, textColor=RED))],
        [p("合計金額（税込）", ParagraphStyle("GrandLabel", parent=label, fontSize=12)), p(yen(totals["totalWithTax"]), ParagraphStyle("Grand", parent=bold, fontSize=13, textColor=BLUE))],
    ]
    summary = Table(summary_rows, colWidths=[40 * mm, 32 * mm], hAlign="RIGHT")
    summary.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, LINE), ("BACKGROUND", (0, -1), (-1, -1), LIGHT_BLUE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 0), (1, -1), "RIGHT")]))
    story.append(summary)
    story.append(Spacer(1, 5 * mm))

    notes = Table([
        [note_block("備考", quote.get("note"), label, normal), note_block("支払条件", quote.get("paymentTerms"), label, normal)],
        [note_block("特記事項・注意事項", quote.get("specialNotes"), label, normal), ""],
    ], colWidths=[87 * mm, 87 * mm])
    notes.setStyle(TableStyle([("SPAN", (0, 1), (1, 1)), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (0, 0), 0.8, BLUE), ("BOX", (1, 0), (1, 0), 0.8, BLUE), ("BOX", (0, 1), (1, 1), 0.8, BLUE), ("PADDING", (0, 0), (-1, -1), 8)]))
    story.append(notes)

    doc.build(story, canvasmaker=NumberedCanvas)


def note_block(title, value, title_style, body_style):
    return [p(title, title_style), Spacer(1, 1 * mm), p(value or "-", body_style)]


if __name__ == "__main__":
    input_path, output_path = sys.argv[1], sys.argv[2]
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    build_pdf(data, output_path)
