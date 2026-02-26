-- Database for Candid Chat app, based on specification in DESIGN.md
CREATE DATABASE govtheppl;


-- Enable UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgvector extension for semantic similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    keycloak_id VARCHAR(255) UNIQUE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    display_name VARCHAR(255),
    avatar_url TEXT,
    avatar_icon_url TEXT,
    trust_score DECIMAL(5,5),
    user_type VARCHAR(50) NOT NULL DEFAULT 'normal' CHECK (user_type IN ('normal', 'guest')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted', 'banned')),
    chat_request_likelihood INTEGER NOT NULL DEFAULT 3 CHECK (chat_request_likelihood BETWEEN 0 AND 5),
    chatting_list_likelihood INTEGER NOT NULL DEFAULT 3 CHECK (chatting_list_likelihood BETWEEN 0 AND 5),
    seen_chatting_list_explanation BOOLEAN DEFAULT false,
    -- Push notification support
    push_token TEXT,
    push_platform VARCHAR(20) CHECK (push_platform IN ('expo', 'web')),
    notifications_enabled BOOLEAN DEFAULT FALSE,
    notification_frequency SMALLINT DEFAULT 3 CHECK (notification_frequency BETWEEN 0 AND 5),
    notifications_sent_today SMALLINT DEFAULT 0,
    notifications_sent_date DATE,
    quiet_hours_start SMALLINT CHECK (quiet_hours_start BETWEEN 0 AND 23),
    quiet_hours_end SMALLINT CHECK (quiet_hours_end BETWEEN 0 AND 23),
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    -- Context-specific response rates
    response_rate_swiping DECIMAL(3,2) DEFAULT 1.00,
    response_rate_in_app DECIMAL(3,2) DEFAULT 1.00,
    response_rate_notification DECIMAL(3,2) DEFAULT 1.00,
    -- Diagnostics consent: NULL = never asked, true = opted in, false = opted out
    diagnostics_consent BOOLEAN DEFAULT NULL,
    -- Role badge visibility: whether to display role badge on posts and comments
    show_role_badge BOOLEAN NOT NULL DEFAULT true,
    -- Denormalized kudos count (maintained by trigger on kudos table)
    kudos_count INTEGER NOT NULL DEFAULT 0
);

COMMENT ON COLUMN users.chat_request_likelihood IS '0=off, 1=rarely, 2=less, 3=normal, 4=more, 5=often';
COMMENT ON COLUMN users.chatting_list_likelihood IS '0=off, 1=rarely, 2=less, 3=normal, 4=more, 5=often';
COMMENT ON COLUMN users.avatar_url IS 'URL of user-selected avatar from pre-defined SFW image set';

-- User activity tracking
CREATE TABLE user_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    activity_start_time TIMESTAMPTZ NOT NULL,
    activity_end_time TIMESTAMPTZ
);

-- Locations
CREATE TABLE location (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_location_id UUID REFERENCES location(id) ON DELETE SET NULL,
    code VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Partial index: fast lookup of non-deleted locations
CREATE INDEX idx_location_not_deleted ON location(id) WHERE deleted_at IS NULL;

-- User locations
CREATE TABLE user_location (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, location_id)
);

-- Sessions (time-bounded deliberation processes, formerly position_category)
CREATE TABLE session (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label VARCHAR(255) NOT NULL,
    description TEXT,
    location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    stage VARCHAR(30) NOT NULL DEFAULT 'proposal_issue'
        CHECK (stage IN ('proposal_issue', 'proposal_qualify', 'proposal_stakeholders',
                         'opinion_discussion', 'opinion_curation',
                         'opinion_proposals', 'reflection', 'consensus')),
    stage_changed_at TIMESTAMPTZ,
    stage_changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    facilitator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived', 'cancelled')),
    proposal_method VARCHAR(20) NOT NULL DEFAULT 'user_driven'
        CHECK (proposal_method IN ('user_driven', 'admin_provided')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Session stage history (audit trail for stage transitions)
CREATE TABLE session_stage_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    from_stage VARCHAR(30),
    to_stage VARCHAR(30) NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User session preferences (formerly user_position_categories)
CREATE TABLE user_session_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE RESTRICT,
    priority INTEGER NOT NULL DEFAULT 0,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, session_id)
);

-- Affiliations
CREATE TABLE affiliation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID REFERENCES location(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL
);

-- User demographics
CREATE TABLE user_demographics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    location_id UUID REFERENCES location(id) ON DELETE SET NULL,
    affiliation_id UUID REFERENCES affiliation(id) ON DELETE SET NULL,
    lean VARCHAR(50) CHECK (lean IN ('very_liberal', 'liberal', 'moderate', 'conservative', 'very_conservative')),
    education VARCHAR(100) CHECK (education IN ('less_than_high_school', 'high_school', 'some_college', 'associates', 'bachelors', 'masters', 'doctorate', 'professional')),
    geo_locale VARCHAR(100) CHECK (geo_locale IN ('urban', 'suburban', 'rural')),
    race VARCHAR(100) CHECK (race IN ('white', 'black', 'hispanic', 'asian', 'native_american', 'pacific_islander', 'multiracial', 'other')),
    sex VARCHAR(50) CHECK (sex IN ('male', 'female', 'other')),
    age_range VARCHAR(20) CHECK (age_range IN ('18-24', '25-34', '35-44', '45-54', '55-64', '65+')),
    income_range VARCHAR(30) CHECK (income_range IN ('under_25k', '25k-50k', '50k-75k', '75k-100k', '100k-150k', '150k-200k', 'over_200k')),
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Position statements
CREATE TABLE position (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE RESTRICT,
    location_id UUID REFERENCES location(id) ON DELETE SET NULL,
    statement TEXT NOT NULL,
    embedding vector(384),
    created_during_stage VARCHAR(30),
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    agree_count INTEGER DEFAULT 0,
    disagree_count INTEGER DEFAULT 0,
    pass_count INTEGER DEFAULT 0,
    chat_count INTEGER DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'removed'))
);

COMMENT ON COLUMN position.embedding IS 'Semantic embedding vector (384 dimensions from all-MiniLM-L6-v2) for similarity search';

-- User positions (adopted positions)
CREATE TABLE user_position (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES position(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted', 'removed')),
    agree_count INTEGER DEFAULT 0,
    disagree_count INTEGER DEFAULT 0,
    pass_count INTEGER DEFAULT 0,
    chat_count INTEGER DEFAULT 0,
    notified_removed BOOLEAN DEFAULT FALSE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, position_id)
);

-- User chatting list (positions users want to continue chatting about)
CREATE TABLE user_chatting_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES position(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    added_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_chat_time TIMESTAMPTZ,
    chat_count INTEGER DEFAULT 0,
    UNIQUE(user_id, position_id)
);

