"""Offline tests for the drone route planner (no server, no drone)."""
import importlib.util
import pathlib
import random

import pytest

_path = pathlib.Path(__file__).resolve().parents[1] / "drone_planner.py"
_spec = importlib.util.spec_from_file_location("drone_planner", _path)
dp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dp)

PLAN = {
    "fence": [[0, 0], [60, 0], [60, 40], [0, 40]],
    "dock": [2.0, 2.0],
    "sections": [
        {"id": "A", "stage": "vegetative", "rect": [4, 4, 28, 18], "every_days": 2},
        {"id": "B", "stage": "flowering", "rect": [32, 4, 56, 18], "every_days": 1},
        {"id": "C", "stage": "flowering", "rect": [4, 22, 28, 36], "every_days": 1},
        {"id": "D", "stage": "mothers", "rect": [32, 22, 56, 36], "every_days": 3},
    ],
}


def test_sections_due_follow_their_frequency():
    assert sorted(dp.plan_day(PLAN, 1)["sections"]) == ["B", "C"]
    assert sorted(dp.plan_day(PLAN, 2)["sections"]) == ["A", "B", "C"]
    assert sorted(dp.plan_day(PLAN, 6)["sections"]) == ["A", "B", "C", "D"]


def test_same_day_gives_same_route():
    assert dp.plan_day(PLAN, 6) == dp.plan_day(PLAN, 6)


def test_lanes_stay_inside_section_and_cover_its_height():
    params = dp.FlightParams()
    rect = [4, 4, 28, 18]
    points = dp.lanes(rect, params)
    assert all(rect[0] <= x <= rect[2] and rect[1] <= y <= rect[3] for x, y in points)
    swath = 2 * params.alt_m * 0.7002  # tan(35 deg)
    ys = sorted({y for _, y in points})
    assert ys[0] - rect[1] <= swath / 2 and rect[3] - ys[-1] <= swath / 2
    assert all(b - a <= swath for a, b in zip(ys, ys[1:]))


def test_sorties_start_and_end_at_dock_within_battery():
    params = dp.FlightParams(sortie_budget_s=180)
    mission = dp.plan_day(PLAN, 6, params)
    assert len(mission["sorties"]) > 1
    for sortie in mission["sorties"]:
        assert sortie["waypoints"][0] == sortie["waypoints"][-1] == PLAN["dock"]
        assert sortie["est_s"] <= 180


def test_route_outside_fence_is_rejected():
    small = dict(PLAN, fence=[[0, 0], [30, 0], [30, 40], [0, 40]])
    with pytest.raises(ValueError, match="geofence"):
        dp.plan_day(small, 6)


def test_unreachable_waypoint_is_rejected():
    with pytest.raises(ValueError, match="battery"):
        dp.plan_day(PLAN, 6, dp.FlightParams(sortie_budget_s=20))


def test_fence_handles_concave_polygon_and_margin():
    l_shape = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]]
    assert dp.inside_fence((2, 8), l_shape)
    assert not dp.inside_fence((8, 8), l_shape)
    assert not dp.inside_fence((0.5, 5), l_shape, margin_m=1.0)
    with pytest.raises(ValueError):
        dp.check_fence([(3, 9), (9, 3)], l_shape, 0.0)


def test_heuristic_never_beats_exact_and_stays_close():
    rng = random.Random(3)
    gaps = []
    for _ in range(20):
        ends = [((rng.uniform(0, 60), rng.uniform(0, 40)), (rng.uniform(0, 60), rng.uniform(0, 40)))
                for _ in range(6)]
        exact = dp.exact_order(ends, (2.0, 2.0))[1]
        heuristic = dp.heuristic_order(ends, (2.0, 2.0))[1]
        assert heuristic >= exact - 1e-6
        gaps.append(heuristic / exact - 1)
    assert sum(gaps) / len(gaps) < 0.10


def test_canopy_mask_matches_known_synthetic_canopy():
    cv2 = pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")
    rng = np.random.default_rng(1)
    img = np.empty((400, 600, 3), np.float32)
    img[:] = (60, 95, 130)
    img += rng.normal(0, 14, img.shape)
    truth = np.zeros((400, 600), np.uint8)
    for y in range(30, 400, 30):
        for x in range(30, 600, 24):
            colour = (40 + rng.normal(0, 8), 140 + rng.normal(0, 20), 60 + rng.normal(0, 10))
            cv2.circle(img, (x, y), 9, colour, -1)
            cv2.circle(truth, (x, y), 9, 1, -1)
    img = cv2.GaussianBlur(np.clip(img, 0, 255).astype(np.uint8), (5, 5), 0)
    mask = dp.canopy_mask(img)
    truth = truth.astype(bool)
    assert (mask & truth).sum() / (mask | truth).sum() > 0.85
