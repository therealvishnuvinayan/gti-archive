"""Deterministic OOXML extraction; paragraph ordinals include table cells/empty paragraphs.

Run with --check to verify the committed extraction against the original binary.
Page numbers cannot be recovered from this source: it has no pagination metadata.
"""
from pathlib import Path
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs/requirements/GTI_FLUX_Project_Process_Templates_Source.docx"
TARGET = ROOT / "docs/requirements/GTI_FLUX_Project_Process_Templates_Source.json"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
with zipfile.ZipFile(SOURCE) as archive:
    document = ET.fromstring(archive.read("word/document.xml"))
    paragraphs = []
    for number, paragraph in enumerate(document.findall(".//w:body//w:p", NS), 1):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", NS))
        if text:
            paragraphs.append({"id": f"P{number:04}", "text": text, "page": None})
    output = {
        "title": paragraphs[0]["text"], "version": "2026-09-29",
        "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "pagination": "Unverified: supplied as 19 pages; OOXML contains no page count, page breaks or rendered page markers. Section/paragraph locators are authoritative for this binary.",
        "paragraphs": paragraphs,
    }
serialized = json.dumps(output, ensure_ascii=False, indent=2) + "\n"
if "--check" in sys.argv:
    assert TARGET.read_text() == serialized, "Source extraction differs"
else:
    TARGET.write_text(serialized)
print(f"PASS source extraction: {len(paragraphs)} paragraphs; SHA-256 {output['sha256']}")