-- User responses to positions
CREATE TABLE response (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position_id UUID NOT NULL REFERENCES position(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response VARCHAR(50) NOT NULL CHECK (response IN ('agree', 'disagree', 'pass', 'chat')),
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(position_id, user_id)
);

-- Chat requests
CREATE TABLE chat_request (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    initiator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_position_id UUID NOT NULL REFERENCES user_position(id) ON DELETE CASCADE,
    response VARCHAR(50) DEFAULT 'pending' CHECK (response IN ('pending', 'accepted', 'dismissed', 'timeout')),
    response_time TIMESTAMPTZ,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    delivery_context VARCHAR(20) DEFAULT 'swiping' CHECK (delivery_context IN ('swiping', 'in_app', 'notification')),
    created_during_stage VARCHAR(30)
);

-- Chat logs
CREATE TABLE chat_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_request_id UUID NOT NULL REFERENCES chat_request(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMPTZ,
    log JSONB,  -- JSON blob: {"messages": [...], "agreedPositions": [...], "agreedClosure": {...} or null, "exportTime": "ISO8601"} — all keys use camelCase
    end_type VARCHAR(50) CHECK (end_type IN ('user_exit', 'agreed_closure', 'abandoned')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'archived'))
);

-- Kudos between users
CREATE TABLE kudos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    receiver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_log_id UUID NOT NULL REFERENCES chat_log(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'dismissed')),
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sender_user_id, receiver_user_id, chat_log_id)
);

-- Surveys
CREATE TABLE survey (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES session(id) ON DELETE SET NULL,
    location_id UUID REFERENCES location(id) ON DELETE SET NULL,
    survey_title VARCHAR(255) NOT NULL,
    survey_type VARCHAR(50) NOT NULL DEFAULT 'standard' CHECK (survey_type IN ('standard', 'pairwise')),
    polis_conversation_id VARCHAR(255),
    comparison_question TEXT,
    is_group_labeling BOOLEAN NOT NULL DEFAULT false,
    phase VARCHAR(20) CHECK (phase IN ('proposal', 'opinion')),
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted'))
);

COMMENT ON COLUMN survey.survey_type IS 'Type of survey: standard (multiple choice) or pairwise (comparison)';
COMMENT ON COLUMN survey.polis_conversation_id IS 'Link to Polis conversation for group-specific aggregation';
COMMENT ON COLUMN survey.comparison_question IS 'Question template for pairwise comparisons (e.g., "Which better describes this group?")';
COMMENT ON COLUMN survey.is_group_labeling IS 'True if this survey is used for group identity labeling (excluded from survey results modal)';
COMMENT ON COLUMN survey.phase IS 'Session phase this label survey applies to (proposal or opinion). NULL means legacy/unscoped.';

-- Survey questions
CREATE TABLE survey_question (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
    survey_question TEXT NOT NULL
);

-- Survey question options
CREATE TABLE survey_question_option (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_question_id UUID NOT NULL REFERENCES survey_question(id) ON DELETE CASCADE,
    survey_question_option TEXT NOT NULL
);

-- Survey responses
CREATE TABLE survey_question_response (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_question_option_id UUID NOT NULL REFERENCES survey_question_option(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(survey_question_option_id, user_id)
);

-- Pairwise comparison items for pairwise surveys
CREATE TABLE pairwise_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
    item_text VARCHAR(255) NOT NULL,
    item_order INTEGER NOT NULL,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE pairwise_item IS 'Items in the comparison pool for pairwise surveys';

-- Pairwise comparison responses
CREATE TABLE pairwise_response (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    winner_item_id UUID NOT NULL REFERENCES pairwise_item(id) ON DELETE CASCADE,
    loser_item_id UUID NOT NULL REFERENCES pairwise_item(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_pairwise_response UNIQUE(survey_id, user_id, winner_item_id, loser_item_id)
);

COMMENT ON TABLE pairwise_response IS 'User responses to pairwise comparisons (which item won)';

-- Moderation rules
CREATE TABLE rule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    severity INTEGER CHECK (severity BETWEEN 1 AND 5),
    default_actions JSONB DEFAULT '[]'::jsonb,
    sentencing_guidelines TEXT,
    location_id UUID REFERENCES location(id) ON DELETE SET NULL,
    session_id UUID REFERENCES session(id) ON DELETE SET NULL,
    applicable_content_types TEXT[] DEFAULT '{position,chat_log,post,comment}',
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Rule change requests (approval workflow for rule create/update/delete)
CREATE TABLE rule_change_request (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    rule_id UUID REFERENCES rule(id) ON DELETE SET NULL,
    proposed_rule JSONB NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_authority_location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    request_reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','denied','auto_approved','rescinded')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    denial_reason TEXT,
    auto_approve_at TIMESTAMPTZ NOT NULL,
    reminder_sent_at TIMESTAMPTZ,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Reports
CREATE TABLE report (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_object_type VARCHAR(50) NOT NULL CHECK (target_object_type IN ('position', 'chat_log', 'post', 'comment')),
    target_object_id UUID NOT NULL,
    submitter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    rule_id UUID REFERENCES rule(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'action_taken', 'deleted', 'spurious')),
    submitter_comment TEXT,
    claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Prevent duplicate active reports: one per user per item (excludes resolved reports)
CREATE UNIQUE INDEX idx_report_one_per_user_item
    ON report (submitter_user_id, target_object_type, target_object_id)
    WHERE status IN ('pending', 'action_taken');

-- Moderation actions
CREATE TABLE mod_action (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES report(id) ON DELETE CASCADE,
    responder_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    mod_response VARCHAR(50) NOT NULL CHECK (mod_response IN ('dismiss', 'take_action', 'mark_spurious')),
    mod_response_text TEXT,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Moderation action classes
CREATE TABLE mod_action_class (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mod_action_id UUID NOT NULL REFERENCES mod_action(id) ON DELETE CASCADE,
    class VARCHAR(50) NOT NULL CHECK (class IN ('submitter', 'active_adopter', 'passive_adopter', 'reporter', 'reported')),
    action_start_time TIMESTAMPTZ,
    action_end_time TIMESTAMPTZ,
    action VARCHAR(50) NOT NULL CHECK (action IN ('permanent_ban', 'temporary_ban', 'warning', 'removed'))
);

-- Moderation action targets
CREATE TABLE mod_action_target (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mod_action_class_id UUID NOT NULL REFERENCES mod_action_class(id) ON DELETE CASCADE
);

-- Moderation action appeals
CREATE TABLE mod_action_appeal (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mod_action_id UUID NOT NULL REFERENCES mod_action(id) ON DELETE CASCADE,
    modified_mod_action_id UUID REFERENCES mod_action(id) ON DELETE SET NULL,
    appeal_text TEXT NOT NULL,
    appeal_state VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (appeal_state IN ('pending', 'approved', 'denied', 'escalated', 'modified', 'overruled')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'withdrawn')),
    claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Moderation action appeal responses
CREATE TABLE mod_action_appeal_response (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mod_action_appeal_id UUID NOT NULL REFERENCES mod_action_appeal(id) ON DELETE CASCADE,
    responder_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    appeal_response_text TEXT NOT NULL,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Admin response notifications for moderators
CREATE TABLE mod_appeal_response_notification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mod_action_appeal_id UUID NOT NULL REFERENCES mod_action_appeal(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dismissed BOOLEAN DEFAULT FALSE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mod_action_appeal_id, user_id)
);

-- Polis integration: Map session+location to Polis conversations (time-windowed)
CREATE TABLE polis_conversation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES location(id),
    session_id UUID REFERENCES session(id),
    polis_conversation_id VARCHAR(255) NOT NULL UNIQUE,
    conversation_type VARCHAR(50) NOT NULL CHECK (conversation_type IN ('session', 'location_all')),
    phase VARCHAR(20) CHECK (phase IN ('proposal', 'opinion')),
    active_from DATE NOT NULL,
    active_until DATE NOT NULL,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
    UNIQUE(location_id, session_id, phase, active_from)
);

-- PostgreSQL UNIQUE constraints treat NULLs as distinct, so the above constraint
-- doesn't prevent duplicate location_all conversations (where session_id IS NULL).
-- This partial index ensures at most one location_all per location per window.
CREATE UNIQUE INDEX uq_polis_conversation_location_all
    ON polis_conversation (location_id, active_from)
    WHERE session_id IS NULL;

COMMENT ON TABLE polis_conversation IS 'Maps Candid location+session combinations to time-windowed Polis conversations';

-- Polis integration: Map positions to Polis comments
CREATE TABLE polis_comment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position_id UUID NOT NULL REFERENCES position(id) ON DELETE CASCADE,
    polis_conversation_id VARCHAR(255) NOT NULL,
    polis_comment_tid INTEGER NOT NULL,
    sync_status VARCHAR(50) NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error')),
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(position_id, polis_conversation_id)
);

COMMENT ON TABLE polis_comment IS 'Maps Candid positions to Polis comments (one position can exist in multiple conversations)';

-- Polis integration: Map users to Polis participants
CREATE TABLE polis_participant (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    polis_conversation_id VARCHAR(255) NOT NULL,
    polis_xid VARCHAR(255) NOT NULL,
    polis_pid INTEGER,
    polis_jwt_token TEXT,
    token_issued_at TIMESTAMPTZ,
    token_expires_at TIMESTAMPTZ,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, polis_conversation_id)
);

COMMENT ON TABLE polis_participant IS 'Maps Candid users to Polis participants using XID system';

-- Polis integration: Async sync queue
CREATE TABLE polis_sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN ('position', 'vote', 'conversation')),
    payload JSONB NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
    error_message TEXT,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE polis_sync_queue IS 'Async queue for syncing positions and votes to Polis';

