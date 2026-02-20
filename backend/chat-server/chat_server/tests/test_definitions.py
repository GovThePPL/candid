"""Tests for DefinitionRequest dataclass serialization.

Since redis_store.py uses relative imports (from ..config), we re-implement
the DefinitionRequest dataclass logic here for isolated unit testing — the same
pattern used by test_reactions.py for rate limiting logic.
"""

import ast
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pytest


# --- Re-implement the DefinitionRequest dataclass for isolated testing ---

@dataclass
class DefinitionRequest:
    """A definition request (mirrors redis_store.DefinitionRequest)."""

    id: str
    requester_id: str
    term: str
    status: str  # 'pending', 'defined', 'accepted', 'both_defined'
    timestamp: str
    definer_id: Optional[str] = None
    definition: Optional[str] = None
    defined_at: Optional[str] = None
    counter_definer_id: Optional[str] = None
    counter_definition: Optional[str] = None
    counter_defined_at: Optional[str] = None

    def to_dict(self) -> dict:
        d = {
            "id": self.id,
            "requesterId": self.requester_id,
            "term": self.term,
            "status": self.status,
            "timestamp": self.timestamp,
            "definerId": self.definer_id,
            "definition": self.definition,
            "definedAt": self.defined_at,
            "counterDefinerId": self.counter_definer_id,
            "counterDefinition": self.counter_definition,
            "counterDefinedAt": self.counter_defined_at,
        }
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "DefinitionRequest":
        return cls(
            id=data["id"],
            requester_id=data.get("requesterId", data.get("requester_id")),
            term=data["term"],
            status=data["status"],
            timestamp=data["timestamp"],
            definer_id=data.get("definerId", data.get("definer_id")),
            definition=data.get("definition"),
            defined_at=data.get("definedAt", data.get("defined_at")),
            counter_definer_id=data.get("counterDefinerId", data.get("counter_definer_id")),
            counter_definition=data.get("counterDefinition", data.get("counter_definition")),
            counter_defined_at=data.get("counterDefinedAt", data.get("counter_defined_at")),
        )


# Verify the source file contains the DefinitionRequest class
_source_path = Path(__file__).resolve().parent.parent / "services" / "redis_store.py"
_source = _source_path.read_text()
_tree = ast.parse(_source)

_definition_class_found = False
for node in ast.iter_child_nodes(_tree):
    if isinstance(node, ast.ClassDef) and node.name == "DefinitionRequest":
        _definition_class_found = True
        break

assert _definition_class_found, "DefinitionRequest class not found in redis_store.py"


class TestDefinitionRequestToDict:
    """Tests for DefinitionRequest.to_dict()."""

    def test_pending_request(self):
        req = DefinitionRequest(
            id="req-1",
            requester_id="user-42",
            term="freedom",
            status="pending",
            timestamp="2026-02-19T12:00:00",
        )
        result = req.to_dict()
        assert result == {
            "id": "req-1",
            "requesterId": "user-42",
            "term": "freedom",
            "status": "pending",
            "timestamp": "2026-02-19T12:00:00",
            "definerId": None,
            "definition": None,
            "definedAt": None,
            "counterDefinerId": None,
            "counterDefinition": None,
            "counterDefinedAt": None,
        }

    def test_defined_request(self):
        req = DefinitionRequest(
            id="req-2",
            requester_id="user-1",
            term="justice",
            status="defined",
            timestamp="2026-02-19T12:00:00",
            definer_id="user-2",
            definition="Fair treatment under the law",
            defined_at="2026-02-19T12:05:00",
        )
        d = req.to_dict()
        assert d["status"] == "defined"
        assert d["definerId"] == "user-2"
        assert d["definition"] == "Fair treatment under the law"
        assert d["definedAt"] == "2026-02-19T12:05:00"

    def test_accepted_request(self):
        req = DefinitionRequest(
            id="req-3",
            requester_id="user-1",
            term="equity",
            status="accepted",
            timestamp="2026-02-19T12:00:00",
            definer_id="user-2",
            definition="Fairness in allocation",
            defined_at="2026-02-19T12:05:00",
        )
        d = req.to_dict()
        assert d["status"] == "accepted"

    def test_both_defined_request(self):
        req = DefinitionRequest(
            id="req-4",
            requester_id="user-1",
            term="democracy",
            status="both_defined",
            timestamp="2026-02-19T12:00:00",
            definer_id="user-2",
            definition="Government by the people",
            defined_at="2026-02-19T12:05:00",
            counter_definer_id="user-1",
            counter_definition="A system of collective decision-making",
            counter_defined_at="2026-02-19T12:10:00",
        )
        d = req.to_dict()
        assert d["status"] == "both_defined"
        assert d["counterDefinerId"] == "user-1"
        assert d["counterDefinition"] == "A system of collective decision-making"
        assert d["counterDefinedAt"] == "2026-02-19T12:10:00"

    def test_uses_camelCase_keys(self):
        req = DefinitionRequest(
            id="x", requester_id="u", term="t", status="pending", timestamp="ts"
        )
        d = req.to_dict()
        assert "requesterId" in d
        assert "requester_id" not in d
        assert "definerId" in d
        assert "definer_id" not in d
        assert "definedAt" in d
        assert "defined_at" not in d
        assert "counterDefinerId" in d
        assert "counter_definer_id" not in d

    def test_all_fields_present(self):
        req = DefinitionRequest(
            id="x", requester_id="u", term="t", status="pending", timestamp="ts"
        )
        d = req.to_dict()
        expected_keys = {
            "id", "requesterId", "term", "status", "timestamp",
            "definerId", "definition", "definedAt",
            "counterDefinerId", "counterDefinition", "counterDefinedAt",
        }
        assert set(d.keys()) == expected_keys


