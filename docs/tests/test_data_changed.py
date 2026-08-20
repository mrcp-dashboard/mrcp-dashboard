"""Tests du detecteur de nouveaute (docs/tools/data_changed.py).

Chaque test travaille sur un depot Git temporaire : rien ne touche au depot
reel. Le script est appele en sous-processus, comme le fait update_dashboard.sh.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "data_changed.py"

BASE_DATA = {
    "schema_version": 3.5,
    "generated_at": "2026-08-20T10:00:00+02:00",
    "summary": {"activities_count": 1, "pilots_count": 2, "laps_count": 3},
    "activities": [{"id": "A1"}],
    "pilots": [{"name": "PILOTE UN"}],
}


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=str(repo), check=True, capture_output=True)


def write_data(repo: Path, payload: dict) -> None:
    target = repo / "docs" / "data_v2.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def run_detector(repo: Path) -> int:
    """0 = il y a du nouveau a publier, 1 = rien de neuf."""
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--verbose"],
        cwd=str(repo), capture_output=True, text=True,
    )
    return result.returncode


@pytest.fixture()
def repo(tmp_path):
    git(tmp_path, "init", "-b", "main")
    git(tmp_path, "config", "user.email", "test@example.com")
    git(tmp_path, "config", "user.name", "Test")
    write_data(tmp_path, BASE_DATA)
    git(tmp_path, "add", "docs")
    git(tmp_path, "commit", "-m", "base")
    return tmp_path


def test_aucun_changement(repo):
    assert run_detector(repo) == 1


def test_seul_generated_at_change(repo):
    # Le cas courant : le LXC regenere le fichier alors que personne n'a roule.
    data = dict(BASE_DATA, generated_at="2026-08-20T10:03:00+02:00")
    write_data(repo, data)
    assert run_detector(repo) == 1


def test_nouveau_tour(repo):
    data = dict(BASE_DATA, generated_at="2026-08-20T10:03:00+02:00")
    data["summary"] = dict(BASE_DATA["summary"], laps_count=4)
    write_data(repo, data)
    assert run_detector(repo) == 0


def test_nouvelle_activite(repo):
    data = dict(BASE_DATA, generated_at="2026-08-20T10:03:00+02:00")
    data["activities"] = [{"id": "A1"}, {"id": "A2"}]
    write_data(repo, data)
    assert run_detector(repo) == 0


def test_nouveau_csv_non_suivi(repo):
    # Une nouvelle session apparait : le CSV n'est pas encore suivi par Git.
    csv_dir = repo / "docs" / "speedhive_csv"
    csv_dir.mkdir(parents=True, exist_ok=True)
    (csv_dir / "sessions_999.csv").write_text("Transponder,Date\n", encoding="utf-8")
    assert run_detector(repo) == 0


def test_horodatage_de_synchro_seul_ignore(repo):
    # speedhive_sync_meta.json bouge a chaque passage : ne doit pas suffire.
    meta = repo / "docs" / "speedhive_sync_meta.json"
    meta.write_text(json.dumps({"last_sync": "2026-08-20T10:00:00"}), encoding="utf-8")
    git(repo, "add", "docs")
    git(repo, "commit", "-m", "meta")

    meta.write_text(json.dumps({"last_sync": "2026-08-20T10:03:00"}), encoding="utf-8")
    write_data(repo, dict(BASE_DATA, generated_at="2026-08-20T10:03:00+02:00"))
    assert run_detector(repo) == 1


def test_data_illisible_ne_bloque_pas_la_publication(repo):
    # En cas de doute on prefere un commit de trop a une donnee jamais publiee.
    (repo / "docs" / "data_v2.json").write_text("{ pas du json", encoding="utf-8")
    assert run_detector(repo) == 0