-- Bug reports and diagnostics
CREATE TABLE bug_report (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT,
    error_metrics JSONB,
    client_context JSONB,
    source VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'auto', 'crash')),
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User roles (location-scoped, hierarchical)
-- Admin + Moderator: location-scoped, inherit DOWN the location tree
-- Facilitator + below: location + session scoped, NO location inheritance
CREATE TABLE user_role (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN (
        'admin','moderator','facilitator','assistant_moderator','liaison','expert'
    )),
    location_id UUID REFERENCES location(id) ON DELETE CASCADE,
    session_id UUID REFERENCES session(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_role_scope CHECK (
        CASE
            -- Hierarchical roles: location required, no session
            WHEN role IN ('admin','moderator') THEN
                location_id IS NOT NULL AND session_id IS NULL
            -- Session-scoped roles: location required, session optional
            WHEN role IN ('facilitator','assistant_moderator','expert','liaison') THEN
                location_id IS NOT NULL
        END
    )
);

-- Unique indexes handling NULLs for session
CREATE UNIQUE INDEX idx_ur_with_session ON user_role(user_id, role, location_id, session_id)
    WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX idx_ur_no_session ON user_role(user_id, role, location_id)
    WHERE session_id IS NULL;

-- Location-session assignments (which sessions are available at which locations)
CREATE TABLE location_session (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(location_id, session_id)
);

-- Role change requests (approval workflow for role assignments and removals)
CREATE TABLE role_change_request (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(20) NOT NULL CHECK (action IN ('assign','remove')),
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN (
        'admin','moderator','facilitator','assistant_moderator','liaison','expert'
    )),
    location_id UUID REFERENCES location(id) ON DELETE CASCADE,
    session_id UUID REFERENCES session(id) ON DELETE CASCADE,
    user_role_id UUID REFERENCES user_role(id) ON DELETE CASCADE,  -- for removals
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_authority_location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    request_reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','denied','auto_approved','rescinded')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    denial_reason TEXT,
    auto_approve_at TIMESTAMPTZ NOT NULL,
    reminder_sent_at TIMESTAMPTZ,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Admin action log (ban/unban audit trail)
CREATE TABLE admin_action_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(50) NOT NULL CHECK (action IN ('ban', 'unban')),
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    performed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admin_action_log_target ON admin_action_log(target_user_id);
CREATE INDEX idx_admin_action_log_created ON admin_action_log(created_time DESC);

-- Notification queue (for quiet-hours delayed delivery)
CREATE TABLE notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Per-type notification preferences (absent row = enabled)
CREATE TABLE notification_type_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN (
        'comment_reply', 'post_comment', 'chat_request', 'role_change', 'rule_change', 'admin_action', 'moderation', 'bridging_kudos', 'wiki_suggestion', 'mention', 'stage_advance'
    )),
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, notification_type)
);
CREATE INDEX idx_notif_type_pref_user ON notification_type_preferences(user_id);

-- Per-content notification muting (owner can mute their own posts/comments)
CREATE TABLE notification_mute (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('post', 'comment')),
    target_id UUID NOT NULL,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, target_type, target_id)
);
CREATE INDEX idx_notif_mute_user ON notification_mute(user_id, target_type, target_id);

-- Persistent notification inbox
CREATE TABLE notification_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN (
        'comment_reply', 'post_comment', 'chat_request', 'role_change', 'rule_change', 'admin_action', 'moderation', 'bridging_kudos', 'wiki_suggestion', 'mention', 'stage_advance'
    )),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notif_inbox_user_unread
    ON notification_inbox(user_id, created_time DESC) WHERE is_read = false;
CREATE INDEX idx_notif_inbox_user_time
    ON notification_inbox(user_id, created_time DESC);

-- ========== Posts ==========

