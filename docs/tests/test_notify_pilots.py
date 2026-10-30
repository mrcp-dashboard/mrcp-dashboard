"""Tests de l'envoi des rapports de roulage (docs/notify_pilots.py).

Aucun reseau : waha_send est remplace par une liste d'envois, et les trois
fichiers JSON du script pointent vers tmp_path.
"""
import json
import sys

import pytest

import notify_pilots


def lap(no, time, start, track="TT1/8", day="2026-10-25"):
    return {
        "date": day, "start_time": start, "lap_no": no,
        "lap_time": time, "track": track,
    }


def data_with(laps, pilot="PILOTE UN"):
    return {
        "activities": [{
            "id": "A1",
            "participants": [{"pilot_name": pilot, "transponder": "1234567", "laps": laps}],
        }],
        "pilots": [{"name": pilot, "transponder": "1234567"}],
    }


# --------------------------------------------------------------------------
# Decoupage en relances
# --------------------------------------------------------------------------

def test_split_runs_coupe_quand_le_numero_de_tour_repart():
    laps = [lap(1, 40, "10:00:00"), lap(2, 39, "10:00:40"),
            lap(1, 38, "10:30:00"), lap(2, 37, "10:30:38")]
    runs = notify_pilots.split_runs(laps)
    assert [len(r) for r in runs] == [2, 2]


def test_split_runs_coupe_au_changement_de_piste():
    laps = [lap(1, 40, "10:00:00"), lap(2, 39, "10:00:40"),
            lap(3, 20, "10:01:19", track="TT1/10")]
    assert [len(r) for r in notify_pilots.split_runs(laps)] == [2, 1]


def test_best_series_prend_la_meilleure_fenetre_glissante():
    laps = [lap(i + 1, t, f"10:0{i}:00") for i, t in enumerate([40, 39, 38, 37, 36, 30, 30, 30])]
    # Les 5 derniers (37+36+30+30+30)/5 = 32.6 battent les 5 premiers.
    assert notify_pilots.best_series(laps, 5) == pytest.approx(32.6)


def test_best_series_ignore_une_relance_trop_courte():
    laps = [lap(1, 30, "10:00:00"), lap(2, 30, "10:00:30"),
            lap(1, 40, "11:00:00"), lap(2, 40, "11:00:40"),
            lap(3, 40, "11:01:20"), lap(4, 40, "11:02:00"), lap(5, 40, "11:02:40")]
    # La relance a 30 s ne fait que 2 tours : seule celle a 40 s est eligible.
    assert notify_pilots.best_series(laps, 5) == pytest.approx(40)
    assert notify_pilots.best_series(laps[:2], 5) is None


# --------------------------------------------------------------------------
# Resume
# --------------------------------------------------------------------------

def test_summarize_ignore_les_tours_de_l_autre_piste():
    """Regression : un TT1/10 isole annoncait un faux record.

    Le 25/10/2026, un tour a 22,354 s classe TT1/10 s'etait glisse dans une
    journee de TT1/8 a 33 s et le rapport annoncait 8 s de mieux.
    """
    laps = [lap(i + 1, 33.5, f"10:0{i}:00") for i in range(5)]
    laps.append(lap(1, 22.354, "11:00:00", track="TT1/10"))
    summary = notify_pilots.summarize(data_with(laps), "PILOTE UN", "2026-10-25")
    assert summary["track"] == "TT1/8"
    assert summary["best"] == pytest.approx(33.5)
    assert summary["laps"] == 5


def test_summarize_detecte_le_record_battu():
    veille = [lap(i + 1, 35.0, f"10:0{i}:00", day="2026-10-24") for i in range(3)]
    jour = [lap(i + 1, 34.0, f"10:0{i}:00") for i in range(3)]
    summary = notify_pilots.summarize(data_with(veille + jour), "PILOTE UN", "2026-10-25")
    assert summary["previous_best"] == pytest.approx(35.0)
    assert summary["gain"] == pytest.approx(1.0)
    assert "Record perso battu" in notify_pilots.build_message(summary, "run")


