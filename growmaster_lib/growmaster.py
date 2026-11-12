"""Growmaster: orchestrator that collects findings from sub-agents and gates actions.

Sub-agents (drones, soil sensors, climate, nutrients, irrigation...) are plain
callables returning Finding objects. Nothing touches the crop unless a named
person approves the proposal first. No real device is wired in yet.
"""
import itertools
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Callable, Optional


class Urgency(IntEnum):
    CRITICAL = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3


@dataclass
class Finding:
    agent: str
    zone: str
    urgency: Urgency
    reason: str
    evidence: dict = field(default_factory=dict)
    action: Optional[dict] = None  # {"type": actuator name, ...}; None means report only


@dataclass
class Proposal:
    id: int
    finding: Finding
    status: str = "pending"  # pending, approved, rejected, executed, failed
    decided_by: Optional[str] = None
    result: Optional[dict] = None


class Growmaster:
    def __init__(self, agents: dict, actuators: dict):
        self.agents: dict[str, Callable[[], list]] = agents
        self.actuators: dict[str, Callable[[dict], dict]] = actuators
        self.proposals: dict[int, Proposal] = {}
        self.reports: list[Finding] = []
        self.agent_errors: list[dict] = []
        self.drone_allocation: dict[str, dict] = {}
        self._ids = itertools.count(1)

    def run_cycle(self):
        """Ask every agent once. A failing agent is logged and does not stop the others."""
        new = []
        for name, agent in self.agents.items():
            try:
                findings = agent()
            except Exception as exc:
                self.agent_errors.append({"agent": name, "error": str(exc)})
                continue
            for finding in findings:
                if finding.action is None:
                    self.reports.append(finding)
                else:
                    proposal = Proposal(next(self._ids), finding)
                    self.proposals[proposal.id] = proposal
                    new.append(proposal)
        return sorted(new, key=lambda p: p.finding.urgency)

    def pending(self):
        return sorted(
            (p for p in self.proposals.values() if p.status == "pending"),
            key=lambda p: (p.finding.urgency, p.id),
        )

    def decide(self, proposal_id, approved, by):
        proposal = self.proposals[proposal_id]
        if proposal.status != "pending":
            raise ValueError(f"proposal {proposal_id} is already {proposal.status}")
        if not by:
            raise ValueError("a decision needs the name of who decided")
        proposal.status = "approved" if approved else "rejected"
        proposal.decided_by = by
        return proposal

    def execute(self, proposal_id):
        proposal = self.proposals[proposal_id]
        if proposal.status != "approved":
            raise PermissionError(f"proposal {proposal_id} is {proposal.status}, not approved")
        actuator = self.actuators.get(proposal.finding.action["type"])
        if actuator is None:
            proposal.status = "failed"
            proposal.result = {"error": f"no actuator for {proposal.finding.action['type']}"}
            return proposal
        try:
            proposal.result = actuator(proposal.finding.action)
            proposal.status = "executed"
        except Exception as exc:
            proposal.status = "failed"
            proposal.result = {"error": str(exc)}
        return proposal

    def set_drones(self, zone, count, by):
        """Administrator raises or lowers how many drones cover a zone."""
        if count < 0:
            raise ValueError("drone count cannot be negative")
        if not by:
            raise ValueError("a change needs the name of who decided")
        self.drone_allocation[zone] = {"count": count, "by": by}

    def summary(self):
        by_status = {}
        for p in self.proposals.values():
            by_status[p.status] = by_status.get(p.status, 0) + 1
        return {
            "proposals": by_status,
            "section_reports": len(self.reports),
            "agent_errors": self.agent_errors,
            "drone_allocation": self.drone_allocation,
        }