CREATE TABLE post (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    session_id UUID REFERENCES session(id) ON DELETE SET NULL,
    post_type VARCHAR(20) NOT NULL DEFAULT 'discussion'
        CHECK (post_type IN ('discussion', 'question', 'proposal')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_during_stage VARCHAR(30),
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deleted', 'removed', 'locked')),
    deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    upvote_count INTEGER NOT NULL DEFAULT 0,
    downvote_count INTEGER NOT NULL DEFAULT 0,
    weighted_upvotes DOUBLE PRECISION NOT NULL DEFAULT 0,
    weighted_downvotes DOUBLE PRECISION NOT NULL DEFAULT 0,
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    mf_intercept DOUBLE PRECISION,
    comment_count INTEGER NOT NULL DEFAULT 0,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    show_creator_role BOOLEAN NOT NULL DEFAULT false,
    pinned_comment_id UUID,
    glossary_highlight BOOLEAN NOT NULL DEFAULT true,
    proposal_status VARCHAR(20)
        CHECK (proposal_status IN ('draft', 'finalized')),
    proposal_metadata JSONB
);

CREATE INDEX idx_post_location ON post(location_id);
CREATE INDEX idx_post_session ON post(location_id, session_id);
CREATE INDEX idx_post_creator ON post(creator_user_id);
CREATE INDEX idx_post_score ON post(location_id, score DESC);
CREATE INDEX idx_post_created ON post(location_id, created_time DESC);
CREATE INDEX idx_post_proposal_status ON post(session_id, proposal_status)
    WHERE proposal_status IS NOT NULL;

-- ========== Comments ==========

CREATE TABLE comment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES comment(id) ON DELETE RESTRICT,
    creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    path TEXT NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deleted', 'removed')),
    deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    upvote_count INTEGER NOT NULL DEFAULT 0,
    downvote_count INTEGER NOT NULL DEFAULT 0,
    weighted_upvotes DOUBLE PRECISION NOT NULL DEFAULT 0,
    weighted_downvotes DOUBLE PRECISION NOT NULL DEFAULT 0,
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    child_count INTEGER NOT NULL DEFAULT 0,
    mf_intercept DOUBLE PRECISION,
    created_during_stage VARCHAR(30),
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    show_creator_role BOOLEAN NOT NULL DEFAULT false,
    glossary_highlight BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_comment_post ON comment(post_id);
CREATE INDEX idx_comment_parent ON comment(parent_comment_id);
CREATE INDEX idx_comment_creator ON comment(creator_user_id);
CREATE INDEX idx_comment_path ON comment(post_id, path text_pattern_ops);
CREATE INDEX idx_comment_post_score ON comment(post_id, score DESC);

-- Add FK for pinned_comment_id now that comment table exists
ALTER TABLE post ADD CONSTRAINT fk_post_pinned_comment
    FOREIGN KEY (pinned_comment_id) REFERENCES comment(id) ON DELETE SET NULL;

-- ========== Votes (for both posts and comments) ==========

CREATE TABLE post_vote (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
    weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    downvote_reason VARCHAR(50)
        CHECK (downvote_reason IS NULL OR downvote_reason IN (
            'offtopic', 'unkind', 'low_effort', 'spam', 'misinformation'
        )),
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id)
);

CREATE TABLE comment_vote (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comment(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
    weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    downvote_reason VARCHAR(50)
        CHECK (downvote_reason IS NULL OR downvote_reason IN (
            'offtopic', 'unkind', 'low_effort', 'spam', 'misinformation'
        )),
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id)
);

-- ========== Ideological Coordinates ==========

CREATE TABLE user_ideological_coords (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    polis_conversation_id VARCHAR(255) NOT NULL,
    location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    session_id UUID REFERENCES session(id) ON DELETE SET NULL,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    polis_group_id INTEGER,
    n_position_votes INTEGER NOT NULL,
    math_tick BIGINT,
    mf_x DOUBLE PRECISION,
    mf_y DOUBLE PRECISION,
    n_comment_votes INTEGER NOT NULL DEFAULT 0,
    mf_computed_at TIMESTAMPTZ,
    computed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, polis_conversation_id)
);

CREATE INDEX idx_ideological_coords_conversation
    ON user_ideological_coords(polis_conversation_id);

-- ========== MF Training Log ==========

CREATE TABLE mf_training_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    polis_conversation_id VARCHAR(255) NOT NULL,
    location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    session_id UUID REFERENCES session(id) ON DELETE SET NULL,
    n_users INTEGER NOT NULL,
    n_comments INTEGER NOT NULL,
    n_votes INTEGER NOT NULL,
    final_loss DOUBLE PRECISION,
    epochs_run INTEGER,
    duration_seconds DOUBLE PRECISION,
    error_message TEXT,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mf_training_log_conversation ON mf_training_log(polis_conversation_id);
CREATE INDEX idx_mf_training_log_created ON mf_training_log(created_time DESC);

