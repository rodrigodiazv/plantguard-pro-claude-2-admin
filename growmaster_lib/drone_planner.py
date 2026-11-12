"""Daily inspection route planning for drones over a cannabis plot.

Sections come from the grower's plan, never from image colour: every cannabis
section is green. An aerial image is only used to measure canopy cover.

Coordinates are local metres (x east, y north) from an origin the grower fixes.
Nothing here talks to a drone: the output is a mission description.
"""
import itertools
import math
from dataclasses import dataclass

EXACT_ORDER_MAX_SECTIONS = 8


@dataclass(frozen=True)
class FlightParams:
    """Placeholders until a real airframe is chosen; take them from its data sheet."""
    alt_m: float = 3.0
    hfov_deg: float = 70.0
    sidelap: float = 0.30
    speed_ms: float = 2.0
    turn_s: float = 3.0
    sortie_budget_s: float = 12 * 60
    fence_margin_m: float = 1.0


def _dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def path_length(points):
    return sum(_dist(points[i], points[i + 1]) for i in range(len(points) - 1))


def lanes(rect, params):
    """Back-and-forth lanes along x covering rect = [x0, y0, x1, y1]."""
    x0, y0, x1, y1 = rect
    swath = 2 * params.alt_m * math.tan(math.radians(params.hfov_deg / 2))
    count = max(1, math.ceil((y1 - y0) / (swath * (1 - params.sidelap))))
    step = (y1 - y0) / count
    points = []
    for i in range(count):
        y = y0 + step * (i + 0.5)
        row = [(x0, y), (x1, y)]
        points += row if i % 2 == 0 else row[::-1]
    return points


def tour_cost(order, ends, dock):
    """Transit metres for order = [(section index, flipped)], ends[i] = (entry, exit)."""
    current, cost = dock, 0.0
    for index, flipped in order:
        entry, exit_ = ends[index][::-1] if flipped else ends[index]
        cost += _dist(current, entry)
        current = exit_
    return cost + _dist(current, dock)


def exact_order(ends, dock):
    best_cost, best_order = float("inf"), []
    for perm in itertools.permutations(range(len(ends))):
        state = {f: (_dist(dock, ends[perm[0]][f]), [(perm[0], f)]) for f in (0, 1)}
        for k in range(1, len(perm)):
            nxt = {}
            for f in (0, 1):
                entry = ends[perm[k]][f]
                cost, order = min(
                    ((state[p][0] + _dist(ends[perm[k - 1]][1 - p], entry), state[p][1]) for p in (0, 1)),
                    key=lambda t: t[0],
                )
                nxt[f] = (cost, order + [(perm[k], f)])
            state = nxt
        for f in (0, 1):
            cost = state[f][0] + _dist(ends[perm[-1]][1 - f], dock)
            if cost < best_cost:
                best_cost, best_order = cost, state[f][1]
    return best_order, best_cost


def heuristic_order(ends, dock):
    """Nearest entry first, then segment reversal and single-section moves until no gain."""
    left, current, order = set(range(len(ends))), dock, []
    while left:
        index, flip = min(
            ((i, f) for i in left for f in (0, 1)), key=lambda t: _dist(current, ends[t[0]][t[1]])
        )
        order.append((index, flip))
        left.remove(index)
        current = ends[index][1 - flip]
    best = tour_cost(order, ends, dock)
    improved = True
    while improved:
        improved = False
        n = len(order)
        candidates = [
            order[:i] + [(k, 1 - f) for k, f in reversed(order[i:j + 1])] + order[j + 1:]
            for i in range(n) for j in range(i, n)
        ]
        for i in range(n):
            rest = order[:i] + order[i + 1:]
            candidates += [rest[:j] + [(order[i][0], g)] + rest[j:] for j in range(n) for g in (0, 1)]
        for candidate in candidates:
            cost = tour_cost(candidate, ends, dock)
            if cost < best - 1e-9:
                order, best, improved = candidate, cost, True
                break
    return order, best


