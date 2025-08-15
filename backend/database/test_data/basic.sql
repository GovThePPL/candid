-- Test data for 10 users named by their roles
-- Password hashes are left blank as requested
-- Created times are random over the last year, updated times are random between created_time and today (8/14/2025)

INSERT INTO users (id, username, email, password_hash, created_time, updated_time, display_name, user_type, status) VALUES
-- Admin user
('11111111-1111-1111-1111-111111111111', 'admin1', 'admin1@example.com', '', '2024-09-22 14:32:15+00', '2025-06-18 09:45:22+00', 'Admin 1', 'admin', 'active'),

-- Moderator users
('22222222-2222-2222-2222-222222222222', 'moderator1', 'moderator1@example.com', '', '2024-11-08 07:18:43+00', '2025-03-14 16:27:09+00', 'Moderator 1', 'moderator', 'active'),
('33333333-3333-3333-3333-333333333333', 'moderator2', 'moderator2@example.com', '', '2024-12-15 22:41:07+00', '2025-07-29 11:53:34+00', 'Moderator 2', 'moderator', 'active'),

-- Normal users
('44444444-4444-4444-4444-444444444444', 'normal1', 'normal1@example.com', '', '2024-10-03 16:25:51+00', '2025-01-22 08:14:17+00', 'Normal 1', 'normal', 'active'),
('55555555-5555-5555-5555-555555555555', 'normal2', 'normal2@example.com', '', '2025-01-17 03:47:29+00', '2025-05-08 19:36:42+00', 'Normal 2', 'normal', 'active'),
('66666666-6666-6666-6666-666666666666', 'normal3', 'normal3@example.com', '', '2024-08-29 12:09:38+00', '2025-02-11 14:58:06+00', 'Normal 3', 'normal', 'active'),
('77777777-7777-7777-7777-777777777777', 'normal4', 'normal4@example.com', '', '2025-03-05 20:33:12+00', '2025-08-01 07:21:48+00', 'Normal 4', 'normal', 'active'),
('88888888-8888-8888-8888-888888888888', 'normal5', 'normal5@example.com', '', '2024-09-14 05:56:24+00', '2025-04-27 13:42:55+00', 'Normal 5', 'normal', 'active'),

-- Guest users
('99999999-9999-9999-9999-999999999999', 'guest1', NULL, '', '2025-02-28 18:15:03+00', '2025-07-12 10:29:37+00', 'Guest 1', 'guest', 'active'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'guest2', NULL, '', '2024-12-07 09:44:16+00', '2025-08-09 15:07:28+00', 'Guest 2', 'guest', 'active');

-- Test data for position categories
-- 10 top-level categories covering major political domains

INSERT INTO position_category (id, label, parent_position_category_id) VALUES
('c1111111-1111-1111-1111-111111111111', 'Healthcare', NULL),
('c2222222-2222-2222-2222-222222222222', 'Economy & Taxation', NULL),
('c3333333-3333-3333-3333-333333333333', 'Education', NULL),
('c4444444-4444-4444-4444-444444444444', 'Environment & Climate', NULL),
('c5555555-5555-5555-5555-555555555555', 'Immigration', NULL),
('c6666666-6666-6666-6666-666666666666', 'Criminal Justice', NULL),
('c7777777-7777-7777-7777-777777777777', 'Foreign Policy & Defense', NULL),
('c8888888-8888-8888-8888-888888888888', 'Civil Rights & Liberties', NULL),
('c9999999-9999-9999-9999-999999999999', 'Social Issues', NULL),
('caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Government & Democracy', NULL);