-- Create indexes for performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_user_type ON users(user_type);
CREATE INDEX idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX idx_position_creator_user_id ON position(creator_user_id);
CREATE INDEX idx_position_session_id ON position(session_id);
CREATE INDEX idx_position_status ON position(status);
CREATE INDEX idx_user_position_user_id ON user_position(user_id);
CREATE INDEX idx_user_position_position_id ON user_position(position_id);
CREATE INDEX idx_user_chatting_list_user_id ON user_chatting_list(user_id);
CREATE INDEX idx_user_chatting_list_active ON user_chatting_list(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_response_position_id ON response(position_id);
CREATE INDEX idx_response_user_id ON response(user_id);
CREATE INDEX idx_chat_request_initiator_user_id ON chat_request(initiator_user_id);
CREATE INDEX idx_chat_log_chat_request_id ON chat_log(chat_request_id);
CREATE INDEX idx_chat_log_status ON chat_log(status);
CREATE INDEX idx_survey_status ON survey(status);
CREATE INDEX idx_survey_polis_conversation ON survey(polis_conversation_id) WHERE polis_conversation_id IS NOT NULL;
CREATE INDEX idx_survey_location ON survey(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX idx_pairwise_item_survey ON pairwise_item(survey_id);
CREATE INDEX idx_pairwise_response_survey ON pairwise_response(survey_id);
CREATE INDEX idx_pairwise_response_user ON pairwise_response(user_id);
CREATE INDEX idx_pairwise_response_winner ON pairwise_response(winner_item_id);
CREATE INDEX idx_mod_action_appeal_status ON mod_action_appeal(status);
CREATE INDEX idx_report_target_object_type_id ON report(target_object_type, target_object_id);
CREATE INDEX idx_report_submitter_user_id ON report(submitter_user_id);
CREATE INDEX idx_report_status ON report(status);
CREATE INDEX idx_report_claimed_by ON report(claimed_by_user_id) WHERE claimed_by_user_id IS NOT NULL;
CREATE INDEX idx_mod_action_report_id ON mod_action(report_id);
CREATE INDEX idx_mod_action_responder_user_id ON mod_action(responder_user_id);
CREATE INDEX idx_mod_action_target_user_id ON mod_action_target(user_id);
CREATE INDEX idx_appeal_claimed_by ON mod_action_appeal(claimed_by_user_id) WHERE claimed_by_user_id IS NOT NULL;
CREATE INDEX idx_mod_action_appeal_modified_action ON mod_action_appeal(modified_mod_action_id) WHERE modified_mod_action_id IS NOT NULL;
CREATE INDEX idx_polis_conversation_active ON polis_conversation(location_id, session_id, active_from, active_until) WHERE status = 'active';
CREATE INDEX idx_polis_conversation_lookup ON polis_conversation(polis_conversation_id);
CREATE INDEX idx_polis_comment_position ON polis_comment(position_id);
CREATE INDEX idx_polis_comment_conversation ON polis_comment(polis_conversation_id);
CREATE INDEX idx_polis_participant_user ON polis_participant(user_id);
CREATE INDEX idx_polis_participant_conversation ON polis_participant(polis_conversation_id);
CREATE INDEX idx_polis_participant_xid ON polis_participant(polis_xid);
CREATE INDEX idx_polis_participant_token_expiry ON polis_participant(token_expires_at) WHERE polis_jwt_token IS NOT NULL;
CREATE INDEX idx_polis_sync_queue_status ON polis_sync_queue(status, next_retry_time) WHERE status IN ('pending', 'partial');
CREATE INDEX idx_polis_sync_queue_created ON polis_sync_queue(created_time);
CREATE INDEX idx_bug_report_user_id ON bug_report(user_id);
CREATE INDEX idx_bug_report_created_time ON bug_report(created_time DESC);
CREATE INDEX idx_user_role_user_id ON user_role(user_id);
CREATE INDEX idx_user_role_location ON user_role(location_id);
CREATE INDEX idx_user_role_role ON user_role(role);
CREATE INDEX idx_user_role_session ON user_role(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_location_session_location ON location_session(location_id);
CREATE INDEX idx_location_session_session ON location_session(session_id);
CREATE INDEX idx_role_change_request_target ON role_change_request(target_user_id);
CREATE INDEX idx_role_change_request_status ON role_change_request(status) WHERE status = 'pending';
CREATE INDEX idx_role_change_request_requested_by ON role_change_request(requested_by);
CREATE INDEX idx_role_change_request_auto_approve ON role_change_request(auto_approve_at) WHERE status = 'pending';
CREATE INDEX idx_notification_queue_user ON notification_queue(user_id);
CREATE INDEX idx_post_vote_user ON post_vote(user_id);
CREATE INDEX idx_post_vote_post ON post_vote(post_id);
CREATE INDEX idx_comment_vote_user ON comment_vote(user_id);
CREATE INDEX idx_comment_vote_comment ON comment_vote(comment_id);

-- ========== Missing FK indexes (added 2026-02-12) ==========
CREATE INDEX idx_admin_action_log_performed_by ON admin_action_log(performed_by);
CREATE INDEX idx_affiliation_location_id ON affiliation(location_id);
CREATE INDEX idx_chat_request_user_position_id ON chat_request(user_position_id);
CREATE INDEX idx_comment_deleted_by_user_id ON comment(deleted_by_user_id);
CREATE INDEX idx_kudos_chat_log_id ON kudos(chat_log_id);
CREATE INDEX idx_kudos_receiver_user_id ON kudos(receiver_user_id);
CREATE INDEX idx_location_parent_location_id ON location(parent_location_id);
CREATE INDEX idx_mod_action_appeal_mod_action_id ON mod_action_appeal(mod_action_id);
CREATE INDEX idx_mod_action_appeal_user_id ON mod_action_appeal(user_id);
CREATE INDEX idx_mod_action_appeal_response_mod_action_appeal_id ON mod_action_appeal_response(mod_action_appeal_id);
CREATE INDEX idx_mod_action_appeal_response_responder_user_id ON mod_action_appeal_response(responder_user_id);
CREATE INDEX idx_mod_action_class_mod_action_id ON mod_action_class(mod_action_id);
CREATE INDEX idx_mod_action_target_mod_action_class_id ON mod_action_target(mod_action_class_id);
CREATE INDEX idx_mod_appeal_response_notification_user_id ON mod_appeal_response_notification(user_id);
CREATE INDEX idx_pairwise_response_loser_item_id ON pairwise_response(loser_item_id);
CREATE INDEX idx_polis_conversation_session_id ON polis_conversation(session_id);
CREATE INDEX idx_position_location_id ON position(location_id);
CREATE INDEX idx_session_location ON session(location_id);
CREATE INDEX idx_post_session_id_fk ON post(session_id);
CREATE INDEX idx_post_deleted_by_user_id ON post(deleted_by_user_id);
CREATE INDEX idx_report_rule_id ON report(rule_id);
CREATE INDEX idx_role_change_request_location_id ON role_change_request(location_id);
CREATE INDEX idx_role_change_request_session_id ON role_change_request(session_id);
CREATE INDEX idx_role_change_request_authority_location ON role_change_request(requester_authority_location_id);
CREATE INDEX idx_role_change_request_reviewed_by ON role_change_request(reviewed_by);
CREATE INDEX idx_role_change_request_user_role_id ON role_change_request(user_role_id);
CREATE INDEX idx_rule_creator_user_id ON rule(creator_user_id);
CREATE INDEX idx_rule_location_id ON rule(location_id);
CREATE INDEX idx_rule_session_id ON rule(session_id);
CREATE INDEX idx_rule_status ON rule(status);
CREATE INDEX idx_rule_change_request_status ON rule_change_request(status) WHERE status = 'pending';
CREATE INDEX idx_rule_change_request_requested_by ON rule_change_request(requested_by);
CREATE INDEX idx_rule_change_request_rule_id ON rule_change_request(rule_id);
CREATE INDEX idx_rule_change_request_auto_approve ON rule_change_request(auto_approve_at) WHERE status = 'pending';
CREATE INDEX idx_rule_change_request_authority_location ON rule_change_request(requester_authority_location_id);
CREATE INDEX idx_rule_change_request_reviewed_by ON rule_change_request(reviewed_by);
CREATE INDEX idx_survey_creator_user_id ON survey(creator_user_id);
CREATE INDEX idx_survey_session_id ON survey(session_id);
CREATE INDEX idx_survey_question_survey_id ON survey_question(survey_id);
CREATE INDEX idx_survey_question_option_survey_question_id ON survey_question_option(survey_question_id);
CREATE INDEX idx_survey_question_response_user_id ON survey_question_response(user_id);
CREATE INDEX idx_user_chatting_list_position_id ON user_chatting_list(position_id);
CREATE INDEX idx_user_demographics_affiliation_id ON user_demographics(affiliation_id);
CREATE INDEX idx_user_demographics_location_id ON user_demographics(location_id);
CREATE INDEX idx_user_ideological_coords_session_id ON user_ideological_coords(session_id);
CREATE INDEX idx_user_ideological_coords_location_id ON user_ideological_coords(location_id);
CREATE INDEX idx_user_location_location_id ON user_location(location_id);
CREATE INDEX idx_user_session_preferences_session ON user_session_preferences(session_id);
CREATE INDEX idx_user_role_assigned_by ON user_role(assigned_by);

-- ========== Session Voting & Curation ==========

-- Ranked-Choice Voting: voting rounds for proposal selection
CREATE TABLE voting_round (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    round_type VARCHAR(30) NOT NULL
        CHECK (round_type IN ('issue_selection', 'policy_selection')),
    status VARCHAR(20) NOT NULL DEFAULT 'proposals_open'
        CHECK (status IN ('proposals_open', 'finalization_open', 'proposals_closed',
                          'voting_open', 'voting_closed')),
    ballot_size INTEGER NOT NULL DEFAULT 7,
    winner_count INTEGER NOT NULL DEFAULT 1,
    opened_by UUID REFERENCES users(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    results_json JSONB,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, round_type)
);

-- Proposal endorsements (max 3 per user per round, replaces upvote/downvote on proposals)
CREATE TABLE proposal_endorsement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voting_round_id UUID NOT NULL REFERENCES voting_round(id) ON DELETE CASCADE,
    proposal_post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(voting_round_id, proposal_post_id, user_id)
);

-- Individual RCV ballots (one per user per round)
CREATE TABLE rcv_ballot (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voting_round_id UUID NOT NULL REFERENCES voting_round(id) ON DELETE CASCADE,
    voter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(voting_round_id, voter_user_id)
);

-- Rankings within a ballot (rank 1 = most preferred)
CREATE TABLE rcv_ranking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ballot_id UUID NOT NULL REFERENCES rcv_ballot(id) ON DELETE CASCADE,
    proposal_post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    UNIQUE(ballot_id, proposal_post_id),
    UNIQUE(ballot_id, rank)
);

-- Qualified candidates for a voting round ballot (populated when proposals_closed → voting_open)
CREATE TABLE voting_round_candidate (
    voting_round_id UUID NOT NULL REFERENCES voting_round(id) ON DELETE CASCADE,
    proposal_post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    endorsement_count INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (voting_round_id, proposal_post_id)
);

-- Comment curation (Opinion-Curation sub-stage onward)
CREATE TABLE curated_comment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    comment_id UUID NOT NULL REFERENCES comment(id) ON DELETE CASCADE,
    curated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    curation_reason TEXT,
    group_id INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, comment_id)
);

