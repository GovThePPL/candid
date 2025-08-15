-- Test data for users
INSERT INTO users (id, username, email, password_hash, created_time, updated_time, display_name, user_type, status) VALUES
-- Admin user
('0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'admin1', 'admin1@example.com', '', '2024-09-22 14:32:15+00', '2025-06-18 09:45:22+00', 'Admin 1', 'admin', 'active'),

-- Moderator users
('a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'moderator1', 'moderator1@example.com', '', '2024-11-08 07:18:43+00', '2025-03-14 16:27:09+00', 'Moderator 1', 'moderator', 'active'),
('010f84ad-0abd-4352-a7b3-7f9b95d51983', 'moderator2', 'moderator2@example.com', '', '2024-12-15 22:41:07+00', '2025-07-29 11:53:34+00', 'Moderator 2', 'moderator', 'active'),

-- Normal users
('6c9344ed-0313-4b25-a616-5ac08967e84f', 'normal1', 'normal1@example.com', '', '2024-10-03 16:25:51+00', '2025-01-22 08:14:17+00', 'Normal 1', 'normal', 'active'),
('4a67d0e6-56a4-4396-916b-922d27db71d8', 'normal2', 'normal2@example.com', '', '2025-01-17 03:47:29+00', '2025-05-08 19:36:42+00', 'Normal 2', 'normal', 'active'),
('735565c1-93d9-4813-b227-3d9c06b78c8f', 'normal3', 'normal3@example.com', '', '2024-08-29 12:09:38+00', '2025-02-11 14:58:06+00', 'Normal 3', 'normal', 'active'),
('2333392a-7c07-4733-8b46-00d32833d9bc', 'normal4', 'normal4@example.com', '', '2025-03-05 20:33:12+00', '2025-08-01 07:21:48+00', 'Normal 4', 'normal', 'active'),
('c922be05-e355-4052-8d3f-7774669ddd32', 'normal5', 'normal5@example.com', '', '2024-09-14 05:56:24+00', '2025-04-27 13:42:55+00', 'Normal 5', 'normal', 'active'),

-- Guest users
('a82b485b-114f-44b7-aa0b-8ae8ca96e4f3', 'guest1', NULL, '', '2025-02-28 18:15:03+00', '2025-07-12 10:29:37+00', 'Guest 1', 'guest', 'active'),
('a2ec25a9-2a12-4a01-baf8-c0d1e254c3db', 'guest2', NULL, '', '2024-12-07 09:44:16+00', '2025-08-09 15:07:28+00', 'Guest 2', 'guest', 'active');

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


