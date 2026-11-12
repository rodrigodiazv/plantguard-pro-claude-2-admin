"""Photo bank of real crop images: manifest validation and canopy measurement.

Usage:
    python3 growmaster/photo_bank.py check
    python3 growmaster/photo_bank.py analyze <photo> [output_dir]
"""
import csv
import pathlib
import sys

BANK = pathlib.Path(__file__).resolve().parent / "banco_fotos"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED = {
    "entorno": {"exterior", "invernadero", "tunel", "interior"},
    "fase": {"plantula", "vegetativo", "floracion", "madre", "desconocida"},
    "vista": {"cenital", "oblicua", "primer_plano"},
    "estado": {"sano", "problema", "sin_etiquetar"},
    "luz": {"natural", "blanca", "cultivo_violeta", "infrarrojo", "desconocida"},
}
REQUIRED = ["archivo", "entorno", "fase", "vista", "luz", "estado", "origen", "licencia"]


def check_manifest(bank=BANK):
    """Return a list of problems; empty means the bank is consistent."""
    problems = []
    with open(bank / "manifest.csv", newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    listed = [row.get("archivo", "") for row in rows]
    on_disk = {p.name for p in (bank / "fotos").iterdir() if p.suffix.lower() in IMAGE_SUFFIXES}
    for name in sorted(on_disk - set(listed)):
        problems.append(f"{name}: en fotos/ pero sin fila en manifest.csv")
    for name in sorted({n for n in listed if listed.count(n) > 1}):
        problems.append(f"{name}: repetido en manifest.csv")
    for row in rows:
        name = row.get("archivo") or "(fila sin archivo)"
        if row.get("archivo") and row["archivo"] not in on_disk:
            problems.append(f"{name}: en manifest.csv pero no está en fotos/")
        for column in REQUIRED:
            if not (row.get(column) or "").strip():
                problems.append(f"{name}: falta '{column}'")
        for column, allowed in ALLOWED.items():
            value = (row.get(column) or "").strip()
            if value and value not in allowed:
                problems.append(f"{name}: {column}='{value}' no es uno de {sorted(allowed)}")
        if row.get("estado") == "problema" and not (row.get("detalle") or "").strip():
            problems.append(f"{name}: estado 'problema' necesita 'detalle'")
    return problems


def analyze(photo, output_dir=None):
    """Green cover of one photo, optionally saving an overlay of what was counted as plant."""
    import cv2

    # sibling module; this file is run as a script, not as part of a package
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from drone_planner import canopy_mask

    image = cv2.imread(str(photo))
    if image is None:
        raise ValueError(f"no se puede leer la imagen: {photo}")
    mask = canopy_mask(image)
    result = {"archivo": pathlib.Path(photo).name, "ancho": image.shape[1], "alto": image.shape[0],
              "cobertura_verde_pct": round(float(mask.mean()) * 100, 1)}
    if output_dir:
        overlay = image.copy()
        overlay[mask] = (0.5 * overlay[mask] + (0, 127, 127)).astype("uint8")
        out = pathlib.Path(output_dir) / f"{pathlib.Path(photo).stem}_mascara.jpg"
        cv2.imwrite(str(out), overlay)
        result["mascara"] = str(out)
    return result


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "analyze":
        print(analyze(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None))
    elif len(sys.argv) == 2 and sys.argv[1] == "check":
        found = check_manifest()
        print("\n".join(found) if found else "Banco de fotos correcto.")
        sys.exit(1 if found else 0)
    else:
        print(__doc__)
        sys.exit(2)
