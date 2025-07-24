-- Database for Candid Chat app, based on specification in DESIGN.md
CREATE DATABASE govtheppl; 


-- Enable UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    display_name VARCHAR(255),
    user_type VARCHAR(50) NOT NULL DEFAULT 'normal' CHECK (user_type IN ('normal', 'moderator', 'admin', 'guest')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted', 'banned'))
);

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
    race VARCHAR(100),
    sex VARCHAR(50) CHECK (sex IN ('male', 'female', 'other')),
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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    agree_count INTEGER DEFAULT 0,
    disagree_count INTEGER DEFAULT 0,
    pass_count INTEGER DEFAULT 0,
    chat_count INTEGER DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'removed'))
);

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
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Chat logs
CREATE TABLE chat_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_request_id UUID NOT NULL REFERENCES chat_request(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMPTZ,
    end_type VARCHAR(50) CHECK (end_type IN ('user_exit', 'agreed_closure')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'archived'))
);

-- Kudos between users
CREATE TABLE kudos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    receiver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_log_id UUID NOT NULL REFERENCES chat_log(id) ON DELETE CASCADE,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sender_user_id, receiver_user_id, chat_log_id)
);

-- Surveys
CREATE TABLE survey (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    position_category_id UUID REFERENCES position_category(id) ON DELETE SET NULL,
    survey_title VARCHAR(255) NOT NULL,
    created_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted'))
);

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

-- Moderation rules
CREATE TABLE rule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
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
    class VARCHAR(50) NOT NULL CHECK (class IN ('submitter', 'active_adopter', 'passive_adopter')),
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
    appeal_text TEXT NOT NULL,
    appeal_state VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (appeal_state IN ('pending', 'approved', 'denied')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'withdrawn')),
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
CREATE INDEX idx_response_position_id ON response(position_id);
CREATE INDEX idx_response_user_id ON response(user_id);
CREATE INDEX idx_chat_request_initiator_user_id ON chat_request(initiator_user_id);
CREATE INDEX idx_chat_log_chat_request_id ON chat_log(chat_request_id);
CREATE INDEX idx_chat_log_status ON chat_log(status);
CREATE INDEX idx_survey_status ON survey(status);
CREATE INDEX idx_mod_action_appeal_status ON mod_action_appeal(status);
CREATE INDEX idx_report_target_object_type_id ON report(target_object_type, target_object_id);
CREATE INDEX idx_report_submitter_user_id ON report(submitter_user_id);
CREATE INDEX idx_report_status ON report(status);
CREATE INDEX idx_mod_action_report_id ON mod_action(report_id);
CREATE INDEX idx_mod_action_responder_user_id ON mod_action(responder_user_id);
