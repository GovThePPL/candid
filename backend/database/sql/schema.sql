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
    show_role_badge BOOLEAN NOT NULL DEFAULT true
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

-- Position categories
CREATE TABLE position_category (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label VARCHAR(255) NOT NULL,
    parent_position_category_id UUID REFERENCES position_category(id) ON DELETE SET NULL
);

-- User position category preferences
CREATE TABLE user_position_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position_category_id UUID NOT NULL REFERENCES position_category(id) ON DELETE RESTRICT,
    priority INTEGER NOT NULL DEFAULT 0,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, position_category_id)
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
    category_id UUID NOT NULL REFERENCES position_category(id) ON DELETE RESTRICT,
    location_id UUID REFERENCES location(id) ON DELETE SET NULL,
    statement TEXT NOT NULL,
    embedding vector(384),
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
    delivery_context VARCHAR(20) DEFAULT 'swiping' CHECK (delivery_context IN ('swiping', 'in_app', 'notification'))
);

-- Chat logs
CREATE TABLE chat_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_request_id UUID NOT NULL REFERENCES chat_request(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMPTZ,
    log JSONB,  -- JSON blob: {"messages": [...], "agreedPositions": [...], "agreedClosure": {...} or null, "exportTime": "ISO8601"} — all keys use camelCase
    end_type VARCHAR(50) CHECK (end_type IN ('user_exit', 'agreed_closure')),
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
    position_category_id UUID REFERENCES position_category(id) ON DELETE SET NULL,
    location_id UUID REFERENCES location(id) ON DELETE SET NULL,
    survey_title VARCHAR(255) NOT NULL,
    survey_type VARCHAR(50) NOT NULL DEFAULT 'standard' CHECK (survey_type IN ('standard', 'pairwise')),
    polis_conversation_id VARCHAR(255),
    comparison_question TEXT,
    is_group_labeling BOOLEAN NOT NULL DEFAULT false,
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

-- Polis integration: Map category+location to Polis conversations (time-windowed)
CREATE TABLE polis_conversation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES location(id),
    category_id UUID REFERENCES position_category(id),
    polis_conversation_id VARCHAR(255) NOT NULL UNIQUE,
    conversation_type VARCHAR(50) NOT NULL CHECK (conversation_type IN ('category', 'location_all')),
    active_from DATE NOT NULL,
    active_until DATE NOT NULL,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
    UNIQUE(location_id, category_id, active_from)
);

-- PostgreSQL UNIQUE constraints treat NULLs as distinct, so the above constraint
-- doesn't prevent duplicate location_all conversations (where category_id IS NULL).
-- This partial index ensures at most one location_all per location per window.
CREATE UNIQUE INDEX uq_polis_conversation_location_all
    ON polis_conversation (location_id, active_from)
    WHERE category_id IS NULL;

COMMENT ON TABLE polis_conversation IS 'Maps Candid location+category combinations to time-windowed Polis conversations';

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
-- Facilitator + below: location + category scoped, NO location inheritance
CREATE TABLE user_role (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN (
        'admin','moderator','facilitator','assistant_moderator','liaison','expert'
    )),
    location_id UUID REFERENCES location(id) ON DELETE CASCADE,
    position_category_id UUID REFERENCES position_category(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_role_scope CHECK (
        CASE
            -- Hierarchical roles: location required, no category
            WHEN role IN ('admin','moderator') THEN
                location_id IS NOT NULL AND position_category_id IS NULL
            -- Category-scoped roles: location required, category optional
            WHEN role IN ('facilitator','assistant_moderator','expert','liaison') THEN
                location_id IS NOT NULL
        END
    )
);

-- Unique indexes handling NULLs for category
CREATE UNIQUE INDEX idx_ur_with_cat ON user_role(user_id, role, location_id, position_category_id)
    WHERE position_category_id IS NOT NULL;
CREATE UNIQUE INDEX idx_ur_no_cat ON user_role(user_id, role, location_id)
    WHERE position_category_id IS NULL;