-- Reference drawer clips (session-scoped, per-user)
CREATE TABLE reference_clip (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type VARCHAR(30) NOT NULL
        CHECK (source_type IN ('post', 'comment', 'wiki', 'position', 'stat', 'closure')),
    source_id TEXT NOT NULL,
    source_version_id UUID,
    excerpt TEXT NOT NULL,
    full_content TEXT,
    metadata JSONB,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, user_id, source_type, source_id)
);
CREATE INDEX idx_reference_clip_user_session ON reference_clip(user_id, session_id);

-- Consensus document (Consensus stage)
CREATE TABLE consensus_document (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'superseded')),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, version)
);

-- ========== Bridging Award Tracking ==========

CREATE TABLE bridging_award (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('post', 'comment')),
    item_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dismissed BOOLEAN NOT NULL DEFAULT false,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_type, item_id)
);

CREATE INDEX idx_bridging_award_user ON bridging_award(user_id) WHERE dismissed = false;
CREATE INDEX idx_bridging_award_item ON bridging_award(item_type, item_id);

-- ========== Counter Triggers ==========

-- Trigger: response changes → update position vote counters
CREATE OR REPLACE FUNCTION update_position_response_counts() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE position SET
            agree_count    = agree_count    + (NEW.response = 'agree')::int,
            disagree_count = disagree_count + (NEW.response = 'disagree')::int,
            pass_count     = pass_count     + (NEW.response = 'pass')::int,
            chat_count     = chat_count     + (NEW.response = 'chat')::int
        WHERE id = NEW.position_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' AND OLD.response <> NEW.response THEN
        UPDATE position SET
            agree_count    = agree_count
                + (NEW.response = 'agree')::int    - (OLD.response = 'agree')::int,
            disagree_count = disagree_count
                + (NEW.response = 'disagree')::int - (OLD.response = 'disagree')::int,
            pass_count     = pass_count
                + (NEW.response = 'pass')::int     - (OLD.response = 'pass')::int,
            chat_count     = chat_count
                + (NEW.response = 'chat')::int     - (OLD.response = 'chat')::int
        WHERE id = NEW.position_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE position SET
            agree_count    = agree_count    - (OLD.response = 'agree')::int,
            disagree_count = disagree_count - (OLD.response = 'disagree')::int,
            pass_count     = pass_count     - (OLD.response = 'pass')::int,
            chat_count     = chat_count     - (OLD.response = 'chat')::int
        WHERE id = OLD.position_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_response_position_counts
    AFTER INSERT OR UPDATE OR DELETE ON response
    FOR EACH ROW EXECUTE FUNCTION update_position_response_counts();

-- Trigger: comment insert/delete/status-change → update post.comment_count and parent comment.child_count
-- Only active comments are counted. Soft-deletes (status → deleted/removed) decrement the count.
CREATE OR REPLACE FUNCTION update_comment_counts() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'active' THEN
            UPDATE post SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
        END IF;
        IF NEW.parent_comment_id IS NOT NULL THEN
            UPDATE comment SET child_count = child_count + 1 WHERE id = NEW.parent_comment_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF OLD.status = 'active' AND NEW.status <> 'active' THEN
            UPDATE post SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
        ELSIF OLD.status <> 'active' AND NEW.status = 'active' THEN
            UPDATE post SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status = 'active' THEN
            UPDATE post SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
        END IF;
        IF OLD.parent_comment_id IS NOT NULL THEN
            UPDATE comment SET child_count = GREATEST(child_count - 1, 0) WHERE id = OLD.parent_comment_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_counts
    AFTER INSERT OR UPDATE OF status OR DELETE ON comment
    FOR EACH ROW EXECUTE FUNCTION update_comment_counts();

-- ========== Counter Reconciliation ==========

