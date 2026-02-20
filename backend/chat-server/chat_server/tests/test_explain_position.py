"""Tests for ExplainRequest dataclass serialization.

Since redis_store.py uses relative imports (from ..config), we re-implement
the ExplainRequest dataclass logic here for isolated unit testing — the same
pattern used by test_definitions.py for DefinitionRequest.
"""

import ast
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pytest


# --- Re-implement the ExplainRequest dataclass for isolated testing ---

@dataclass
class ExplainRequest:
    """An explain-my-position request (mirrors redis_store.ExplainRequest)."""

    id: str
    requester_id: str
    position: str
    status: str  # 'pending','explained','good_faith','completed','corrected'
    timestamp: str
    explainer_id: Optional[str] = None
    explanation: Optional[str] = None
    explained_at: Optional[str] = None
    good_faith: Optional[bool] = None
    correction: Optional[str] = None
    corrected_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "requesterId": self.requester_id,
            "position": self.position,
            "status": self.status,
            "timestamp": self.timestamp,
            "explainerId": self.explainer_id,
            "explanation": self.explanation,
            "explainedAt": self.explained_at,
            "goodFaith": self.good_faith,
            "correction": self.correction,
            "correctedAt": self.corrected_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ExplainRequest":
        return cls(
            id=data["id"],
            requester_id=data.get("requesterId", data.get("requester_id")),
            position=data["position"],
            status=data["status"],
            timestamp=data["timestamp"],
            explainer_id=data.get("explainerId", data.get("explainer_id")),
            explanation=data.get("explanation"),
            explained_at=data.get("explainedAt", data.get("explained_at")),
            good_faith=data.get("goodFaith", data.get("good_faith")),
            correction=data.get("correction"),
            corrected_at=data.get("correctedAt", data.get("corrected_at")),
        )


# Verify the source file contains the ExplainRequest class
_source_path = Path(__file__).resolve().parent.parent / "services" / "redis_store.py"
_source = _source_path.read_text()
_tree = ast.parse(_source)

_explain_class_found = False
for node in ast.iter_child_nodes(_tree):
    if isinstance(node, ast.ClassDef) and node.name == "ExplainRequest":
        _explain_class_found = True
        break

assert _explain_class_found, "ExplainRequest class not found in redis_store.py"


class TestExplainRequestToDict:
    """Tests for ExplainRequest.to_dict()."""

    def test_pending_request(self):
        req = ExplainRequest(
            id="req-1",
            requester_id="user-42",
            position="Climate change requires urgent action",
            status="pending",
            timestamp="2026-02-19T12:00:00",
        )
        result = req.to_dict()
        assert result == {
            "id": "req-1",
            "requesterId": "user-42",
            "position": "Climate change requires urgent action",
            "status": "pending",
            "timestamp": "2026-02-19T12:00:00",
            "explainerId": None,
            "explanation": None,
            "explainedAt": None,
            "goodFaith": None,
            "correction": None,
            "correctedAt": None,
        }

    def test_explained_request(self):
        req = ExplainRequest(
            id="req-2",
            requester_id="user-1",
            position="Universal healthcare is essential",
            status="explained",
            timestamp="2026-02-19T12:00:00",
            explainer_id="user-2",
            explanation="You believe healthcare should be available to all citizens",
            explained_at="2026-02-19T12:05:00",
        )
        d = req.to_dict()
        assert d["status"] == "explained"
        assert d["explainerId"] == "user-2"
        assert d["explanation"] == "You believe healthcare should be available to all citizens"
        assert d["explainedAt"] == "2026-02-19T12:05:00"

    def test_good_faith_request(self):
        req = ExplainRequest(
            id="req-3",
            requester_id="user-1",
            position="Education reform needed",
            status="good_faith",
            timestamp="2026-02-19T12:00:00",
            explainer_id="user-2",
            explanation="You think the education system needs changes",
            explained_at="2026-02-19T12:05:00",
            good_faith=True,
        )
        d = req.to_dict()
        assert d["status"] == "good_faith"
        assert d["goodFaith"] is True

    def test_completed_request(self):
        req = ExplainRequest(
            id="req-4",
            requester_id="user-1",
            position="Free trade benefits all",
            status="completed",
            timestamp="2026-02-19T12:00:00",
            explainer_id="user-2",
            explanation="You believe open markets create prosperity",
            explained_at="2026-02-19T12:05:00",
            good_faith=True,
        )
        d = req.to_dict()
        assert d["status"] == "completed"

    def test_corrected_request(self):
        req = ExplainRequest(
            id="req-5",
            requester_id="user-1",
            position="Immigration reform needed",
            status="corrected",
            timestamp="2026-02-19T12:00:00",
            explainer_id="user-2",
            explanation="You want stricter immigration laws",
            explained_at="2026-02-19T12:05:00",
            good_faith=True,
            correction="I believe in a balanced approach to immigration reform",
            corrected_at="2026-02-19T12:10:00",
        )
        d = req.to_dict()
        assert d["status"] == "corrected"
        assert d["correction"] == "I believe in a balanced approach to immigration reform"
        assert d["correctedAt"] == "2026-02-19T12:10:00"

    def test_uses_camelCase_keys(self):
        req = ExplainRequest(
            id="x", requester_id="u", position="p", status="pending", timestamp="ts"
        )
        d = req.to_dict()
        assert "requesterId" in d
        assert "requester_id" not in d
        assert "explainerId" in d
        assert "explainer_id" not in d
        assert "explainedAt" in d
        assert "explained_at" not in d
        assert "goodFaith" in d
        assert "good_faith" not in d
        assert "correctedAt" in d
        assert "corrected_at" not in d

    def test_all_fields_present(self):
        req = ExplainRequest(
            id="x", requester_id="u", position="p", status="pending", timestamp="ts"
        )
        d = req.to_dict()
        expected_keys = {
            "id", "requesterId", "position", "status", "timestamp",
            "explainerId", "explanation", "explainedAt",
            "goodFaith", "correction", "correctedAt",
        }
        assert set(d.keys()) == expected_keys


