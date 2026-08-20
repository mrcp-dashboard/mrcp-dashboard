"""Tests de generation minimale pour build_data_v2.py.

Ces tests ne touchent jamais aux vraies donnees du club (speedhive_csv/,
speedhive_pilots.json, corrections.json, lap_overrides.json) : tous les
chemins du module sont monkeypatches vers un dossier temporaire contenant
un jeu de donnees factice.
"""
import json
import textwrap

import pytest

import build_data_v2 as bdv


CSV_CONTENT = textwrap.dedent(
    """\
    Transponder,Date,"Start time",Lap,"Total time",Laptime,MRCP,Speed,Diff
    ,,,,,,,,
    1000001,01-01-2026,10:00:00,1,0:00:18.000,0:00:18.000,0:00:18.000,"20.000 km/h",
    1000001,01-01-2026,10:00:20,2,0:00:33.000,0:00:15.000,0:00:15.000,"25.000 km/h",0:00:03.000
    1000001,01-01-2026,10:01:00,3,0:06:40.000,0:06:40.000,0:06:40.000,"1.000 km/h",
    ,,,,,,,,
    1000002,01-01-2026,11:00:00,1,0:00:35.000,0:00:35.000,0:00:35.000,"15.000 km/h",
    """
)


@pytest.fixture()
def project(tmp_path, monkeypatch):
    """Prepare un mini-projet isole et redirige build_data_v2 dessus."""
    csv_dir = tmp_path / "speedhive_csv"
    csv_dir.mkdir()
    (csv_dir / "sessions_TEST0001.csv").write_text(CSV_CONTENT, encoding="utf-8")

    pilots_file = tmp_path / "speedhive_pilots.json"
    pilots_file.write_text(
        json.dumps({"1000001": "TEST PILOT ONE"}), encoding="utf-8"
    )

    # corrections.json et lap_overrides.json ne sont pas crees : build_data_v2
    # doit retomber sur ses valeurs par defaut quand les fichiers manquent.
    corrections_file = tmp_path / "corrections.json"
    lap_overrides_file = tmp_path / "lap_overrides.json"

    root_out = tmp_path / "data_v2.json"

    monkeypatch.setattr(bdv, "CSV_DIR", csv_dir)
    monkeypatch.setattr(bdv, "PILOTS_FILE", pilots_file)
    monkeypatch.setattr(bdv, "CORRECTIONS_FILE", corrections_file)
    monkeypatch.setattr(bdv, "LAP_OVERRIDES_FILE", lap_overrides_file)
    monkeypatch.setattr(bdv, "ROOT_OUT_FILE", root_out)

    return bdv, root_out


def test_build_minimal_dataset(project):
    bdv_mod, _ = project
    data = bdv_mod.build()

    assert data["schema_version"] == 3.5
    assert data["summary"]["activities_count"] == 1
    assert data["summary"]["pilots_count"] == 2
    # 3 tours valides (18.0, 15.0, 35.0) : le tour a 400s depasse LAP_MAX.
    assert data["summary"]["laps_count"] == 3
    assert data["data_quality"]["ignored_raw_laps_count"] == 1

    activity = data["activities"][0]
    assert activity["id"] == "TEST0001"
    assert activity["track_counts"] == {"TT1/10": 2, "TT1/8": 1}

    pilots_by_transponder = {p["transponder"]: p for p in data["pilots"]}
    assert pilots_by_transponder["1000001"]["name"] == "TEST PILOT ONE"
    assert pilots_by_transponder["1000001"]["best_lap"] == 15.0
    # Pilote sans correspondance dans speedhive_pilots.json : nom de repli.
    assert pilots_by_transponder["1000002"]["name"] == "Inconnu #1000002"


def test_personal_record_flagging(project):
    bdv_mod, _ = project
    data = bdv_mod.build()

    activity = data["activities"][0]
    participant = next(
        p for p in activity["participants"] if p["transponder"] == "1000001"
    )
    laps = participant["laps"]

    assert laps[0]["lap_time"] == 18.0
    assert "personal_record" not in laps[0]
    assert laps[1]["lap_time"] == 15.0
    assert laps[1]["personal_record"] is True

    assert participant["has_personal_record"] is True
    assert participant["personal_records_count"] == 1


def test_out_of_range_lap_is_ignored(project):
    bdv_mod, _ = project
    data = bdv_mod.build()

    ignored = data["data_quality"]["ignored_raw_laps"]
    assert len(ignored) == 1
    assert ignored[0]["transponder"] == "1000001"
    assert ignored[0]["lap_time"] == 400.0
    assert ignored[0]["reason"] == "hors limites"


def test_main_writes_valid_json(project):
    bdv_mod, root_out = project

    bdv_mod.main()

    assert root_out.exists()
    with root_out.open(encoding="utf-8") as f:
        root_data = json.load(f)
    assert root_data["summary"]["activities_count"] == 1