-- Recalculates all denormalized counters from source tables.
-- Returns one row per counter group with the number of rows corrected.
-- Safe to run periodically (idempotent, only updates drifted rows).
CREATE OR REPLACE FUNCTION reconcile_counters() RETURNS TABLE(
    counter_name TEXT,
    rows_fixed INTEGER
) AS $$
DECLARE
    fixed_count INTEGER;
BEGIN
    -- 1. Position response counters (from response table)
    WITH counts AS (
        SELECT position_id,
            COUNT(*) FILTER (WHERE response = 'agree')    AS agree,
            COUNT(*) FILTER (WHERE response = 'disagree') AS disagree,
            COUNT(*) FILTER (WHERE response = 'pass')     AS pass,
            COUNT(*) FILTER (WHERE response = 'chat')     AS chat
        FROM response GROUP BY position_id
    ), updated AS (
        UPDATE position p SET
            agree_count    = COALESCE(c.agree, 0),
            disagree_count = COALESCE(c.disagree, 0),
            pass_count     = COALESCE(c.pass, 0),
            chat_count     = COALESCE(c.chat, 0)
        FROM counts c
        WHERE p.id = c.position_id
            AND (p.agree_count    IS DISTINCT FROM COALESCE(c.agree, 0)
              OR p.disagree_count IS DISTINCT FROM COALESCE(c.disagree, 0)
              OR p.pass_count     IS DISTINCT FROM COALESCE(c.pass, 0)
              OR p.chat_count     IS DISTINCT FROM COALESCE(c.chat, 0))
        RETURNING 1
    )
    SELECT COUNT(*) INTO fixed_count FROM updated;
    counter_name := 'position.response_counts';
    rows_fixed := fixed_count;
    RETURN NEXT;

    -- 2. Post comment counts (only active comments)
    WITH counts AS (
        SELECT post_id, COUNT(*) AS cnt FROM comment WHERE status = 'active' GROUP BY post_id
    ), updated AS (
        UPDATE post p SET comment_count = COALESCE(c.cnt, 0)
        FROM counts c
        WHERE p.id = c.post_id AND p.comment_count IS DISTINCT FROM c.cnt
        RETURNING 1
    )
    SELECT COUNT(*) INTO fixed_count FROM updated;
    counter_name := 'post.comment_count';
    rows_fixed := fixed_count;
    RETURN NEXT;

    -- 3. Comment child counts (from comment self-join)
    WITH counts AS (
        SELECT parent_comment_id, COUNT(*) AS cnt
        FROM comment WHERE parent_comment_id IS NOT NULL
        GROUP BY parent_comment_id
    ), updated AS (
        UPDATE comment c SET child_count = COALESCE(cc.cnt, 0)
        FROM counts cc
        WHERE c.id = cc.parent_comment_id AND c.child_count IS DISTINCT FROM cc.cnt
        RETURNING 1
    )
    SELECT COUNT(*) INTO fixed_count FROM updated;
    counter_name := 'comment.child_count';
    rows_fixed := fixed_count;
    RETURN NEXT;

    -- 4. Post vote counts (from post_vote table)
    WITH counts AS (
        SELECT post_id,
            COUNT(*) FILTER (WHERE vote_type = 'upvote')   AS up_count,
            COUNT(*) FILTER (WHERE vote_type = 'downvote') AS down_count,
            COALESCE(SUM(weight) FILTER (WHERE vote_type = 'upvote'), 0)   AS weighted_up,
            COALESCE(SUM(weight) FILTER (WHERE vote_type = 'downvote'), 0) AS weighted_down
        FROM post_vote GROUP BY post_id
    ), updated AS (
        UPDATE post p SET
            upvote_count     = COALESCE(v.up_count, 0),
            downvote_count   = COALESCE(v.down_count, 0),
            weighted_upvotes   = COALESCE(v.weighted_up, 0),
            weighted_downvotes = COALESCE(v.weighted_down, 0)
        FROM counts v
        WHERE p.id = v.post_id
            AND (p.upvote_count       IS DISTINCT FROM COALESCE(v.up_count, 0)
              OR p.downvote_count     IS DISTINCT FROM COALESCE(v.down_count, 0)
              OR p.weighted_upvotes   IS DISTINCT FROM COALESCE(v.weighted_up, 0)
              OR p.weighted_downvotes IS DISTINCT FROM COALESCE(v.weighted_down, 0))
        RETURNING 1
    )
    SELECT COUNT(*) INTO fixed_count FROM updated;
    counter_name := 'post.vote_counts';
    rows_fixed := fixed_count;
    RETURN NEXT;

    -- 5. Comment vote counts (from comment_vote table)
    WITH counts AS (
        SELECT comment_id,
            COUNT(*) FILTER (WHERE vote_type = 'upvote')   AS up_count,
            COUNT(*) FILTER (WHERE vote_type = 'downvote') AS down_count,
            COALESCE(SUM(weight) FILTER (WHERE vote_type = 'upvote'), 0)   AS weighted_up,
            COALESCE(SUM(weight) FILTER (WHERE vote_type = 'downvote'), 0) AS weighted_down
        FROM comment_vote GROUP BY comment_id
    ), updated AS (
        UPDATE comment c SET
            upvote_count     = COALESCE(v.up_count, 0),
            downvote_count   = COALESCE(v.down_count, 0),
            weighted_upvotes   = COALESCE(v.weighted_up, 0),
            weighted_downvotes = COALESCE(v.weighted_down, 0)
        FROM counts v
        WHERE c.id = v.comment_id
            AND (c.upvote_count       IS DISTINCT FROM COALESCE(v.up_count, 0)
              OR c.downvote_count     IS DISTINCT FROM COALESCE(v.down_count, 0)
              OR c.weighted_upvotes   IS DISTINCT FROM COALESCE(v.weighted_up, 0)
              OR c.weighted_downvotes IS DISTINCT FROM COALESCE(v.weighted_down, 0))
        RETURNING 1
    )
    SELECT COUNT(*) INTO fixed_count FROM updated;
    counter_name := 'comment.vote_counts';
    rows_fixed := fixed_count;
    RETURN NEXT;

    -- 6. User kudos counts (from kudos table, status = 'sent')
    WITH counts AS (
        SELECT receiver_user_id, COUNT(*) AS cnt
        FROM kudos WHERE status = 'sent'
        GROUP BY receiver_user_id
    ), updated AS (
        UPDATE users u SET kudos_count = COALESCE(c.cnt, 0)
        FROM counts c
        WHERE u.id = c.receiver_user_id AND u.kudos_count IS DISTINCT FROM c.cnt
        RETURNING 1
    )
    SELECT COUNT(*) INTO fixed_count FROM updated;
    counter_name := 'users.kudos_count';
    rows_fixed := fixed_count;
    RETURN NEXT;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Trigger: kudos insert/update/delete → update users.kudos_count
