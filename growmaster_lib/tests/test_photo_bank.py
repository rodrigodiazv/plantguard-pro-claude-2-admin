"""Offline tests for the photo bank tools."""
import importlib.util
import pathlib

import pytest

_path = pathlib.Path(__file__).resolve().parents[1] / "photo_bank.py"
_spec = importlib.util.spec_from_file_location("photo_bank", _path)
pb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pb)

HEADER = "archivo,entorno,fase,vista,luz,estado,detalle,origen,licencia,fecha\n"


def bank(tmp_path, rows, files):
    (tmp_path / "fotos").mkdir()
    for name in files:
        (tmp_path / "fotos" / name).write_bytes(b"x")
    (tmp_path / "manifest.csv").write_text(HEADER + rows, encoding="utf-8")
    return tmp_path


def test_consistent_bank_has_no_problems(tmp_path):
    rows = "a.jpg,interior,floracion,cenital,cultivo_violeta,sano,,fundador,propia,2026-11-11\n"
    assert pb.check_manifest(bank(tmp_path, rows, ["a.jpg"])) == []


def test_repository_bank_is_consistent():
    assert pb.check_manifest() == []


def test_reports_unlisted_missing_duplicate_and_bad_values(tmp_path):
    rows = (
        "a.jpg,marte,floracion,cenital,blanca,sano,,fundador,propia,\n"
        "a.jpg,interior,floracion,cenital,blanca,sano,,fundador,propia,\n"
        "ghost.jpg,interior,floracion,cenital,,problema,,fundador,,\n"
    )
    problems = "\n".join(pb.check_manifest(bank(tmp_path, rows, ["a.jpg", "new.png"])))
    assert "new.png: en fotos/ pero sin fila" in problems
    assert "a.jpg: repetido" in problems
    assert "entorno='marte'" in problems
    assert "ghost.jpg: en manifest.csv pero no está" in problems
    assert "ghost.jpg: falta 'licencia'" in problems
    assert "ghost.jpg: falta 'luz'" in problems
    assert "ghost.jpg: estado 'problema' necesita 'detalle'" in problems


def test_analyze_measures_known_green_fraction(tmp_path):
    cv2 = pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")
    image = np.zeros((200, 200, 3), np.uint8)
    image[:] = (60, 95, 130)
    image[:, :50] = (40, 140, 60)
    photo = tmp_path / "plot.png"
    cv2.imwrite(str(photo), image)
    result = pb.analyze(photo, tmp_path)
    assert abs(result["cobertura_verde_pct"] - 25.0) < 1.5
    assert pathlib.Path(result["mascara"]).exists()
    with pytest.raises(ValueError):
        pb.analyze(tmp_path / "missing.jpg")
