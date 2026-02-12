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