def test_summarize_trouve_le_pilote_sans_accent_ni_majuscule():
    laps = [lap(1, 33.0, "10:00:00")]
    data = data_with(laps, pilot="JÉRÔME VAQUERO")
    assert notify_pilots.summarize(data, "jerome vaquero", "2026-10-25")["laps"] == 1


# --------------------------------------------------------------------------
# Declenchement et anti-doublon
# --------------------------------------------------------------------------

@pytest.fixture()
def envoi(tmp_path, monkeypatch):
    """Isole les fichiers du script et capture les messages envoyes."""
    sent_messages = []
    monkeypatch.setattr(notify_pilots, "DATA_FILE", tmp_path / "data_v2.json")
    monkeypatch.setattr(notify_pilots, "NOTIFICATIONS_FILE", tmp_path / "notifications.json")
    monkeypatch.setattr(notify_pilots, "SENT_FILE", tmp_path / "sent.json")
    monkeypatch.setattr(
        notify_pilots, "waha_send",
        lambda chat_id, text, dry_run=False: sent_messages.append((chat_id, text)) or True,
    )
    (tmp_path / "notifications.json").write_text(json.dumps({
        "pilots": {"PILOTE UN": {"whatsapp": "33600000000@c.us", "enabled": True}}
    }), encoding="utf-8")

    def run(laps, now):
        (tmp_path / "data_v2.json").write_text(json.dumps(data_with(laps)), encoding="utf-8")
        monkeypatch.setattr(sys, "argv", ["notify_pilots.py", "--date", "2026-10-25", "--now", now])
        notify_pilots.main()
        return sent_messages

    return run


def test_rien_tant_que_le_pilote_roule(envoi):
    laps = [lap(i + 1, 40, f"10:0{i}:00") for i in range(5)]
    assert envoi(laps, "10:10") == []


def test_rapport_envoye_quand_la_piste_est_calme(envoi):
    laps = [lap(i + 1, 40, f"10:0{i}:00") for i in range(5)]
    sent = envoi(laps, "10:30")
    assert len(sent) == 1
    assert sent[0][0] == "33600000000@c.us"
    assert "Tours : 5" in sent[0][1]


def test_pas_deux_fois_le_meme_rapport(envoi):
    laps = [lap(i + 1, 40, f"10:0{i}:00") for i in range(5)]
    envoi(laps, "10:30")
    assert len(envoi(laps, "10:33")) == 1


def test_une_nouvelle_relance_redonne_droit_a_un_rapport(envoi):
    laps = [lap(i + 1, 40, f"10:0{i}:00") for i in range(5)]
    envoi(laps, "10:30")
    laps += [lap(1, 39, "11:00:00"), lap(2, 39, "11:00:39")]
    assert len(envoi(laps, "11:30")) == 2


def test_resume_du_soir_seulement_si_plusieurs_relances(envoi):
    une_relance = [lap(i + 1, 40, f"10:0{i}:00") for i in range(5)]
    assert len(envoi(une_relance, "21:00")) == 1  # le rapport de fin de roulage, pas de resume

    deux_relances = une_relance + [lap(1, 39, "11:00:00"), lap(2, 39, "11:00:39")]
    messages = envoi(deux_relances, "21:30")
    assert len(messages) == 3
    assert "ta journee" in messages[-1][1]


def test_pilote_desinscrit_ne_recoit_rien(envoi, tmp_path):
    (tmp_path / "notifications.json").write_text(json.dumps({
        "pilots": {"PILOTE UN": {"whatsapp": "33600000000@c.us", "enabled": False}}
    }), encoding="utf-8")
    laps = [lap(i + 1, 40, f"10:0{i}:00") for i in range(5)]
    assert envoi(laps, "10:30") == []
