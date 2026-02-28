"""Shared constants for status values, role hierarchy, and enums.

These mirror the CHECK constraints in schema.sql. Using these constants
instead of hard-coded strings ensures consistency and makes refactoring
easier.
"""


# ── Role hierarchy (numeric levels for comparison) ──────────────────────
# Used by moderation and admin controllers to check authority.
# Higher number = more authority.
ROLE_HIERARCHY = {
    'normal': 0,
    'facilitator': 1,
    'assistant_moderator': 1,
    'liaison': 1,
    'expert': 1,
    'moderator': 2,
    'admin': 3,
}

# Roles that inherit DOWN the location tree (admin, moderator)
HIERARCHICAL_ROLES = {'admin', 'moderator'}

ALL_ROLES = (
    'admin', 'moderator', 'facilitator',
    'assistant_moderator', 'liaison', 'expert',
)


# ── User ────────────────────────────────────────────────────────────────
class UserStatus:
    ACTIVE = 'active'
    INACTIVE = 'inactive'
    DELETED = 'deleted'
    BANNED = 'banned'

class UserType:
    NORMAL = 'normal'
    GUEST = 'guest'


# ── Position ────────────────────────────────────────────────────────────
class PositionStatus:
    ACTIVE = 'active'
    INACTIVE = 'inactive'
    REMOVED = 'removed'

class UserPositionStatus:
    ACTIVE = 'active'
    INACTIVE = 'inactive'
    DELETED = 'deleted'
    REMOVED = 'removed'

class ResponseType:
    AGREE = 'agree'
    DISAGREE = 'disagree'
    PASS = 'pass'
    CHAT = 'chat'


# ── Chat ────────────────────────────────────────────────────────────────
class ChatRequestResponse:
    PENDING = 'pending'
    ACCEPTED = 'accepted'
    DISMISSED = 'dismissed'
    TIMEOUT = 'timeout'

class ChatLogStatus:
    ACTIVE = 'active'
    DELETED = 'deleted'
    ARCHIVED = 'archived'

class ChatEndType:
    USER_EXIT = 'user_exit'
    AGREED_CLOSURE = 'agreed_closure'
    ABANDONED = 'abandoned'

class DeliveryContext:
    SWIPING = 'swiping'
    IN_APP = 'in_app'
    NOTIFICATION = 'notification'

class KudosStatus:
    SENT = 'sent'
    DISMISSED = 'dismissed'


# ── Moderation ──────────────────────────────────────────────────────────
class ReportStatus:
    PENDING = 'pending'
    DISMISSED = 'dismissed'
    ACTION_TAKEN = 'action_taken'
    DELETED = 'deleted'
    SPURIOUS = 'spurious'

class ModResponse:
    DISMISS = 'dismiss'
    TAKE_ACTION = 'take_action'
    MARK_SPURIOUS = 'mark_spurious'

# Maps mod_action.mod_response → report.status
MOD_RESPONSE_TO_REPORT_STATUS = {
    ModResponse.DISMISS: ReportStatus.DISMISSED,
    ModResponse.TAKE_ACTION: ReportStatus.ACTION_TAKEN,
    ModResponse.MARK_SPURIOUS: ReportStatus.SPURIOUS,
}

class ModActionClass:
    SUBMITTER = 'submitter'
    ACTIVE_ADOPTER = 'active_adopter'
    PASSIVE_ADOPTER = 'passive_adopter'
    REPORTER = 'reporter'
    REPORTED = 'reported'

class ModAction:
    PERMANENT_BAN = 'permanent_ban'
    TEMPORARY_BAN = 'temporary_ban'
    WARNING = 'warning'
    REMOVED = 'removed'

class AppealState:
    PENDING = 'pending'
    APPROVED = 'approved'
    DENIED = 'denied'
    ESCALATED = 'escalated'
    MODIFIED = 'modified'
    OVERRULED = 'overruled'

class AppealStatus:
    ACTIVE = 'active'
    DELETED = 'deleted'
    WITHDRAWN = 'withdrawn'

class ReportTargetType:
    POSITION = 'position'
    CHAT_LOG = 'chat_log'
    POST = 'post'
    COMMENT = 'comment'


# ── Role change requests ───────────────────────────────────────────────
class RoleChangeAction:
    ASSIGN = 'assign'
    REMOVE = 'remove'

class RoleChangeStatus:
    PENDING = 'pending'
    APPROVED = 'approved'
    DENIED = 'denied'
    AUTO_APPROVED = 'auto_approved'
    RESCINDED = 'rescinded'


