"""Unit tests for helpers/constants.py — verifying constants match schema CHECK constraints."""

import os
import re

import pytest

pytestmark = pytest.mark.unit

from candid.controllers.helpers.constants import (
    ROLE_HIERARCHY, HIERARCHICAL_ROLES, ALL_ROLES,
    UserStatus, UserType, PositionStatus, UserPositionStatus, ResponseType,
    ChatRequestResponse, ChatLogStatus, ChatEndType, DeliveryContext, KudosStatus,
    ReportStatus, ModResponse, ModActionClass, ModAction as ModActionConst,
    AppealState, AppealStatus, ReportTargetType,
    RoleChangeAction, RoleChangeStatus, AdminAction,
    SurveyType, SurveyStatus,
    PostType, PostStatus, CommentStatus, VoteType,
    PolisSyncStatus, PolisOperationType, PolisConversationStatus,
    RuleStatus, MOD_RESPONSE_TO_REPORT_STATUS,
    STAGE_ORDER, STAGE_INDEX, WRITE_STAGES, STAGE_TO_PHASE, MAIN_PHASES,
    SessionStatus, MAX_ENDORSEMENTS_PER_USER,
    VALID_PROPOSAL_METHODS, PROPOSAL_METHOD_INITIAL_STAGE,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _class_values(cls):
    """Return all string values from a constants class (skip dunders)."""
    return {v for k, v in vars(cls).items()
            if not k.startswith('_') and isinstance(v, str)}


def _schema_check_values(table, column, schema_text):
    """Extract CHECK constraint values for a given table.column from schema SQL."""
    # Find the table definition
    table_match = re.search(
        rf'CREATE TABLE {table}\s*\((.*?)\);',
        schema_text, re.DOTALL,
    )
    if not table_match:
        return set()
    body = table_match.group(1)

    # Find CHECK constraint for this column
    # Pattern: column_name ... CHECK (column_name IN ('val1', 'val2', ...))
    check_match = re.search(
        rf'{column}.*?CHECK\s*\(\s*{column}\s+IN\s*\(([^)]+)\)',
        body, re.DOTALL,
    )
    if not check_match:
        return set()

    values_str = check_match.group(1)
    return set(re.findall(r"'([^']+)'", values_str))


@pytest.fixture(scope='module')
def schema_text():
    schema_path = os.path.join(
        os.path.dirname(__file__), '..', '..', 'database', 'sql', 'schema.sql')
    with open(schema_path) as f:
        return f.read()


# ---------------------------------------------------------------------------
# Role hierarchy
# ---------------------------------------------------------------------------

class TestRoleHierarchy:
    def test_admin_is_highest(self):
        assert ROLE_HIERARCHY['admin'] == max(ROLE_HIERARCHY.values())

    def test_normal_is_lowest(self):
        assert ROLE_HIERARCHY['normal'] == min(ROLE_HIERARCHY.values())

    def test_moderator_below_admin(self):
        assert ROLE_HIERARCHY['moderator'] < ROLE_HIERARCHY['admin']

    def test_all_roles_in_hierarchy(self):
        for role in ALL_ROLES:
            assert role in ROLE_HIERARCHY

    def test_hierarchical_roles_are_subset(self):
        assert HIERARCHICAL_ROLES.issubset(set(ALL_ROLES))


# ---------------------------------------------------------------------------
# Schema alignment — constants match CHECK constraints
# ---------------------------------------------------------------------------

class TestSchemaAlignment:
    """Verify that constant classes contain exactly the values from schema CHECK constraints."""

    @pytest.mark.parametrize("cls,table,column", [
        (UserStatus, 'users', 'status'),
        (UserType, 'users', 'user_type'),
        (PositionStatus, 'position', 'status'),
        (UserPositionStatus, 'user_position', 'status'),
        (ResponseType, 'response', 'response'),
        (ChatRequestResponse, 'chat_request', 'response'),
        (ChatLogStatus, 'chat_log', 'status'),
        (ChatEndType, 'chat_log', 'end_type'),
        (DeliveryContext, 'chat_request', 'delivery_context'),
        (KudosStatus, 'kudos', 'status'),
        (ReportStatus, 'report', 'status'),
        (ModResponse, 'mod_action', 'mod_response'),
        (ModActionClass, 'mod_action_class', 'class'),
        (ModActionConst, 'mod_action_class', 'action'),
        (AppealState, 'mod_action_appeal', 'appeal_state'),
        (AppealStatus, 'mod_action_appeal', 'status'),
        (ReportTargetType, 'report', 'target_object_type'),
        (RoleChangeAction, 'role_change_request', 'action'),
        (RoleChangeStatus, 'role_change_request', 'status'),
        (AdminAction, 'admin_action_log', 'action'),
        (SurveyType, 'survey', 'survey_type'),
        (SurveyStatus, 'survey', 'status'),
        (PostType, 'post', 'post_type'),
        (PostStatus, 'post', 'status'),
        (CommentStatus, 'comment', 'status'),
        (VoteType, 'post_vote', 'vote_type'),
        (PolisSyncStatus, 'polis_sync_queue', 'status'),
        (PolisOperationType, 'polis_sync_queue', 'operation_type'),
        (PolisConversationStatus, 'polis_conversation', 'status'),
        (RuleStatus, 'rule', 'status'),
    ])
    def test_values_match_schema(self, cls, table, column, schema_text):
        const_values = _class_values(cls)
        schema_values = _schema_check_values(table, column, schema_text)
        if not schema_values:
            pytest.skip(f"Could not parse CHECK for {table}.{column}")
        assert const_values == schema_values, (
            f"{cls.__name__} mismatch with {table}.{column}: "
            f"constants={const_values}, schema={schema_values}"
        )


class TestModResponseMapping:
    def test_all_mod_responses_mapped(self):
        for k, v in vars(ModResponse).items():
            if not k.startswith('_') and isinstance(v, str):
                assert v in MOD_RESPONSE_TO_REPORT_STATUS

    def test_mapping_values_are_valid_report_statuses(self):
        report_statuses = _class_values(ReportStatus)
        for target in MOD_RESPONSE_TO_REPORT_STATUS.values():
            assert target in report_statuses


# ---------------------------------------------------------------------------
# Session stage constants
# ---------------------------------------------------------------------------

class TestSessionStageConstants:
    """Verify session stage constants match the DB schema values."""

    def test_stage_order_has_7_items(self):
        assert len(STAGE_ORDER) == 7

    def test_stage_order_values_match_schema(self):
        expected = [
            'proposal_issue', 'proposal_qualify', 'proposal_stakeholders',
            'opinion_discussion', 'reflection_curation', 'reflection_proposals',
            'consensus',
        ]
        assert STAGE_ORDER == expected

    def test_stage_index_maps_correctly(self):
        for i, stage in enumerate(STAGE_ORDER):
            assert STAGE_INDEX[stage] == i
        assert len(STAGE_INDEX) == len(STAGE_ORDER)

    def test_write_stages_position_equals_active_writing_stages(self):
        active_writing = {
            'proposal_issue', 'proposal_qualify', 'proposal_stakeholders',
            'opinion_discussion', 'reflection_curation', 'reflection_proposals',
        }
        assert WRITE_STAGES['position'] == active_writing

    def test_write_stages_proposal_post(self):
        assert WRITE_STAGES['proposal_post'] == {'proposal_qualify', 'reflection_proposals'}

    def test_write_stages_glossary_covers_all_stages(self):
        assert WRITE_STAGES['glossary'] == set(STAGE_ORDER)

    def test_write_stages_consensus_document(self):
        assert WRITE_STAGES['consensus_document'] == {'consensus'}

    def test_stage_to_phase_mapping(self):
        assert STAGE_TO_PHASE['proposal_issue'] == 'proposal'
        assert STAGE_TO_PHASE['proposal_qualify'] == 'proposal'
        assert STAGE_TO_PHASE['proposal_stakeholders'] == 'proposal'
        assert STAGE_TO_PHASE['opinion_discussion'] == 'opinion'
        assert STAGE_TO_PHASE['reflection_curation'] == 'reflection'
        assert STAGE_TO_PHASE['reflection_proposals'] == 'reflection'
        assert STAGE_TO_PHASE['consensus'] == 'consensus'
        # Every stage must have a phase mapping
        for stage in STAGE_ORDER:
            assert stage in STAGE_TO_PHASE

    def test_main_phases(self):
        assert MAIN_PHASES == ['proposal', 'opinion', 'reflection', 'consensus']

    def test_session_status_has_3_values(self):
        values = _class_values(SessionStatus)
        assert values == {'active', 'archived', 'cancelled'}

    def test_max_endorsements_per_user(self):
        assert MAX_ENDORSEMENTS_PER_USER == 3

    def test_valid_proposal_methods(self):
        assert 'user_driven' in VALID_PROPOSAL_METHODS
        assert 'admin_provided' in VALID_PROPOSAL_METHODS
        assert 'direct_proposal' in VALID_PROPOSAL_METHODS
        assert len(VALID_PROPOSAL_METHODS) == 3

    def test_proposal_method_initial_stage_maps_to_valid_stages(self):
        for method, stage in PROPOSAL_METHOD_INITIAL_STAGE.items():
            assert method in VALID_PROPOSAL_METHODS, f"{method} not in VALID_PROPOSAL_METHODS"
            assert stage in STAGE_ORDER, f"{stage} not in STAGE_ORDER"

    def test_proposal_method_initial_stage_values(self):
        assert PROPOSAL_METHOD_INITIAL_STAGE['user_driven'] == 'proposal_issue'
        assert PROPOSAL_METHOD_INITIAL_STAGE['admin_provided'] == 'proposal_qualify'
        assert PROPOSAL_METHOD_INITIAL_STAGE['direct_proposal'] == 'opinion_discussion'
