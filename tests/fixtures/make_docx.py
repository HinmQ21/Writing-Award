"""Generate small, genuine OOXML fixtures using only the Python standard library."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape

ROOT = Path(__file__).parent
PARAGRAPHS = [
    " ".join(f"word{i}" for i in range(180)),
    " ".join(f"word{i}" for i in range(180, 270)),
    "Mỗi ngày, một mảnh hạnh phúc.",
]

def write_docx(name, paragraphs):
    body = "".join(f'<w:p><w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>' for text in paragraphs)
    entries = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "word/document.xml": f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}<w:sectPr/></w:body></w:document>',
        "word/_rels/document.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    }
    with ZipFile(ROOT / name, "w", compression=ZIP_DEFLATED) as archive:
        for path, text in entries.items():
            archive.writestr(path, text.encode("utf-8"))

if __name__ == "__main__":
    write_docx("essay.docx", PARAGRAPHS)
    write_docx("empty.docx", [])
    write_docx("too-long.docx", ["a" * 100_001])
    (ROOT / "essay.txt").write_text("\n\n".join(PARAGRAPHS), encoding="utf-8", newline="\n")
    print("Generated Word fixtures: valid (276 words), empty, and overlong.")