# ── Admin action log ───────────────────────────────────────────────────
class AdminAction:
    BAN = 'ban'
    UNBAN = 'unban'


# ── Survey ──────────────────────────────────────────────────────────────
class SurveyType:
    STANDARD = 'standard'
    PAIRWISE = 'pairwise'

class SurveyStatus:
    ACTIVE = 'active'
    INACTIVE = 'inactive'
    DELETED = 'deleted'


# ── Posts & Comments ────────────────────────────────────────────────────
class PostType:
    DISCUSSION = 'discussion'
    QUESTION = 'question'
    PROPOSAL = 'proposal'

class PostStatus:
    ACTIVE = 'active'
    DELETED = 'deleted'
    REMOVED = 'removed'
    LOCKED = 'locked'

class CommentStatus:
    ACTIVE = 'active'
    DELETED = 'deleted'
    REMOVED = 'removed'

class VoteType:
    UPVOTE = 'upvote'
    DOWNVOTE = 'downvote'


# ── Polis integration ──────────────────────────────────────────────────
class PolisSyncStatus:
    PENDING = 'pending'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'
    PARTIAL = 'partial'

class PolisOperationType:
    POSITION = 'position'
    VOTE = 'vote'
    CONVERSATION = 'conversation'

class PolisConversationStatus:
    ACTIVE = 'active'
    INACTIVE = 'inactive'
    EXPIRED = 'expired'


# ── Rule ────────────────────────────────────────────────────────────────
class RuleStatus:
    ACTIVE = 'active'
    INACTIVE = 'inactive'


# ── Session stages ────────────────────────────────────────────────────
STAGE_ORDER = [
    'proposal_issue',
    'proposal_qualify',
    'proposal_stakeholders',
    'opinion_discussion',
    'reflection_curation',
    'reflection_proposals',
    'consensus',
]

STAGE_INDEX = {stage: i for i, stage in enumerate(STAGE_ORDER)}

_PROPOSAL_STAGES = {'proposal_issue', 'proposal_qualify', 'proposal_stakeholders'}
_OPINION_STAGES = {'opinion_discussion'}
_REFLECTION_STAGES = {'reflection_curation', 'reflection_proposals'}
_ACTIVE_WRITING_STAGES = _PROPOSAL_STAGES | _OPINION_STAGES | _REFLECTION_STAGES

# Which stages allow creating each content type
WRITE_STAGES = {
    'position':           _ACTIVE_WRITING_STAGES,
    'response':           _ACTIVE_WRITING_STAGES,
    'post':               _ACTIVE_WRITING_STAGES,
    'comment':            _ACTIVE_WRITING_STAGES,
    'post_vote':          _ACTIVE_WRITING_STAGES,
    'comment_vote':       _ACTIVE_WRITING_STAGES,
    'proposal_post':      {'proposal_qualify', 'reflection_proposals'},
    'endorsement':        {'proposal_qualify', 'reflection_proposals'},
    'rcv_vote':           {'proposal_qualify', 'reflection_proposals'},
    'glossary':           set(STAGE_ORDER),
    'wiki':               set(STAGE_ORDER),
    'polis_vote':         _OPINION_STAGES | _REFLECTION_STAGES,
    'curated_comment':    {'reflection_curation', 'reflection_proposals'},
    'consensus_document': {'consensus'},
    'chat':               _ACTIVE_WRITING_STAGES,
}

MAX_ENDORSEMENTS_PER_USER = 3

# Main phases (shown in session bar)
MAIN_PHASES = ['proposal', 'opinion', 'reflection', 'consensus']

# Map sub-stage to main phase
STAGE_TO_PHASE = {
    'proposal_issue': 'proposal',
    'proposal_qualify': 'proposal',
    'proposal_stakeholders': 'proposal',
    'opinion_discussion': 'opinion',
    'reflection_curation': 'reflection',
    'reflection_proposals': 'reflection',
    'consensus': 'consensus',
}

class SessionStatus:
    ACTIVE = 'active'
    ARCHIVED = 'archived'
    CANCELLED = 'cancelled'


# ── Proposal methods ─────────────────────────────────────────────────
VALID_PROPOSAL_METHODS = ('user_driven', 'admin_provided', 'direct_proposal')

# Initial stage for each proposal method
PROPOSAL_METHOD_INITIAL_STAGE = {
    'user_driven': 'proposal_issue',
    'admin_provided': 'proposal_qualify',
    'direct_proposal': 'opinion_discussion',
}