def _segment_distance(p, a, b):
    ax, ay, bx, by = *a, *b
    dx, dy = bx - ax, by - ay
    if dx == dy == 0:
        return _dist(p, a)
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    return _dist(p, (ax + t * dx, ay + t * dy))


def inside_fence(point, fence, margin_m=0.0):
    """True when point is inside the polygon and at least margin_m from every edge."""
    x, y = point
    inside = False
    for i in range(len(fence)):
        (x1, y1), (x2, y2) = fence[i], fence[(i + 1) % len(fence)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    if not inside:
        return False
    return all(
        _segment_distance(point, fence[i], fence[(i + 1) % len(fence)]) >= margin_m - 1e-9
        for i in range(len(fence))
    )


def check_fence(points, fence, margin_m, sample_m=0.5):
    """Raise if any waypoint, or any point along a leg, leaves the fence."""
    for a, b in zip(points, points[1:]):
        steps = max(1, math.ceil(_dist(a, b) / sample_m))
        for s in range(steps + 1):
            p = (a[0] + (b[0] - a[0]) * s / steps, a[1] + (b[1] - a[1]) * s / steps)
            if not inside_fence(p, fence, margin_m):
                raise ValueError(f"route leaves the geofence near ({p[0]:.1f}, {p[1]:.1f})")


def split_sorties(points, dock, params):
    """Cut the waypoint chain into battery-sized flights that start and end at the dock."""
    def leg_s(a, b):
        return _dist(a, b) / params.speed_ms + params.turn_s

    sorties, current, used = [], [dock], 0.0
    for p in points:
        leg = leg_s(current[-1], p)
        if used + leg + leg_s(p, dock) > params.sortie_budget_s and len(current) > 1:
            sorties.append({"waypoints": current + [dock], "est_s": used + leg_s(current[-1], dock)})
            current, used = [dock], 0.0
            leg = leg_s(dock, p)
        if leg + leg_s(p, dock) > params.sortie_budget_s:
            raise ValueError(f"waypoint ({p[0]:.1f}, {p[1]:.1f}) is out of battery range from the dock")
        current.append(p)
        used += leg
    sorties.append({"waypoints": current + [dock], "est_s": used + leg_s(current[-1], dock)})
    return sorties


def plan_day(plan, day, params=FlightParams()):
    """Mission for one day.

    plan = {"fence": [[x, y], ...], "dock": [x, y],
            "sections": [{"id", "stage", "rect": [x0, y0, x1, y1], "every_days"}]}
    A section is due when day is a multiple of its every_days.
    """
    dock = tuple(plan["dock"])
    due = [s for s in plan["sections"] if day % s["every_days"] == 0]
    if not due:
        return {"day": day, "sections": [], "sorties": []}
    lane_points = [lanes(s["rect"], params) for s in due]
    ends = [(points[0], points[-1]) for points in lane_points]
    solver = exact_order if len(due) <= EXACT_ORDER_MAX_SECTIONS else heuristic_order
    order, transit = solver(ends, dock)
    chain = []
    for index, flipped in order:
        chain += lane_points[index][::-1] if flipped else lane_points[index]
    sorties = split_sorties(chain, dock, params)
    for sortie in sorties:
        check_fence(sortie["waypoints"], plan["fence"], params.fence_margin_m)
    return {
        "day": day,
        "frame": "local metres, x east, y north",
        "altitude_above_canopy_m": params.alt_m,
        "sections": [due[i]["id"] for i, _ in order],
        "transit_m": round(transit, 1),
        "sorties": [
            {"est_s": round(s["est_s"]), "length_m": round(path_length(s["waypoints"]), 1),
             "waypoints": [[round(x, 2), round(y, 2)] for x, y in s["waypoints"]]}
            for s in sorties
        ],
    }


def canopy_mask(bgr):
    """Vegetation mask from a top-down BGR image: Excess Green index + Otsu threshold."""
    import cv2
    import numpy as np

    f = bgr.astype(np.float32)
    total = f.sum(2) + 1e-6
    b, g, r = (f[:, :, i] / total for i in range(3))
    exg = cv2.normalize(2 * g - r - b, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    _, mask = cv2.threshold(exg, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