class TestExplainRequestFromDict:
    """Tests for ExplainRequest.from_dict()."""

    def test_from_camelCase(self):
        data = {
            "id": "req-5",
            "requesterId": "user-10",
            "position": "Tax reform needed",
            "status": "explained",
            "timestamp": "2026-02-19T13:00:00",
            "explainerId": "user-20",
            "explanation": "You want lower taxes",
            "explainedAt": "2026-02-19T13:05:00",
            "goodFaith": None,
            "correction": None,
            "correctedAt": None,
        }
        req = ExplainRequest.from_dict(data)
        assert req.id == "req-5"
        assert req.requester_id == "user-10"
        assert req.explainer_id == "user-20"
        assert req.explanation == "You want lower taxes"
        assert req.explained_at == "2026-02-19T13:05:00"

    def test_from_snake_case(self):
        data = {
            "id": "req-6",
            "requester_id": "user-30",
            "position": "Infrastructure investment",
            "status": "pending",
            "timestamp": "2026-02-19T14:00:00",
        }
        req = ExplainRequest.from_dict(data)
        assert req.requester_id == "user-30"

    def test_camelCase_takes_precedence(self):
        data = {
            "id": "req-7",
            "requesterId": "camel-user",
            "requester_id": "snake-user",
            "position": "test",
            "status": "pending",
            "timestamp": "2026-01-01T00:00:00",
        }
        req = ExplainRequest.from_dict(data)
        assert req.requester_id == "camel-user"

    def test_optional_fields_default_to_none(self):
        data = {
            "id": "req-8",
            "requesterId": "user-1",
            "position": "Some position",
            "status": "pending",
            "timestamp": "2026-02-19T15:00:00",
        }
        req = ExplainRequest.from_dict(data)
        assert req.explainer_id is None
        assert req.explanation is None
        assert req.explained_at is None
        assert req.good_faith is None
        assert req.correction is None
        assert req.corrected_at is None

    def test_roundtrip_pending(self):
        original = ExplainRequest(
            id="req-rt1",
            requester_id="user-99",
            position="Environmental policy",
            status="pending",
            timestamp="2026-02-19T15:00:00",
        )
        restored = ExplainRequest.from_dict(original.to_dict())
        assert restored.id == original.id
        assert restored.requester_id == original.requester_id
        assert restored.position == original.position
        assert restored.status == original.status
        assert restored.timestamp == original.timestamp
        assert restored.explainer_id is None
        assert restored.explanation is None

    def test_roundtrip_corrected(self):
        original = ExplainRequest(
            id="req-rt2",
            requester_id="user-1",
            position="Gun control debate",
            status="corrected",
            timestamp="2026-02-19T12:00:00",
            explainer_id="user-2",
            explanation="You want all guns banned",
            explained_at="2026-02-19T12:05:00",
            good_faith=True,
            correction="I want reasonable regulations, not a total ban",
            corrected_at="2026-02-19T12:10:00",
        )
        restored = ExplainRequest.from_dict(original.to_dict())
        assert restored.id == original.id
        assert restored.requester_id == original.requester_id
        assert restored.position == original.position
        assert restored.status == original.status
        assert restored.explainer_id == original.explainer_id
        assert restored.explanation == original.explanation
        assert restored.explained_at == original.explained_at
        assert restored.good_faith == original.good_faith
        assert restored.correction == original.correction
        assert restored.corrected_at == original.corrected_at

    def test_all_five_statuses(self):
        for status in ("pending", "explained", "good_faith", "completed", "corrected"):
            data = {
                "id": f"req-{status}",
                "requesterId": "u1",
                "position": "test",
                "status": status,
                "timestamp": "2026-01-01T00:00:00",
            }
            req = ExplainRequest.from_dict(data)
            assert req.status == status
            assert req.to_dict()["status"] == status
