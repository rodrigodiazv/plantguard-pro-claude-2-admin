"""Offline tests for the Growmaster orchestrator. Every agent here is simulated."""
import importlib.util
import pathlib

import pytest

_path = pathlib.Path(__file__).resolve().parents[1] / "growmaster.py"
_spec = importlib.util.spec_from_file_location("growmaster", _path)
gm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gm)
F, U = gm.Finding, gm.Urgency


def make(calls):
    def soil():
        return [F("soil", "B", U.CRITICAL, "soil moisture below target", {"moisture_pct": 48},
                  {"type": "irrigation", "minutes": 20})]

    def drone():
        return [F("drone", "A", U.LOW, "section A inspected"),
                F("drone", "A", U.HIGH, "pest signs on leaves", {"images": 8}, {"type": "treatment"})]

    def broken():
        raise RuntimeError("sensor offline")

    def irrigate(action):
        calls.append(action)
        return {"minutes": action["minutes"]}

    return gm.Growmaster({"drone": drone, "broken": broken, "soil": soil}, {"irrigation": irrigate})


def test_cycle_orders_by_urgency_and_survives_a_failing_agent():
    g = make([])
    new = g.run_cycle()
    assert [p.finding.urgency for p in new] == [U.CRITICAL, U.HIGH]
    assert len(g.reports) == 1 and g.reports[0].reason == "section A inspected"
    assert g.agent_errors == [{"agent": "broken", "error": "sensor offline"}]


def test_nothing_executes_without_approval():
    calls = []
    g = make(calls)
    first = g.run_cycle()[0]
    with pytest.raises(PermissionError):
        g.execute(first.id)
    g.decide(first.id, False, "tecnico")
    with pytest.raises(PermissionError):
        g.execute(first.id)
    assert calls == []


def test_approved_action_runs_once_and_records_who_decided():
    calls = []
    g = make(calls)
    first = g.run_cycle()[0]
    g.decide(first.id, True, "admin")
    done = g.execute(first.id)
    assert done.status == "executed" and done.decided_by == "admin" and calls == [first.finding.action]
    with pytest.raises(PermissionError):
        g.execute(first.id)
    with pytest.raises(ValueError):
        g.decide(first.id, True, "admin")


def test_decision_needs_a_name_and_missing_actuator_fails_cleanly():
    g = make([])
    _, treatment = g.run_cycle()
    with pytest.raises(ValueError):
        g.decide(treatment.id, True, "")
    g.decide(treatment.id, True, "admin")
    assert g.execute(treatment.id).status == "failed"
    assert g.pending()[0].finding.agent == "soil"


def test_admin_sets_drone_count_per_zone():
    g = make([])
    g.set_drones("A", 3, "admin")
    g.set_drones("A", 1, "admin")
    assert g.summary()["drone_allocation"] == {"A": {"count": 1, "by": "admin"}}
    with pytest.raises(ValueError):
        g.set_drones("A", -1, "admin")