-- Location-category assignments (which categories are available at which locations)
CREATE TABLE location_category (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    position_category_id UUID NOT NULL REFERENCES position_category(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(location_id, position_category_id)
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
    position_category_id UUID REFERENCES position_category(id) ON DELETE CASCADE,
    user_role_id UUID REFERENCES user_role(id) ON DELETE CASCADE,  -- for removals
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_authority_location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    request_reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','denied','auto_approved','rescinded')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    denial_reason TEXT,
    auto_approve_at TIMESTAMPTZ NOT NULL,
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

-- ========== Posts ==========

CREATE TABLE post (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    category_id UUID REFERENCES position_category(id) ON DELETE SET NULL,
    post_type VARCHAR(20) NOT NULL DEFAULT 'discussion'
        CHECK (post_type IN ('discussion', 'question')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deleted', 'removed', 'locked')),
    deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    upvote_count INTEGER NOT NULL DEFAULT 0,
    downvote_count INTEGER NOT NULL DEFAULT 0,
    weighted_upvotes DOUBLE PRECISION NOT NULL DEFAULT 0,
    weighted_downvotes DOUBLE PRECISION NOT NULL DEFAULT 0,
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_post_location ON post(location_id);
CREATE INDEX idx_post_category ON post(location_id, category_id);
CREATE INDEX idx_post_creator ON post(creator_user_id);
CREATE INDEX idx_post_score ON post(location_id, score DESC);
CREATE INDEX idx_post_created ON post(location_id, created_time DESC);

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
    created_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comment_post ON comment(post_id);
CREATE INDEX idx_comment_parent ON comment(parent_comment_id);
CREATE INDEX idx_comment_creator ON comment(creator_user_id);
CREATE INDEX idx_comment_path ON comment(post_id, path text_pattern_ops);
CREATE INDEX idx_comment_post_score ON comment(post_id, score DESC);

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
    category_id UUID REFERENCES position_category(id) ON DELETE SET NULL,
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
    category_id UUID REFERENCES position_category(id) ON DELETE SET NULL,
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
CREATE INDEX idx_position_category_id ON position(category_id);
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
CREATE INDEX idx_polis_conversation_active ON polis_conversation(location_id, category_id, active_from, active_until) WHERE status = 'active';
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
CREATE INDEX idx_user_role_category ON user_role(position_category_id) WHERE position_category_id IS NOT NULL;
CREATE INDEX idx_location_category_location ON location_category(location_id);
CREATE INDEX idx_location_category_category ON location_category(position_category_id);
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
CREATE INDEX idx_polis_conversation_category_id ON polis_conversation(category_id);
CREATE INDEX idx_position_location_id ON position(location_id);
CREATE INDEX idx_position_category_parent ON position_category(parent_position_category_id);
CREATE INDEX idx_post_category_id_fk ON post(category_id);
CREATE INDEX idx_post_deleted_by_user_id ON post(deleted_by_user_id);
CREATE INDEX idx_report_rule_id ON report(rule_id);
CREATE INDEX idx_role_change_request_location_id ON role_change_request(location_id);
CREATE INDEX idx_role_change_request_position_category_id ON role_change_request(position_category_id);
CREATE INDEX idx_role_change_request_authority_location ON role_change_request(requester_authority_location_id);
CREATE INDEX idx_role_change_request_reviewed_by ON role_change_request(reviewed_by);
CREATE INDEX idx_role_change_request_user_role_id ON role_change_request(user_role_id);
CREATE INDEX idx_rule_creator_user_id ON rule(creator_user_id);
CREATE INDEX idx_survey_creator_user_id ON survey(creator_user_id);
CREATE INDEX idx_survey_position_category_id ON survey(position_category_id);
CREATE INDEX idx_survey_question_survey_id ON survey_question(survey_id);
CREATE INDEX idx_survey_question_option_survey_question_id ON survey_question_option(survey_question_id);
CREATE INDEX idx_survey_question_response_user_id ON survey_question_response(user_id);
CREATE INDEX idx_user_chatting_list_position_id ON user_chatting_list(position_id);
CREATE INDEX idx_user_demographics_affiliation_id ON user_demographics(affiliation_id);
CREATE INDEX idx_user_demographics_location_id ON user_demographics(location_id);
CREATE INDEX idx_user_ideological_coords_category_id ON user_ideological_coords(category_id);
CREATE INDEX idx_user_ideological_coords_location_id ON user_ideological_coords(location_id);
CREATE INDEX idx_user_location_location_id ON user_location(location_id);
CREATE INDEX idx_user_position_categories_category ON user_position_categories(position_category_id);
CREATE INDEX idx_user_role_assigned_by ON user_role(assigned_by);

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

    RETURN;
END;
$$ LANGUAGE plpgsql;
