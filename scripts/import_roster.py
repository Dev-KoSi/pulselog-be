"""Parse the GROUP MEMBERS LIST docx into src/db/roster.json (Python stdlib only).

Usage (from backend/):  python3 scripts/import_roster.py "<path to .docx>" src/db/roster.json
"""
import json, re, sys, zipfile

src, out = sys.argv[1], sys.argv[2]
xml = zipfile.ZipFile(src).read("word/document.xml").decode()
paras = ["".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)) for p in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S)]
paras = [p.replace("⁠", "").replace("&apos;", "'").replace("&amp;", "&").strip() for p in paras]

INDEX = re.compile(r"EF\s*/?\s*BPS\s*/?\s*(\d{1,2})\s*/?\s*(\d{1,4})", re.I)


def title(name):
    def cap(word):
        return "-".join(part[:1].upper() + part[1:].lower() for part in word.split("-"))
    return " ".join(cap(w) for w in name.split())


group, students, notes = None, [], []
for p in paras:
    if not p or p.upper() == "GROUP MEMBERS LIST":
        continue
    m = re.fullmatch(r"GROUP\s+(\d+)", p, re.I)
    if m:
        group = int(m.group(1))
        continue
    im = INDEX.search(p)
    if not im:
        notes.append(f"UNPARSED: {p!r}")
        continue
    raw = im.group(0)
    year, serial = im.group(1), im.group(2)
    canonical_year = year
    if len(year) != 2:
        canonical_year = "24"
        notes.append(f"G{group}: year '{year}' in {raw!r} assumed to be 24")
    index = f"EF/BPS/{canonical_year}/{serial.zfill(4)}"
    name = (p[: im.start()] + " " + p[im.end():])
    name = re.sub(r"^\s*\d+\.\s*", "", name)
    name = re.sub(r"[—=\-]+\s*$", "", name.strip()).strip()
    name = re.sub(r"^\s*[—=\-]+", "", name).strip()
    name = re.sub(r"\s*[—=]\s*", " ", name)
    name = re.sub(r"\s+-\s*|\s*-\s+", " ", name)  # stray " - " separators, keep hyphenated names
    name = title(re.sub(r"\s+", " ", name).strip())
    entry = {"indexNumber": index, "name": name, "program": "B.Sc. Psychology", "group": group}
    if raw != index:
        entry["aliases"] = [raw]
        notes.append(f"G{group}: {name}: {raw!r} -> {index}")
    students.append(entry)

seen = {}
for s in students:
    if s["indexNumber"] in seen:
        notes.append(f"DUPLICATE index {s['indexNumber']}: {seen[s['indexNumber']]} / {s['name']}")
    seen[s["indexNumber"]] = s["name"]

per_group = {}
for s in students:
    per_group[s["group"]] = per_group.get(s["group"], 0) + 1

json.dump(
    {"program": "B.Sc. Psychology", "source": "GROUP MEMBERS LIST.docx", "groups": len(per_group), "count": len(students), "students": students},
    open(out, "w"),
    indent=2,
    ensure_ascii=False,
)
print("groups:", len(per_group), "students:", len(students))
print("per group:", per_group)
print("\n".join(notes))
print("one-word names:", [s["name"] for s in students if " " not in s["name"]])
