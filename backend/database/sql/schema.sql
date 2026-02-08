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
    password_hash VARCHAR(255),
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    display_name VARCHAR(255),
    avatar_url TEXT,
    avatar_icon_url TEXT,
    trust_score DECIMAL(5,5),
    user_type VARCHAR(50) NOT NULL DEFAULT 'normal' CHECK (user_type IN ('normal', 'moderator', 'admin', 'guest')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted', 'banned')),
    chat_request_likelihood INTEGER NOT NULL DEFAULT 3 CHECK (chat_request_likelihood BETWEEN 1 AND 5),
    chatting_list_likelihood INTEGER NOT NULL DEFAULT 3 CHECK (chatting_list_likelihood BETWEEN 1 AND 5),
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
    response_rate_notification DECIMAL(3,2) DEFAULT 1.00
);

COMMENT ON COLUMN users.chat_request_likelihood IS '1=rarely, 2=less, 3=normal, 4=more, 5=often';
COMMENT ON COLUMN users.chatting_list_likelihood IS '1=rarely, 2=less, 3=normal, 4=more, 5=often';
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, position_category_id)
);

-- Locations
CREATE TABLE location (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_location_id UUID REFERENCES location(id) ON DELETE SET NULL,
    code VARCHAR(50),
    name VARCHAR(255) NOT NULL
);

-- User locations
CREATE TABLE user_location (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(position_id, user_id)
);

-- Chat requests
CREATE TABLE chat_request (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    initiator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_position_id UUID NOT NULL REFERENCES user_position(id) ON DELETE CASCADE,
    response VARCHAR(50) DEFAULT 'pending' CHECK (response IN ('pending', 'accepted', 'dismissed', 'timeout')),
    response_time TIMESTAMPTZ,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted'))
);

COMMENT ON COLUMN survey.survey_type IS 'Type of survey: standard (multiple choice) or pairwise (comparison)';
COMMENT ON COLUMN survey.polis_conversation_id IS 'Link to Polis conversation for group-specific aggregation';
COMMENT ON COLUMN survey.comparison_question IS 'Question template for pairwise comparisons (e.g., "Which better describes this group?")';

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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(survey_question_option_id, user_id)
);

-- Pairwise comparison items for pairwise surveys
CREATE TABLE pairwise_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
    item_text VARCHAR(255) NOT NULL,
    item_order INTEGER NOT NULL,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE pairwise_item IS 'Items in the comparison pool for pairwise surveys';

-- Pairwise comparison responses
CREATE TABLE pairwise_response (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    winner_item_id UUID NOT NULL REFERENCES pairwise_item(id) ON DELETE CASCADE,
    loser_item_id UUID NOT NULL REFERENCES pairwise_item(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Reports
CREATE TABLE report (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_object_type VARCHAR(50) NOT NULL CHECK (target_object_type IN ('position', 'chat_log')),
    target_object_id UUID NOT NULL,
    submitter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    rule_id UUID REFERENCES rule(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'action_taken', 'deleted', 'spurious')),
    submitter_comment TEXT,
    claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Moderation actions
CREATE TABLE mod_action (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES report(id) ON DELETE CASCADE,
    responder_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    mod_response VARCHAR(50) NOT NULL CHECK (mod_response IN ('dismiss', 'take_action', 'mark_spurious')),
    mod_response_text TEXT,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Moderation action appeal responses
CREATE TABLE mod_action_appeal_response (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mod_action_appeal_id UUID NOT NULL REFERENCES mod_action_appeal(id) ON DELETE CASCADE,
    responder_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    appeal_response_text TEXT NOT NULL,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Admin response notifications for moderators
CREATE TABLE mod_appeal_response_notification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mod_action_appeal_id UUID NOT NULL REFERENCES mod_action_appeal(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dismissed BOOLEAN DEFAULT FALSE,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
    UNIQUE(location_id, category_id, active_from)
);

COMMENT ON TABLE polis_conversation IS 'Maps Candid location+category combinations to time-windowed Polis conversations';

-- Polis integration: Map positions to Polis comments
CREATE TABLE polis_comment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position_id UUID NOT NULL REFERENCES position(id) ON DELETE CASCADE,
    polis_conversation_id VARCHAR(255) NOT NULL,
    polis_comment_tid INTEGER NOT NULL,
    sync_status VARCHAR(50) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error')),
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
    error_message TEXT,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE polis_sync_queue IS 'Async queue for syncing positions and votes to Polis';

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
