/*
Infrastructure seed data — only data that the API cannot create
and that tests depend on by hardcoded UUID.

Tables WITH seed data:

  1 users             - 10 users (1 admin, 2 moderators, 5 normal, 2 guests)
  2 position_category - 10 categories
  3 location          - 4 locations (US > Oregon > Multnomah > Portland)
  4 user_location     - 10 entries linking all users to Oregon/Portland
  5 affiliation       - 7 political party affiliations in Oregon
  6 rule              - 4 moderation rules
  7 survey            - 3 surveys (active, inactive, future)
  8 survey_question   - 2 questions for the active survey
  9 survey_question_option - 6 options for the 2 questions
 10 position          - 5 test-critical positions (referenced by conftest.py constants)
 11 user_position     - 7 test-critical user_positions (referenced by conftest.py constants)
 12 chat_request      - 3 test-critical chat requests (for chat_log test data)
 13 chat_log          - 3 test-critical chat logs (2 active + 1 archived for tests)
 14 kudos             - 1 kudos entry (for card queue tests)

All other data (additional positions, votes, demographics, moderation
actions, chatting list, pairwise data, etc.) is created by the seed
script: backend/scripts/seed_dev_data.py
*/


-- Test data for users
-- (each password is password)
INSERT INTO users (id, username, email, password_hash, created_time, updated_time, display_name, user_type, status, trust_score) VALUES
-- Admin user
('0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'admin1', 'admin1@example.com', '$2b$14$if1z65maFt6mCfp9Vd5MNe1IgSwFQkoni3fSv/kun3mqFIyjcjvBS', '2024-09-22 14:32:15+00', '2025-06-18 09:45:22+00', 'Admin 1', 'admin', 'active', 0.95310),

-- Moderator users
('a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'moderator1', 'moderator1@example.com', '$2b$14$if1z65maFt6mCfp9Vd5MNe1IgSwFQkoni3fSv/kun3mqFIyjcjvBS', '2024-11-08 07:18:43+00', '2025-03-14 16:27:09+00', 'Moderator 1', 'moderator', 'active', 0.92512),
('010f84ad-0abd-4352-a7b3-7f9b95d51983', 'moderator2', 'moderator2@example.com', '$2b$14$if1z65maFt6mCfp9Vd5MNe1IgSwFQkoni3fSv/kun3mqFIyjcjvBS', '2024-12-15 22:41:07+00', '2025-07-29 11:53:34+00', 'Moderator 2', 'moderator', 'active', 0.91562),

-- Normal users
('6c9344ed-0313-4b25-a616-5ac08967e84f', 'normal1', 'normal1@example.com', '$2b$14$if1z65maFt6mCfp9Vd5MNe1IgSwFQkoni3fSv/kun3mqFIyjcjvBS', '2024-10-03 16:25:51+00', '2025-01-22 08:14:17+00', 'Normal 1', 'normal', 'active', 0.15245),
('4a67d0e6-56a4-4396-916b-922d27db71d8', 'normal2', 'normal2@example.com', '$2b$14$if1z65maFt6mCfp9Vd5MNe1IgSwFQkoni3fSv/kun3mqFIyjcjvBS', '2025-01-17 03:47:29+00', '2025-05-08 19:36:42+00', 'Normal 2', 'normal', 'active', 0.25173),
('735565c1-93d9-4813-b227-3d9c06b78c8f', 'normal3', 'normal3@example.com', '$2b$14$if1z65maFt6mCfp9Vd5MNe1IgSwFQkoni3fSv/kun3mqFIyjcjvBS', '2024-08-29 12:09:38+00', '2025-02-11 14:58:06+00', 'Normal 3', 'normal', 'active', 0.74623),
('2333392a-7c07-4733-8b46-00d32833d9bc', 'normal4', 'normal4@example.com', '$2b$14$if1z65maFt6mCfp9Vd5MNe1IgSwFQkoni3fSv/kun3mqFIyjcjvBS', '2025-03-05 20:33:12+00', '2025-08-01 07:21:48+00', 'Normal 4', 'normal', 'active', 0.54274),
('c922be05-e355-4052-8d3f-7774669ddd32', 'normal5', 'normal5@example.com', '$2b$14$if1z65maFt6mCfp9Vd5MNe1IgSwFQkoni3fSv/kun3mqFIyjcjvBS', '2024-09-14 05:56:24+00', '2025-04-27 13:42:55+00', 'Normal 5', 'normal', 'active', 0.35735),

-- Guest users
('a82b485b-114f-44b7-aa0b-8ae8ca96e4f3', 'guest1', NULL, '', '2025-02-28 18:15:03+00', '2025-07-12 10:29:37+00', 'Guest 1', 'guest', 'active', 0),
('a2ec25a9-2a12-4a01-baf8-c0d1e254c3db', 'guest2', NULL, '', '2024-12-07 09:44:16+00', '2025-08-09 15:07:28+00', 'Guest 2', 'guest', 'active', 0);

-- Test data for position_categories
INSERT INTO position_category (id, label, parent_position_category_id) VALUES
('4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'Healthcare', NULL),
('63e233e9-187e-441f-a7a9-f5f44dffadf0', 'Economy & Taxation', NULL),
('be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'Education', NULL),
('66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'Environment & Climate', NULL),
('e2e608f7-169e-409b-9678-6dee57fab9c3', 'Immigration', NULL),
('04edc480-aded-4b93-94c4-d62cbb507dc4', 'Criminal Justice', NULL),
('92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'Foreign Policy & Defense', NULL),
('2d83d6eb-3000-47eb-b136-9d1c44f9b98d', 'Civil Rights & Liberties', NULL),
('26c8146e-d080-419e-b98b-5089c3a81b5b', 'Social Issues', NULL),
('cdc48d27-d636-481b-90b2-d6f6a2e6780e', 'Government & Democracy', NULL);

-- Test data for locations (hierarchical)
INSERT INTO location (id, parent_location_id, code, name) VALUES
('f1a2b3c4-d5e6-7890-abcd-ef1234567890', NULL, 'US', 'United States'),
('ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'f1a2b3c4-d5e6-7890-abcd-ef1234567890', 'OR', 'Oregon'),
('c2b3a4d5-e6f7-8901-bcde-f12345678901', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'MULT', 'Multnomah County'),
('d3c4b5a6-f7e8-9012-cdef-123456789012', 'c2b3a4d5-e6f7-8901-bcde-f12345678901', 'PDX', 'Portland');

-- Test data for user_location entries
INSERT INTO user_location (id, user_id, location_id, created_time) VALUES
('9d77bc28-34ba-46eb-a93e-8c59cb5dfa6a', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'd3c4b5a6-f7e8-9012-cdef-123456789012', '2024-09-24 10:15:30+00'),
('68339e80-a17e-4f11-9bf4-add6aab95b10', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'd3c4b5a6-f7e8-9012-cdef-123456789012', '2024-11-10 14:22:18+00'),
('163714b8-034d-4e92-b464-4772a6c361f9', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'd3c4b5a6-f7e8-9012-cdef-123456789012', '2024-12-17 08:30:45+00'),
('c0917efc-f67e-490f-bf88-234fe38a77a0', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'd3c4b5a6-f7e8-9012-cdef-123456789012', '2024-10-05 12:40:22+00'),
('abc7621a-ed4b-4579-bf8b-7b07cb2cb56e', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2025-01-19 15:25:10+00'),
('ab764391-9a32-4929-9441-93e1afd3226d', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2024-08-31 09:18:55+00'),
('e84069e6-8d69-4317-9bc3-488481cac1ab', '2333392a-7c07-4733-8b46-00d32833d9bc', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2025-03-07 16:45:33+00'),
('3730d95e-960a-4632-ac50-7d230950cc04', 'c922be05-e355-4052-8d3f-7774669ddd32', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2024-09-16 11:30:15+00'),
('4da28b06-580f-4280-81a6-2e54bf82289c', 'a82b485b-114f-44b7-aa0b-8ae8ca96e4f3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2025-03-02 20:22:40+00'),
('c085a592-8889-4bd2-9854-95bad1ca419d', 'a2ec25a9-2a12-4a01-baf8-c0d1e254c3db', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2024-12-09 13:15:28+00');

-- Test data for political party affiliations in Oregon
INSERT INTO affiliation (id, location_id, name) VALUES
('6a76fec7-bf77-4333-937f-07d48c1ae966', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Democratic Party of Oregon'),
('3373d56e-2776-4524-9ef6-2053b85df3c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Oregon Republican Party'),
('9bfb76d1-0857-47bc-9e10-c7df3e25e762', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Libertarian Party of Oregon'),
('c0e94b05-8722-4a67-afe4-0e6b255a2145', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Pacific Green Party of Oregon'),
('13331565-3538-4ff4-a94c-3ca47779220f', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Independent Party of Oregon'),
('6388f9ea-5668-4823-9607-a0a8a746b503', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Working Families Party of Oregon'),
('580e9aa8-08b0-4b58-a297-888bee037327', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Constitution Party of Oregon');

-- Test-critical positions (referenced by conftest.py constants)
INSERT INTO position (id, creator_user_id, category_id, location_id, statement, created_time, updated_time, agree_count, disagree_count, pass_count, chat_count, status) VALUES
-- POSITION1_ID: Healthcare position by admin1
('772d04ed-b2ad-4f95-a630-c739811fa615', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Universal healthcare should be a fundamental right guaranteed by the government.', '2024-10-15 09:30:00+00', '2025-08-10 14:22:33+00', 4, 2, 0, 0, 'active'),
-- POSITION2_ID: Healthcare position by moderator1
('4d0b2198-414e-4cf9-93a9-83033b81ce76', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Private healthcare markets provide better quality care than government-run systems.', '2024-12-01 16:45:12+00', '2025-08-10 14:22:33+00', 1, 4, 0, 0, 'active'),
-- POSITION3_ID: Healthcare position by normal1
('f7aeb957-a41a-4b1e-9482-6297f5f07743', '6c9344ed-0313-4b25-a616-5ac08967e84f', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Prescription drug prices should be regulated by the federal government.', '2024-11-20 11:15:30+00', '2025-08-10 14:22:33+00', 5, 0, 0, 0, 'active'),
-- Minimum wage position by moderator1 (needed for chat_log test: user_position 6b423ed7 -> chat_request a1111111 -> CHAT_LOG_1_ID)
('d61ccb9d-0b69-4eac-baf8-2f786d130535', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The minimum wage should be raised to $15 per hour nationally.', '2025-02-28 12:35:55+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
-- Teachers salary position by normal5 (needed for chat_log test: user_position 927a0293 -> chat_request 2f58e635 -> CHAT_LOG_2_ID)
('27f11a1f-2b0e-4358-8f0f-13c3aee18d70', 'c922be05-e355-4052-8d3f-7774669ddd32', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Teachers should be paid significantly higher salaries.', '2024-12-20 10:25:40+00', '2025-08-10 14:22:33+00', 4, 0, 0, 0, 'active'),
-- Mental health position by normal2 (needed for USER_POSITION_NORMAL2)
('28028e9a-90b5-4b2a-9054-d3d446180df7', '4a67d0e6-56a4-4396-916b-922d27db71d8', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Mental health services should receive equal insurance coverage as physical health.', '2025-02-10 08:22:45+00', '2025-08-10 14:22:33+00', 5, 0, 0, 0, 'active'),
-- Path to citizenship position by normal3 (needed for USER_POSITION_NORMAL3)
('20fabff1-a37a-4941-8bc8-4f082da6a189', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'A path to citizenship should be provided for undocumented immigrants.', '2024-10-30 15:45:20+00', '2025-08-10 14:22:33+00', 2, 0, 0, 0, 'active');

-- Test-critical user_positions (referenced by conftest.py constants)
INSERT INTO user_position (id, user_id, position_id, status, agree_count, disagree_count, pass_count, chat_count, created_time, updated_time) VALUES
-- USER_POSITION_ADMIN1: admin1 adopts POSITION1 (universal healthcare)
('4c0dd7fe-2533-4794-a8e7-a97de971971e', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '772d04ed-b2ad-4f95-a630-c739811fa615', 'active', 0, 0, 0, 0, '2024-10-15 09:30:00+00', '2025-03-20 11:45:22+00'),
-- USER_POSITION_MODERATOR1: moderator1 adopts POSITION2 (private healthcare)
('ec3e0406-b044-4735-9d78-6e305f2fa406', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '4d0b2198-414e-4cf9-93a9-83033b81ce76', 'active', 0, 0, 0, 0, '2024-12-01 16:45:12+00', '2025-02-10 14:30:15+00'),
-- USER_POSITION_NORMAL1: normal1 adopts POSITION3 (drug prices)
('8a63d2d0-9ed6-4b26-8a64-350e0594c6e4', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'f7aeb957-a41a-4b1e-9482-6297f5f07743', 'active', 0, 0, 0, 0, '2024-11-20 11:15:30+00', '2024-12-25 16:20:45+00'),
-- USER_POSITION_NORMAL2: normal2 adopts mental health position
('5e64e6cc-baae-4f14-859b-9577a6eb2d23', '4a67d0e6-56a4-4396-916b-922d27db71d8', '28028e9a-90b5-4b2a-9054-d3d446180df7', 'active', 0, 0, 0, 0, '2025-02-10 08:22:45+00', '2025-04-15 12:30:20+00'),
-- USER_POSITION_NORMAL3: normal3 adopts path-to-citizenship position
('cd411a92-82ac-4075-abc6-f4154db00fb8', '735565c1-93d9-4813-b227-3d9c06b78c8f', '20fabff1-a37a-4941-8bc8-4f082da6a189', 'active', 0, 0, 0, 0, '2024-10-30 15:45:20+00', '2025-01-25 11:30:15+00'),
-- Normal3 adopts minimum wage position (needed for CHAT_LOG_1_ID chain)
('6b423ed7-fa20-4705-aeb0-8fae448967c6', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'd61ccb9d-0b69-4eac-baf8-2f786d130535', 'active', 0, 0, 0, 0, '2025-03-02 14:40:20+00', '2025-02-09 16:55:35+00'),
-- Normal5 adopts teachers salary position (needed for CHAT_LOG_2_ID chain)
('927a0293-5e92-4450-a584-bd42be3386be', 'c922be05-e355-4052-8d3f-7774669ddd32', '27f11a1f-2b0e-4358-8f0f-13c3aee18d70', 'active', 0, 0, 0, 0, '2024-12-20 10:25:40+00', '2025-02-14 16:50:15+00');

-- Test-critical chat requests (needed for chat_log entries)
INSERT INTO chat_request (id, initiator_user_id, user_position_id, response, response_time, created_time, updated_time) VALUES
-- Normal1 -> Normal3's minimum wage position (for CHAT_LOG_1_ID)
('a1111111-1111-1111-1111-111111111111', '6c9344ed-0313-4b25-a616-5ac08967e84f', '6b423ed7-fa20-4705-aeb0-8fae448967c6', 'accepted', '2025-08-01 10:05:00+00', '2025-08-01 10:02:00+00', '2025-08-01 10:02:20+00'),
-- Normal4 -> Normal5's teachers salary position (for CHAT_LOG_2_ID)
('2f58e635-3c09-4bd7-a0d8-f52510ad30fa', '2333392a-7c07-4733-8b46-00d32833d9bc', '927a0293-5e92-4450-a584-bd42be3386be', 'accepted', '2025-07-15 14:05:00+00', '2025-07-15 14:02:00+00', '2025-07-15 14:02:20+00'),
-- Normal2 -> Admin1's position (for archived chat log test)
('3f0107a5-2c0d-44f2-b89d-7728226dda83', '4a67d0e6-56a4-4396-916b-922d27db71d8', '4c0dd7fe-2533-4794-a8e7-a97de971971e', 'accepted', '2025-02-20 10:15:00+00', '2025-02-20 10:12:00+00', '2025-02-20 10:12:30+00');

-- Test-critical chat logs (referenced by conftest.py constants)
INSERT INTO chat_log (id, chat_request_id, start_time, end_time, log, end_type, status) VALUES
-- CHAT_LOG_1_ID: Normal1 <-> Normal3 (user_exit, active) - used by moderation tests
('b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', '2025-08-01 10:02:20+00', '2025-08-01 10:20:00+00',
'{"messages": [
  {"id": "msg1", "senderId": "6c9344ed-0313-4b25-a616-5ac08967e84f", "content": "I wanted to talk about your position on minimum wage.", "timestamp": "2025-08-01T10:02:25Z"},
  {"id": "msg2", "senderId": "735565c1-93d9-4813-b227-3d9c06b78c8f", "content": "Sure, I think it is an important topic.", "timestamp": "2025-08-01T10:05:00Z"},
  {"id": "msg3", "senderId": "6c9344ed-0313-4b25-a616-5ac08967e84f", "content": "I agree on the fundamentals but have different views on implementation.", "timestamp": "2025-08-01T10:10:00Z"},
  {"id": "msg4", "senderId": "735565c1-93d9-4813-b227-3d9c06b78c8f", "content": "That is a fair point. Let me think about that.", "timestamp": "2025-08-01T10:15:00Z"}
], "agreedPositions": [], "agreedClosure": null, "endedByUserId": "6c9344ed-0313-4b25-a616-5ac08967e84f", "exportTime": "2025-08-01T10:20:00Z"}', 'user_exit', 'active'),

-- CHAT_LOG_2_ID: Normal4 <-> Normal5 (agreed_closure, active) - used by kudos/card tests
('1d06bf99-4d87-4700-8806-63de8c905eca', '2f58e635-3c09-4bd7-a0d8-f52510ad30fa', '2025-07-15 14:02:20+00', '2025-07-15 14:25:00+00',
'{"messages": [
  {"id": "msg1", "senderId": "2333392a-7c07-4733-8b46-00d32833d9bc", "content": "I find your perspective on healthcare really interesting.", "timestamp": "2025-07-15T14:02:25Z"},
  {"id": "msg2", "senderId": "c922be05-e355-4052-8d3f-7774669ddd32", "content": "Thanks! It is something I care deeply about.", "timestamp": "2025-07-15T14:05:00Z"},
  {"id": "msg3", "senderId": "2333392a-7c07-4733-8b46-00d32833d9bc", "content": "I think we actually agree on the core principles.", "timestamp": "2025-07-15T14:10:00Z"},
  {"id": "msg4", "senderId": "c922be05-e355-4052-8d3f-7774669ddd32", "content": "Yes! We just differ on the implementation approach.", "timestamp": "2025-07-15T14:15:00Z"},
  {"id": "msg5", "senderId": "2333392a-7c07-4733-8b46-00d32833d9bc", "content": "Maybe we can propose a hybrid solution.", "timestamp": "2025-07-15T14:20:00Z"}
], "agreedPositions": [
  {"id": "prop1", "proposerId": "2333392a-7c07-4733-8b46-00d32833d9bc", "content": "Teachers deserve fair compensation that reflects their impact on society.", "parentId": null, "status": "accepted", "isClosure": false, "timestamp": "2025-07-15T14:18:00Z"},
  {"id": "prop2", "proposerId": "c922be05-e355-4052-8d3f-7774669ddd32", "content": "Salary increases should be tied to measurable outcomes and accountability.", "parentId": null, "status": "accepted", "isClosure": false, "timestamp": "2025-07-15T14:20:00Z"}
], "agreedClosure": {"id": "closure-1d06bf99", "proposerId": "2333392a-7c07-4733-8b46-00d32833d9bc", "content": "Found common ground", "timestamp": "2025-07-15T14:22:00Z"}, "exportTime": "2025-07-15T14:25:00Z"}', 'agreed_closure', 'active'),

-- Archived chat: Normal2 <-> Admin1 (agreed_closure, archived) - used by test_non_participant_can_view_archived
('1e665c62-0dc6-45ff-acde-e32d64e5b2ea', '3f0107a5-2c0d-44f2-b89d-7728226dda83', '2025-02-20 10:12:30+00', '2025-02-20 10:35:00+00',
'{"messages": [
  {"id": "msg1", "senderId": "4a67d0e6-56a4-4396-916b-922d27db71d8", "content": "I appreciate your stance on this issue.", "timestamp": "2025-02-20T10:12:35Z", "type": "text"},
  {"id": "msg2", "senderId": "0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e", "content": "Thank you for reaching out. I think open dialogue is important.", "timestamp": "2025-02-20T10:15:00Z", "type": "text"},
  {"id": "msg3", "senderId": "4a67d0e6-56a4-4396-916b-922d27db71d8", "content": "I had some concerns initially, but you have addressed them well.", "timestamp": "2025-02-20T10:20:00Z", "type": "text"},
  {"id": "msg4", "senderId": "0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e", "content": "I am glad we could have this productive discussion.", "timestamp": "2025-02-20T10:30:00Z", "type": "text"}
], "agreedPositions": [
  {"id": "prop1", "proposerId": "4a67d0e6-56a4-4396-916b-922d27db71d8", "content": "Healthcare should be affordable for everyone.", "parentId": null, "status": "accepted", "isClosure": false, "timestamp": "2025-02-20T10:22:00Z"},
  {"id": "prop3", "proposerId": "4a67d0e6-56a4-4396-916b-922d27db71d8", "content": "A balanced approach combining public and private options is best.", "parentId": null, "status": "accepted", "isClosure": false, "timestamp": "2025-02-20T10:28:00Z"}
], "agreedClosure": {"id": "closure1", "proposerId": "0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e", "content": "Productive discussion", "timestamp": "2025-02-20T10:32:00Z"}, "exportTime": "2025-02-20T10:35:00Z"}', 'agreed_closure', 'archived');

-- Test-critical kudos (Normal4 -> Normal5, used by card queue tests)
INSERT INTO kudos (id, sender_user_id, receiver_user_id, chat_log_id, status, created_time) VALUES
('a4c5d6e7-f8a9-b0c1-d2e3-f4a5b6c7d8e9', '2333392a-7c07-4733-8b46-00d32833d9bc', 'c922be05-e355-4052-8d3f-7774669ddd32', '1d06bf99-4d87-4700-8806-63de8c905eca', 'sent', '2025-07-15 14:30:00+00');

-- Test data for moderation rules
INSERT INTO rule (id, creator_user_id, title, text, status, severity, default_actions, sentencing_guidelines, created_time, updated_time) VALUES
('b8a7c6d5-e4f3-4a2b-1c0d-9e8f7a6b5c4d', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'Violence or Hate Speech', 'This content calls for violence against people based on immutable/quasi-immutable characteristics or strong convictions', 'active', 5, '[{"userClass": "submitter", "action": "temporary_ban", "duration": 7}]'::jsonb, 'Immediate ban for threats or incitement. Temporary ban (7-30 days) for hostile language.', '2024-09-25 10:00:00+00', '2024-09-25 10:00:00+00'),
('c9b8d7e6-f5a4-4b3c-2d1e-0f9a8b7c6d5e', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'Sexual or Obscene Content', 'This content is sexual or obscene', 'active', 4, '[{"userClass": "submitter", "action": "removed"}]'::jsonb, 'Remove content. Warning for first offense, temporary ban (3-7 days) for repeat.', '2024-09-25 10:05:00+00', '2024-09-25 10:05:00+00'),
('d0c9e8f7-a6b5-4c4d-3e2f-1a0b9c8d7e6f', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'Spam or Self-Promotion', 'This content contains spam or self-promotion', 'active', 2, '[{"userClass": "submitter", "action": "warning"}]'::jsonb, 'Remove content. Warning for first offense, temporary ban (1-3 days) for repeat.', '2024-09-25 10:10:00+00', '2024-09-25 10:10:00+00'),
('e1d0f9a8-b7c6-4d5e-4f3a-2b1c0d9e8f7a', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'Not a Normative Political Statement', 'This content does not make a normative political statement', 'active', 1, '[{"userClass": "submitter", "action": "removed"}]'::jsonb, 'Remove content. No user action unless repeated violations.', '2024-09-25 10:15:00+00', '2024-09-25 10:15:00+00');

-- Test data for surveys
INSERT INTO survey (id, creator_user_id, position_category_id, survey_title, start_time, end_time, status) VALUES
('aa111111-1111-1111-1111-111111111111', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'Healthcare Priorities Survey', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '30 days', 'active'),
('bb222222-2222-2222-2222-222222222222', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'Economic Policy Survey', CURRENT_TIMESTAMP - INTERVAL '60 days', CURRENT_TIMESTAMP - INTERVAL '30 days', 'inactive'),
('cc333333-3333-3333-3333-333333333333', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'Education Priorities Survey', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP + INTERVAL '37 days', 'active');

-- Survey questions
INSERT INTO survey_question (id, survey_id, survey_question) VALUES
('dd111111-1111-1111-1111-111111111111', 'aa111111-1111-1111-1111-111111111111', 'What is your top healthcare priority?'),
('dd222222-2222-2222-2222-222222222222', 'aa111111-1111-1111-1111-111111111111', 'How satisfied are you with current healthcare access?');

-- Survey question options
INSERT INTO survey_question_option (id, survey_question_id, survey_question_option) VALUES
('ee111111-1111-1111-1111-111111111111', 'dd111111-1111-1111-1111-111111111111', 'Lower costs'),
('ee222222-2222-2222-2222-222222222222', 'dd111111-1111-1111-1111-111111111111', 'Better access'),
('ee333333-3333-3333-3333-333333333333', 'dd111111-1111-1111-1111-111111111111', 'Improved quality'),
('ee444444-4444-4444-4444-444444444444', 'dd222222-2222-2222-2222-222222222222', 'Very satisfied'),
('ee555555-5555-5555-5555-555555555555', 'dd222222-2222-2222-2222-222222222222', 'Somewhat satisfied'),
('ee666666-6666-6666-6666-666666666666', 'dd222222-2222-2222-2222-222222222222', 'Dissatisfied');