-- Only kudos with status = 'sent' are counted.
CREATE OR REPLACE FUNCTION update_user_kudos_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'sent' THEN
            UPDATE users SET kudos_count = kudos_count + 1 WHERE id = NEW.receiver_user_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle status changes and receiver changes
        IF OLD.status = 'sent' AND (NEW.status <> 'sent' OR OLD.receiver_user_id <> NEW.receiver_user_id) THEN
            UPDATE users SET kudos_count = GREATEST(kudos_count - 1, 0) WHERE id = OLD.receiver_user_id;
        END IF;
        IF NEW.status = 'sent' AND (OLD.status <> 'sent' OR OLD.receiver_user_id <> NEW.receiver_user_id) THEN
            UPDATE users SET kudos_count = kudos_count + 1 WHERE id = NEW.receiver_user_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status = 'sent' THEN
            UPDATE users SET kudos_count = GREATEST(kudos_count - 1, 0) WHERE id = OLD.receiver_user_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_kudos_count
    AFTER INSERT OR UPDATE OR DELETE ON kudos
    FOR EACH ROW EXECUTE FUNCTION update_user_kudos_count();

-- ========== Glossary / Knowledgebase ==========

CREATE TABLE glossary_term (
    id              SERIAL PRIMARY KEY,
    slug            TEXT UNIQUE NOT NULL,
    term            TEXT NOT NULL,
    aliases         TEXT[] DEFAULT '{}',
    summary         TEXT,
    content         TEXT,
    wiki_category   TEXT,
    scope_combine   TEXT NOT NULL DEFAULT 'or' CHECK (scope_combine IN ('and', 'or')),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Many-to-many scope tags: a term can belong to multiple locations and sessions
CREATE TABLE glossary_term_scope (
    term_id       INTEGER NOT NULL REFERENCES glossary_term(id) ON DELETE CASCADE,
    scope_type    TEXT NOT NULL CHECK (scope_type IN ('location', 'session')),
    scope_id      UUID NOT NULL,
    PRIMARY KEY (term_id, scope_type, scope_id)
);
CREATE INDEX idx_glossary_term_scope_type ON glossary_term_scope(scope_type, scope_id);

-- Wiki pages (standalone pages, previously stored only in Wiki.js)
CREATE TABLE wiki_page (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    content         TEXT,
    wiki_category   TEXT,
    scope_combine   TEXT NOT NULL DEFAULT 'or' CHECK (scope_combine IN ('and', 'or')),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Wiki page scope (same pattern as glossary_term_scope)
CREATE TABLE wiki_page_scope (
    page_id     UUID NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
    scope_type  TEXT NOT NULL CHECK (scope_type IN ('location', 'session')),
    scope_id    UUID NOT NULL,
    PRIMARY KEY (page_id, scope_type, scope_id)
);
CREATE INDEX idx_wiki_page_scope_type ON wiki_page_scope(scope_type, scope_id);

-- Wiki page version history (snapshot on every edit)
CREATE TABLE wiki_page_version (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id     UUID NOT NULL REFERENCES wiki_page(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    content     TEXT,
    wiki_category TEXT,
    scopes      JSONB DEFAULT '[]',
    scope_combine TEXT DEFAULT 'or',
    edited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_wiki_page_version_page ON wiki_page_version(page_id, created_at DESC);

-- Glossary term version history (snapshot on every edit)
CREATE TABLE glossary_term_version (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term_id     INTEGER NOT NULL REFERENCES glossary_term(id) ON DELETE CASCADE,
    term        TEXT NOT NULL,
    aliases     TEXT[] DEFAULT '{}',
    summary     TEXT,
    content     TEXT,
    wiki_category TEXT,
    scopes      JSONB DEFAULT '[]',
    scope_combine TEXT DEFAULT 'or',
    edited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_glossary_term_version_term ON glossary_term_version(term_id, created_at DESC);

-- Wiki image storage
CREATE TABLE wiki_image (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename        TEXT NOT NULL,
    content_type    TEXT NOT NULL,
    data            BYTEA NOT NULL,
    uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Wiki suggestions: users propose new terms/pages or edits, reviewed by credentialed users
CREATE TABLE wiki_suggestion (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suggestion_type     TEXT NOT NULL CHECK (suggestion_type IN (
        'new_term', 'edit_term', 'new_page', 'edit_page'
    )),

    -- Reference to existing item (for edits)
    glossary_term_id    INTEGER REFERENCES glossary_term(id) ON DELETE SET NULL,
    wiki_page_path      TEXT,
    wiki_page_id        UUID REFERENCES wiki_page(id) ON DELETE SET NULL,

    -- Proposed content (full snapshot — not a diff)
    proposed_title      TEXT NOT NULL,
    proposed_aliases    TEXT[] DEFAULT '{}',
    proposed_summary    TEXT,
    proposed_content    TEXT,
    proposed_wiki_category TEXT,
    proposed_scopes     JSONB DEFAULT '[]',
    proposed_scope_combine TEXT DEFAULT 'or' CHECK (proposed_scope_combine IN ('and', 'or')),

    -- Original content snapshot (captured at creation for edit types; NULL for new)
    original_title          TEXT,
    original_aliases        TEXT[] DEFAULT '{}',
    original_summary        TEXT,
    original_content        TEXT,
    original_wiki_category  TEXT,
    original_scopes         JSONB DEFAULT '[]',
    original_scope_combine  TEXT DEFAULT 'or',

    -- Snapshot of the original at time of suggestion (for conflict detection)
    original_updated_at TIMESTAMPTZ,

    -- Submitter
    suggested_by        UUID NOT NULL REFERENCES users(id),
    suggestion_reason   TEXT,

    -- Review
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'denied', 'withdrawn', 'superseded')),
    reviewed_by         UUID REFERENCES users(id),
    review_note         TEXT,
    reviewed_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_wiki_suggestion_status ON wiki_suggestion(status);
CREATE INDEX idx_wiki_suggestion_by ON wiki_suggestion(suggested_by);
CREATE INDEX idx_wiki_suggestion_term ON wiki_suggestion(glossary_term_id) WHERE glossary_term_id IS NOT NULL;
CREATE INDEX idx_wiki_suggestion_page ON wiki_suggestion(wiki_page_path) WHERE wiki_page_path IS NOT NULL;

-- Pinned posts: facilitators/moderators can pin up to 3 posts per session+stage
CREATE TABLE pinned_post (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id         UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    stage           VARCHAR(30) NOT NULL CHECK (stage IN (
        'proposal_issue','proposal_qualify','proposal_stakeholders',
        'opinion_discussion','opinion_curation','opinion_proposals',
        'reflection','consensus')),
    pinned_by       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, stage, post_id)
);
CREATE INDEX idx_pinned_post_session_stage ON pinned_post(session_id, stage);
