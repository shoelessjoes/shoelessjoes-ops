"""One-off probe: parse vendor .eml samples and optional PDF."""
from __future__ import annotations

import email
import sys
from email import policy
from pathlib import Path

from pypdf import PdfReader


def parse_eml(path: Path) -> None:
    print("=" * 80)
    print(path.name)
    print("=" * 80)
    with path.open("rb") as f:
        msg = email.message_from_binary_file(f, policy=policy.default)
    print("From:", msg.get("From"))
    print("To:", msg.get("To"))
    print("Subject:", msg.get("Subject"))
    print("Date:", msg.get("Date"))
    print()
    plain_seen = False
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            fname = part.get_filename()
            if ctype == "text/plain" and not plain_seen:
                body = part.get_content()
                if body and str(body).strip():
                    print("--- text/plain ---")
                    text = str(body)
                    print(text[:4000])
                    if len(text) > 4000:
                        print("...[truncated]")
                    plain_seen = True
            if fname:
                payload = part.get_payload(decode=True) or b""
                print(f"--- attachment: {fname} ({ctype}) bytes={len(payload)} ---")
    else:
        print(str(msg.get_content())[:4000])
    print()


def parse_pdf(path: Path) -> None:
    print("=" * 80)
    print(path.name)
    print("=" * 80)
    reader = PdfReader(str(path))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    print(text[:7000])
    if len(text) > 7000:
        print("...[truncated]")
    print()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    downloads = Path(r"C:\Users\burke\Downloads")
    names = [
        "Shoeless Joes's latest offer from FC Pro - 2025 Topps Inception Baseball.eml",
        "FC Pro Order Submitted (2).eml",
        "New Shipment (1).eml",
        "A shipment from order US-13935671-S is on the way.eml",
        "GTS Sales Invoice INV01165443.eml",
        "Order US-13980773-S confirmed.eml",
    ]
    for name in names:
        p = downloads / name
        if p.exists():
            parse_eml(p)
        else:
            print("MISSING", name)

    for pdf_name in ["INV01165443.pdf", "GTS Sales Invoice INV01165443.pdf"]:
        p = downloads / pdf_name
        if p.exists():
            parse_pdf(p)


if __name__ == "__main__":
    main()