class TestDefinitionRequestFromDict:
    """Tests for DefinitionRequest.from_dict()."""

    def test_from_camelCase(self):
        data = {
            "id": "req-5",
            "requesterId": "user-10",
            "term": "liberty",
            "status": "defined",
            "timestamp": "2026-02-19T13:00:00",
            "definerId": "user-20",
            "definition": "Freedom from oppression",
            "definedAt": "2026-02-19T13:05:00",
            "counterDefinerId": None,
            "counterDefinition": None,
            "counterDefinedAt": None,
        }
        req = DefinitionRequest.from_dict(data)
        assert req.id == "req-5"
        assert req.requester_id == "user-10"
        assert req.definer_id == "user-20"
        assert req.definition == "Freedom from oppression"
        assert req.defined_at == "2026-02-19T13:05:00"

    def test_from_snake_case(self):
        data = {
            "id": "req-6",
            "requester_id": "user-30",
            "term": "equality",
            "status": "pending",
            "timestamp": "2026-02-19T14:00:00",
        }
        req = DefinitionRequest.from_dict(data)
        assert req.requester_id == "user-30"

    def test_camelCase_takes_precedence(self):
        data = {
            "id": "req-7",
            "requesterId": "camel-user",
            "requester_id": "snake-user",
            "term": "test",
            "status": "pending",
            "timestamp": "2026-01-01T00:00:00",
        }
        req = DefinitionRequest.from_dict(data)
        assert req.requester_id == "camel-user"

    def test_optional_fields_default_to_none(self):
        data = {
            "id": "req-8",
            "requesterId": "user-1",
            "term": "word",
            "status": "pending",
            "timestamp": "2026-02-19T15:00:00",
        }
        req = DefinitionRequest.from_dict(data)
        assert req.definer_id is None
        assert req.definition is None
        assert req.defined_at is None
        assert req.counter_definer_id is None
        assert req.counter_definition is None
        assert req.counter_defined_at is None

    def test_roundtrip_pending(self):
        original = DefinitionRequest(
            id="req-rt1",
            requester_id="user-99",
            term="freedom",
            status="pending",
            timestamp="2026-02-19T15:00:00",
        )
        restored = DefinitionRequest.from_dict(original.to_dict())
        assert restored.id == original.id
        assert restored.requester_id == original.requester_id
        assert restored.term == original.term
        assert restored.status == original.status
        assert restored.timestamp == original.timestamp
        assert restored.definer_id is None
        assert restored.definition is None

    def test_roundtrip_both_defined(self):
        original = DefinitionRequest(
            id="req-rt2",
            requester_id="user-1",
            term="democracy",
            status="both_defined",
            timestamp="2026-02-19T12:00:00",
            definer_id="user-2",
            definition="Government by the people",
            defined_at="2026-02-19T12:05:00",
            counter_definer_id="user-1",
            counter_definition="A system of collective decision-making",
            counter_defined_at="2026-02-19T12:10:00",
        )
        restored = DefinitionRequest.from_dict(original.to_dict())
        assert restored.id == original.id
        assert restored.requester_id == original.requester_id
        assert restored.term == original.term
        assert restored.status == original.status
        assert restored.definer_id == original.definer_id
        assert restored.definition == original.definition
        assert restored.defined_at == original.defined_at
        assert restored.counter_definer_id == original.counter_definer_id
        assert restored.counter_definition == original.counter_definition
        assert restored.counter_defined_at == original.counter_defined_at

    def test_all_four_statuses(self):
        for status in ("pending", "defined", "accepted", "both_defined"):
            data = {
                "id": f"req-{status}",
                "requesterId": "u1",
                "term": "test",
                "status": status,
                "timestamp": "2026-01-01T00:00:00",
            }
            req = DefinitionRequest.from_dict(data)
            assert req.status == status
            assert req.to_dict()["status"] == status
