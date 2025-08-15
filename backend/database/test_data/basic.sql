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

-- Test data for 50 position statements
INSERT INTO position (id, creator_user_id, category_id, location_id, statement, created_time, updated_time, agree_count, disagree_count, pass_count, chat_count, status) VALUES

-- Healthcare positions
('772d04ed-b2ad-4f95-a630-c739811fa615', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Universal healthcare should be a fundamental right guaranteed by the government.', '2024-10-15 09:30:00+00', '2025-08-10 14:22:33+00', 5, 1, 0, 0, 'active'),
('4d0b2198-414e-4cf9-93a9-83033b81ce76', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Private healthcare markets provide better quality care than government-run systems.', '2024-12-01 16:45:12+00', '2025-08-10 14:22:33+00', 1, 5, 0, 0, 'active'),
('f7aeb957-a41a-4b1e-9482-6297f5f07743', '6c9344ed-0313-4b25-a616-5ac08967e84f', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Prescription drug prices should be regulated by the federal government.', '2024-11-20 11:15:30+00', '2025-08-10 14:22:33+00', 6, 0, 0, 0, 'active'),
('28028e9a-90b5-4b2a-9054-d3d446180df7', '4a67d0e6-56a4-4396-916b-922d27db71d8', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Mental health services should receive equal insurance coverage as physical health.', '2025-02-10 08:22:45+00', '2025-08-10 14:22:33+00', 6, 0, 0, 0, 'active'),
('0bde4b83-a447-41ee-9b5e-4af2071cd9fc', '735565c1-93d9-4813-b227-3d9c06b78c8f', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Abortion access should be protected as part of healthcare rights.', '2024-09-15 13:40:20+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'inactive'),

-- Economy & Taxation positions
('d3232838-0433-421f-abef-453dd5a5f2e0', '2333392a-7c07-4733-8b46-00d32833d9bc', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Wealthy individuals and corporations should pay higher tax rates.', '2025-04-12 10:30:15+00', '2025-08-10 14:22:33+00', 3, 0, 1, 0, 'active'),
('f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', 'c922be05-e355-4052-8d3f-7774669ddd32', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Lower taxes stimulate economic growth and benefit everyone.', '2024-10-08 14:25:40+00', '2025-08-10 14:22:33+00', 1, 5, 0, 0, 'active'),
('9c3219d3-78a0-496a-a58b-73d56c480b97', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'A universal basic income would reduce poverty and inequality.', '2025-01-20 09:15:25+00', '2025-08-10 14:22:33+00', 5, 1, 0, 0, 'active'),
('03aba5c6-8dc8-4d6c-84e6-263aa7face03', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Free trade agreements benefit the global economy.', '2025-01-05 16:50:10+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('d61ccb9d-0b69-4eac-baf8-2f786d130535', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The minimum wage should be raised to $15 per hour nationally.', '2025-02-28 12:35:55+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Education positions
('23ca2c62-3f0f-4a95-bc68-5be76481da80', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Public college tuition should be free for all students.', '2024-12-10 15:20:30+00', '2025-08-10 14:22:33+00', 6, 0, 1, 0, 'active'),
('8352ed64-61bb-435f-88c5-f0404e964d25', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'School choice and voucher programs improve educational outcomes.', '2025-03-15 11:45:20+00', '2025-08-10 14:22:33+00', 0, 1, 2, 0, 'active'),
('efb3123c-6b67-44cf-b9d1-f8dfeca6915a', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Critical race theory should be taught in public schools.', '2024-11-05 08:30:45+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'removed'),
('939c6a46-4e79-411b-9de1-8e0874d73142', '2333392a-7c07-4733-8b46-00d32833d9bc', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Student loan debt should be forgiven by the federal government.', '2025-05-20 14:10:15+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('27f11a1f-2b0e-4358-8f0f-13c3aee18d70', 'c922be05-e355-4052-8d3f-7774669ddd32', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Teachers should be paid significantly higher salaries.', '2024-12-20 10:25:40+00', '2025-08-10 14:22:33+00', 5, 0, 0, 0, 'active'),

-- Environment & Climate positions
('ff30d27b-c18e-48a9-9eb2-ca99cf9fd75e', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The government should implement a carbon tax to combat climate change.', '2025-03-10 13:15:25+00', '2025-08-10 14:22:33+00', 4, 1, 0, 0, 'active'),
('fa017574-9db8-426c-8e11-ef8c83d7d5c1', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Nuclear energy is essential for reducing carbon emissions.', '2025-02-18 09:40:50+00', '2025-08-10 14:22:33+00', 4, 0, 0, 0, 'active'),
('24790103-92a4-4fd2-b270-6a65a44ad91e', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Renewable energy subsidies should be eliminated.', '2025-01-12 16:20:35+00', '2025-08-10 14:22:33+00', 1, 2, 0, 0, 'active'),
('4f315b6a-9b23-4b1c-8443-f8df6c7d3cae', '6c9344ed-0313-4b25-a616-5ac08967e84f', '66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The Paris Climate Agreement should be strengthened with binding targets.', '2024-11-25 12:55:10+00', '2025-08-10 14:22:33+00', 2, 0, 0, 0, 'active'),
('188865ae-0b16-499c-b3cb-1ede81a14518', '4a67d0e6-56a4-4396-916b-922d27db71d8', '66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Fracking should be banned to protect the environment.', '2025-04-05 11:30:25+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Immigration positions
('20fabff1-a37a-4941-8bc8-4f082da6a189', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'A path to citizenship should be provided for undocumented immigrants.', '2024-10-30 15:45:20+00', '2025-08-10 14:22:33+00', 1, 0, 0, 0, 'active'),
('c0d14b0f-370c-4f4f-8d7b-d7eed193af14', '2333392a-7c07-4733-8b46-00d32833d9bc', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Border security should be the top immigration priority.', '2025-06-15 08:20:45+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('993634d7-ad78-4870-8d5e-43e1008da1e8', 'c922be05-e355-4052-8d3f-7774669ddd32', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The US should accept more refugees from war-torn countries.', '2025-01-08 14:35:30+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('727265d3-5cf0-4258-83d8-223a0a881936', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Sanctuary cities should lose federal funding.', '2025-04-22 10:15:55+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'inactive'),
('2c291423-f26b-4502-8e47-54b938785d66', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Merit-based immigration systems are fairer than family-based systems.', '2025-03-28 13:50:40+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Criminal Justice positions
('9ebe265e-1429-473a-8d27-7313997ffe88', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '04edc480-aded-4b93-94c4-d62cbb507dc4', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The death penalty should be abolished nationwide.', '2025-02-05 09:25:15+00', '2025-08-10 14:22:33+00', 6, 1, 0, 0, 'active'),
('038653a6-1008-4acf-a31b-8ebc31b3611d', '6c9344ed-0313-4b25-a616-5ac08967e84f', '04edc480-aded-4b93-94c4-d62cbb507dc4', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Police departments should be defunded and resources redirected to social services.', '2024-12-15 16:40:25+00', '2025-08-10 14:22:33+00', 6, 0, 0, 0, 'active'),
('2e3afe8d-1b4a-4a09-bcc1-965a43abf666', '4a67d0e6-56a4-4396-916b-922d27db71d8', '04edc480-aded-4b93-94c4-d62cbb507dc4', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Mandatory minimum sentencing laws should be repealed.', '2025-04-18 12:15:50+00', '2025-08-10 14:22:33+00', 6, 0, 0, 0, 'active'),
('4eb36f7a-5f7d-4c9f-9837-0b20f35fe0a9', '735565c1-93d9-4813-b227-3d9c06b78c8f', '04edc480-aded-4b93-94c4-d62cbb507dc4', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Drug possession should be decriminalized and treated as a health issue.', '2024-12-05 11:30:35+00', '2025-08-10 14:22:33+00', 6, 0, 0, 0, 'active'),
('51679257-5218-46e9-b291-ab02cd2d57fd', '2333392a-7c07-4733-8b46-00d32833d9bc', '04edc480-aded-4b93-94c4-d62cbb507dc4', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Private prisons should be eliminated from the justice system.', '2025-07-10 15:20:10+00', '2025-08-10 14:22:33+00', 0, 0, 4, 0, 'active'),

-- Foreign Policy & Defense positions
('da947f66-41f4-4fb5-bab7-342015205947', 'c922be05-e355-4052-8d3f-7774669ddd32', '92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Military spending should be significantly reduced.', '2025-02-25 10:45:20+00', '2025-08-10 14:22:33+00', 0, 5, 0, 0, 'active'),
('1ae82e39-d2a0-4047-b3e6-3bb71774eaa5', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The US should maintain strong military presence globally.', '2025-05-08 14:30:45+00', '2025-08-10 14:22:33+00', 6, 0, 0, 0, 'active'),
('05c8142d-15f5-469a-a34d-2eae28aed686', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'NATO should be strengthened to counter authoritarian threats.', '2025-04-30 08:15:30+00', '2025-08-10 14:22:33+00', 5, 0, 0, 0, 'active'),
('7a8282a2-b011-4740-87ab-f42a425851ea', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Foreign aid should be reduced to focus on domestic priorities.', '2025-03-20 13:25:55+00', '2025-08-10 14:22:33+00', 0, 4, 0, 0, 'active'),
('8a3d4804-612c-444b-838e-2cc048081c3f', '6c9344ed-0313-4b25-a616-5ac08967e84f', '92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Drone warfare should be subject to stricter oversight and limitations.', '2025-01-18 16:50:15+00', '2025-08-10 14:22:33+00', 1, 0, 0, 0, 'active'),

-- Civil Rights & Liberties positions
('b1b80da2-5299-4e40-92c7-afc57d849a87', '4a67d0e6-56a4-4396-916b-922d27db71d8', '2d83d6eb-3000-47eb-b136-9d1c44f9b98d', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Same-sex marriage should be protected as a constitutional right.', '2025-03-25 09:40:25+00', '2025-08-10 14:22:33+00', 3, 0, 1, 0, 'active'),
('60b28e32-8fe8-4c96-8b64-552f16c76043', '735565c1-93d9-4813-b227-3d9c06b78c8f', '2d83d6eb-3000-47eb-b136-9d1c44f9b98d', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Voting rights should be expanded and protected from restrictions.', '2024-11-12 12:20:40+00', '2025-08-10 14:22:33+00', 4, 0, 0, 0, 'active'),
('32fa7813-adb5-41bb-9bea-3e92b98851af', '2333392a-7c07-4733-8b46-00d32833d9bc', '2d83d6eb-3000-47eb-b136-9d1c44f9b98d', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Transgender individuals should have equal rights and protections.', '2025-06-02 15:35:50+00', '2025-08-10 14:22:33+00', 4, 0, 0, 0, 'active'),
('4b15f919-3b0b-44fa-a1ab-5edace80f7d1', 'c922be05-e355-4052-8d3f-7774669ddd32', '2d83d6eb-3000-47eb-b136-9d1c44f9b98d', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Religious freedom should be protected even when it conflicts with other rights.', '2025-03-12 11:15:30+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('93c7f04f-9c96-47e3-8a7b-6aa26cff2a44', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '2d83d6eb-3000-47eb-b136-9d1c44f9b98d', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Government surveillance programs violate constitutional privacy rights.', '2025-06-25 14:45:20+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Social Issues positions
('3e12d92d-57c8-4367-b61b-ad976e5eb6fc', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '26c8146e-d080-419e-b98b-5089c3a81b5b', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Gun control laws should be significantly strengthened.', '2025-05-15 10:30:45+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('15478fb9-5608-4307-a8c2-b8dd19147c3b', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '26c8146e-d080-419e-b98b-5089c3a81b5b', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The Second Amendment protects individual gun ownership rights.', '2025-01-30 13:20:35+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('ac84d1c7-e138-4a49-979f-64fadd4d874a', '6c9344ed-0313-4b25-a616-5ac08967e84f', '26c8146e-d080-419e-b98b-5089c3a81b5b', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Marijuana should be legalized for recreational use nationwide.', '2025-01-10 16:25:50+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('15b65f50-476d-43b9-8133-b1299c7e9728', '4a67d0e6-56a4-4396-916b-922d27db71d8', '26c8146e-d080-419e-b98b-5089c3a81b5b', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Social media companies should be regulated to prevent misinformation.', '2025-04-08 09:15:25+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('47d5cef0-89d5-4e5b-aff1-9826999c9e66', '735565c1-93d9-4813-b227-3d9c06b78c8f', '26c8146e-d080-419e-b98b-5089c3a81b5b', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Affirmative action programs should be maintained to promote diversity.', '2024-12-28 12:40:15+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Government & Democracy positions
('f6e13db3-5f2e-4783-afad-20b62ed88f61', '2333392a-7c07-4733-8b46-00d32833d9bc', 'cdc48d27-d636-481b-90b2-d6f6a2e6780e', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The Electoral College should be abolished in favor of popular vote.', '2025-07-20 11:50:30+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('9ebd4fe5-c6cb-4a56-b996-529dbf9bfee4', 'c922be05-e355-4052-8d3f-7774669ddd32', 'cdc48d27-d636-481b-90b2-d6f6a2e6780e', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Term limits should be imposed on members of Congress.', '2025-04-15 15:25:40+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('18df8aad-3664-4feb-a013-ff3d1c760317', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'cdc48d27-d636-481b-90b2-d6f6a2e6780e', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Campaign finance should be reformed to limit corporate influence.', '2025-07-05 08:35:20+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('f254ac0e-0921-47af-a073-2bed3d793d74', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'cdc48d27-d636-481b-90b2-d6f6a2e6780e', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Gerrymandering should be eliminated through independent redistricting commissions.', '2025-06-10 14:10:55+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('03755ed6-3aaf-40d0-8d8b-5e559af7f377', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'cdc48d27-d636-481b-90b2-d6f6a2e6780e', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The Supreme Court should have term limits rather than lifetime appointments.', '2025-02-14 10:45:35+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active');

-- Test data for locations
INSERT INTO location (id, parent_location_id, code, name) VALUES
('ba5e3dcf-af51-47f4-941d-ee3448ee826a', NULL, 'OR', 'Oregon');

-- Test data for user_location entries
INSERT INTO user_location (id, user_id, location_id, created_time) VALUES
-- Admin user
('9d77bc28-34ba-46eb-a93e-8c59cb5dfa6a', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2024-09-24 10:15:30+00'),

-- Moderator users
('68339e80-a17e-4f11-9bf4-add6aab95b10', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2024-11-10 14:22:18+00'),
('163714b8-034d-4e92-b464-4772a6c361f9', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2024-12-17 08:30:45+00'),

-- Normal users
('c0917efc-f67e-490f-bf88-234fe38a77a0', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2024-10-05 12:40:22+00'),
('abc7621a-ed4b-4579-bf8b-7b07cb2cb56e', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2025-01-19 15:25:10+00'),
('ab764391-9a32-4929-9441-93e1afd3226d', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2024-08-31 09:18:55+00'),
('e84069e6-8d69-4317-9bc3-488481cac1ab', '2333392a-7c07-4733-8b46-00d32833d9bc', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2025-03-07 16:45:33+00'),
('3730d95e-960a-4632-ac50-7d230950cc04', 'c922be05-e355-4052-8d3f-7774669ddd32', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', '2024-09-16 11:30:15+00'),

-- Guest users
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

-- Test data for user_position entries (75 total)
-- First 50 entries: creators adopting their own positions
INSERT INTO user_position (id, user_id, position_id, status, agree_count, disagree_count, pass_count, chat_count, created_time, updated_time) VALUES

-- Healthcare positions (creators adopting their own)
('4c0dd7fe-2533-4794-a8e7-a97de971971e', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '772d04ed-b2ad-4f95-a630-c739811fa615', 'active', 5, 1, 0, 0, '2024-10-15 09:30:00+00', '2025-03-20 11:45:22+00'),
('ec3e0406-b044-4735-9d78-6e305f2fa406', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '4d0b2198-414e-4cf9-93a9-83033b81ce76', 'active', 1, 5, 0, 0, '2024-12-01 16:45:12+00', '2025-02-10 14:30:15+00'),
('8a63d2d0-9ed6-4b26-8a64-350e0594c6e4', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'f7aeb957-a41a-4b1e-9482-6297f5f07743', 'active', 6, 0, 0, 0, '2024-11-20 11:15:30+00', '2024-12-25 16:20:45+00'),
('5e64e6cc-baae-4f14-859b-9577a6eb2d23', '4a67d0e6-56a4-4396-916b-922d27db71d8', '28028e9a-90b5-4b2a-9054-d3d446180df7', 'active', 6, 0, 0, 0, '2025-02-10 08:22:45+00', '2025-04-15 12:30:20+00'),
('3d817dc4-f763-4463-86df-4bbd277eb6db', '735565c1-93d9-4813-b227-3d9c06b78c8f', '0bde4b83-a447-41ee-9b5e-4af2071cd9fc', 'inactive', 0, 0, 0, 0, '2024-09-15 13:40:20+00', '2024-11-30 09:15:35+00'),

-- Economy & Taxation positions (creators adopting their own)
('54fa1f40-e218-41b6-ab59-9ee3d79619af', '2333392a-7c07-4733-8b46-00d32833d9bc', 'd3232838-0433-421f-abef-453dd5a5f2e0', 'active', 3, 0, 1, 0, '2025-04-12 10:30:15+00', '2025-06-20 14:45:30+00'),
('692acc50-7b61-4578-92d5-bfd2df47ca22', 'c922be05-e355-4052-8d3f-7774669ddd32', 'f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', 'active', 1, 5, 0, 0, '2024-10-08 14:25:40+00', '2025-01-15 10:20:15+00'),
('f1b70de6-2e72-4566-9dd8-7d88ded64db9', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '9c3219d3-78a0-496a-a58b-73d56c480b97', 'active', 5, 1, 0, 0, '2025-01-20 09:15:25+00', '2025-05-10 16:40:50+00'),
('11fa87ae-236f-4a0e-8d62-94843aa53d89', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '03aba5c6-8dc8-4d6c-84e6-263aa7face03', 'active', 0, 0, 0, 0, '2025-01-05 16:50:10+00', '2025-04-22 13:25:40+00'),
('8bfba46f-881d-4cbf-baaf-ea71f9cc1a0a', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'd61ccb9d-0b69-4eac-baf8-2f786d130535', 'active', 0, 0, 0, 0, '2025-02-28 12:35:55+00', '2025-03-10 08:15:20+00'),

-- Education positions (creators adopting their own)
('2f334966-4be6-44da-ae4e-6cfa307967f0', '6c9344ed-0313-4b25-a616-5ac08967e84f', '23ca2c62-3f0f-4a95-bc68-5be76481da80', 'active', 6, 0, 1, 0, '2024-12-10 15:20:30+00', '2025-01-18 11:35:45+00'),
('0312f8ea-6c0a-4d06-9b31-0b059995c698', '4a67d0e6-56a4-4396-916b-922d27db71d8', '8352ed64-61bb-435f-88c5-f0404e964d25', 'active', 0, 1, 2, 0, '2025-03-15 11:45:20+00', '2025-04-28 15:20:30+00'),
('24af31aa-ae3e-41fc-850a-ed8dc19595c9', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'efb3123c-6b67-44cf-b9d1-f8dfeca6915a', 'deleted', 0, 0, 0, 0, '2024-11-05 08:30:45+00', '2024-12-20 14:45:10+00'),
('71efae51-b144-4b04-a055-9ff0d4be8f9a', '2333392a-7c07-4733-8b46-00d32833d9bc', '939c6a46-4e79-411b-9de1-8e0874d73142', 'active', 0, 0, 0, 0, '2025-05-20 14:10:15+00', '2025-07-15 09:30:25+00'),
('927a0293-5e92-4450-a584-bd42be3386be', 'c922be05-e355-4052-8d3f-7774669ddd32', '27f11a1f-2b0e-4358-8f0f-13c3aee18d70', 'active', 5, 0, 0, 0, '2024-12-20 10:25:40+00', '2025-02-14 16:50:15+00'),

-- Environment & Climate positions (creators adopting their own)
('a6ea8b9b-59ed-4682-9cb2-80fc770c3cf7', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'ff30d27b-c18e-48a9-9eb2-ca99cf9fd75e', 'active', 0, 0, 0, 0, '2025-03-10 13:15:25+00', '2025-06-18 10:40:35+00'),
('86b866ae-9a29-4ffe-afc1-a85b62142103', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'fa017574-9db8-426c-8e11-ef8c83d7d5c1', 'active', 0, 0, 0, 0, '2025-02-18 09:40:50+00', '2025-05-25 14:15:20+00'),
('8e1cb6f5-87f3-471a-98ff-0a0d901287ff', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '24790103-92a4-4fd2-b270-6a65a44ad91e', 'active', 0, 0, 0, 0, '2025-01-12 16:20:35+00', '2025-02-28 12:45:50+00'),
('98a1868e-4fd9-417d-8e5c-928e8219bb51', '6c9344ed-0313-4b25-a616-5ac08967e84f', '4f315b6a-9b23-4b1c-8443-f8df6c7d3cae', 'active', 0, 0, 0, 0, '2024-11-25 12:55:10+00', '2025-01-10 08:20:25+00'),
('0dd93e56-0211-4a0f-8825-9e3f4fd95198', '4a67d0e6-56a4-4396-916b-922d27db71d8', '188865ae-0b16-499c-b3cb-1ede81a14518', 'active', 0, 0, 0, 0, '2025-04-05 11:30:25+00', '2025-05-02 16:15:40+00'),

-- Immigration positions (creators adopting their own)
('cd411a92-82ac-4075-abc6-f4154db00fb8', '735565c1-93d9-4813-b227-3d9c06b78c8f', '20fabff1-a37a-4941-8bc8-4f082da6a189', 'active', 0, 0, 0, 0, '2024-10-30 15:45:20+00', '2025-01-25 11:30:15+00'),
('e9fec3d4-ca92-469c-9b4f-172b0d77bc32', '2333392a-7c07-4733-8b46-00d32833d9bc', 'c0d14b0f-370c-4f4f-8d7b-d7eed193af14', 'active', 0, 0, 0, 0, '2025-06-15 08:20:45+00', '2025-07-28 14:35:20+00'),
('6fadc3df-fa39-4287-ae32-0cfb90b78d1b', 'c922be05-e355-4052-8d3f-7774669ddd32', '993634d7-ad78-4870-8d5e-43e1008da1e8', 'active', 0, 0, 0, 0, '2025-01-08 14:35:30+00', '2025-03-15 09:50:45+00'),
('527ca25b-f231-4f54-bbc9-3f1ed11f7708', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '727265d3-5cf0-4258-83d8-223a0a881936', 'inactive', 0, 0, 0, 0, '2025-04-22 10:15:55+00', '2025-06-30 15:25:10+00'),
('fc2fc1f7-edbf-4a98-8e3d-36c14517f04c', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '2c291423-f26b-4502-8e47-54b938785d66', 'active', 0, 0, 0, 0, '2025-03-28 13:50:40+00', '2025-06-05 10:15:25+00'),

-- Criminal Justice positions (creators adopting their own)
('50f3f010-a903-4147-a3cd-f32a52cbdbac', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '9ebe265e-1429-473a-8d27-7313997ffe88', 'active', 6, 1, 0, 0, '2025-02-05 09:25:15+00', '2025-03-12 16:40:30+00'),
('d3dcb438-faa6-419d-9453-4a1b449be924', '6c9344ed-0313-4b25-a616-5ac08967e84f', '038653a6-1008-4acf-a31b-8ebc31b3611d', 'active', 6, 0, 0, 0, '2024-12-15 16:40:25+00', '2025-01-20 12:15:40+00'),
('2c52e31f-9865-4ef7-84ab-13679644e047', '4a67d0e6-56a4-4396-916b-922d27db71d8', '2e3afe8d-1b4a-4a09-bcc1-965a43abf666', 'active', 6, 0, 0, 0, '2025-04-18 12:15:50+00', '2025-05-06 08:30:15+00'),
('b15c5851-3802-464d-a1f8-e3665ac67665', '735565c1-93d9-4813-b227-3d9c06b78c8f', '4eb36f7a-5f7d-4c9f-9837-0b20f35fe0a9', 'active', 6, 0, 0, 0, '2024-12-05 11:30:35+00', '2025-02-08 14:45:20+00'),
('26ced74f-cc00-4f2d-8f5d-f0bb325e6adb', '2333392a-7c07-4733-8b46-00d32833d9bc', '51679257-5218-46e9-b291-ab02cd2d57fd', 'active', 0, 0, 4, 0, '2025-07-10 15:20:10+00', '2025-07-30 11:35:25+00'),

-- Foreign Policy & Defense positions (creators adopting their own)
('aaa786fa-2642-4510-ae5b-664b98b17782', 'c922be05-e355-4052-8d3f-7774669ddd32', 'da947f66-41f4-4fb5-bab7-342015205947', 'active', 0, 5, 0, 0, '2025-02-25 10:45:20+00', '2025-04-10 16:20:35+00'),
('2d08160e-8f1d-40b1-bdc6-7cfbd05343db', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '1ae82e39-d2a0-4047-b3e6-3bb71774eaa5', 'active', 6, 0, 0, 0, '2025-05-08 14:30:45+00', '2025-07-20 09:15:20+00'),
('95cc8958-3c5a-4519-a48c-c2cedded2448', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '05c8142d-15f5-469a-a34d-2eae28aed686', 'active', 5, 0, 0, 0, '2025-04-30 08:15:30+00', '2025-06-12 13:40:45+00'),
('c56ff617-f8e6-4ad4-8d68-27521eb7d79d', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '7a8282a2-b011-4740-87ab-f42a425851ea', 'active', 0, 4, 0, 0, '2025-03-20 13:25:55+00', '2025-03-14 15:50:10+00'),
('2e59b0a8-8b55-41cd-a8e7-6660a599fcf6', '6c9344ed-0313-4b25-a616-5ac08967e84f', '8a3d4804-612c-444b-838e-2cc048081c3f', 'active', 1, 0, 0, 0, '2025-01-18 16:50:15+00', '2025-01-21 10:25:30+00'),

-- Civil Rights & Liberties positions (creators adopting their own)
('082fa2d6-e9bb-43d9-95e4-d5c915814abf', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'b1b80da2-5299-4e40-92c7-afc57d849a87', 'active', 3, 0, 1, 0, '2025-03-25 09:40:25+00', '2025-05-05 14:15:40+00'),
('53bdf852-8b8d-4f71-a677-7df6884061c8', '735565c1-93d9-4813-b227-3d9c06b78c8f', '60b28e32-8fe8-4c96-8b64-552f16c76043', 'active', 4, 0, 0, 0, '2024-11-12 12:20:40+00', '2025-02-05 16:35:55+00'),
('024a8bd3-cb3a-4a5d-97bd-ca7c2790d58a', '2333392a-7c07-4733-8b46-00d32833d9bc', '32fa7813-adb5-41bb-9bea-3e92b98851af', 'active', 4, 0, 0, 0, '2025-06-02 15:35:50+00', '2025-07-25 11:20:15+00'),
('386d1f4a-0fd0-41b0-b641-357656269f4f', 'c922be05-e355-4052-8d3f-7774669ddd32', '4b15f919-3b0b-44fa-a1ab-5edace80f7d1', 'active', 0, 0, 0, 0, '2025-03-12 11:15:30+00', '2025-04-20 08:40:45+00'),
('8c64cb27-8837-49ad-ab9d-b1e36059c9e1', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '93c7f04f-9c96-47e3-8a7b-6aa26cff2a44', 'active', 0, 0, 0, 0, '2025-06-25 14:45:20+00', '2025-07-28 10:30:35+00'),

-- Social Issues positions (creators adopting their own)
('58795ba9-c316-4a35-b0fe-292220cfa9d3', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '3e12d92d-57c8-4367-b61b-ad976e5eb6fc', 'active', 0, 0, 0, 0, '2025-05-15 10:30:45+00', '2025-06-15 15:45:20+00'),
('2cab3399-08b6-4fa8-8b72-dce18b3bc7a1', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '15478fb9-5608-4307-a8c2-b8dd19147c3b', 'active', 0, 0, 0, 0, '2025-01-30 13:20:35+00', '2025-03-10 09:35:50+00'),
('87fe2a39-be8c-453e-80a2-240fc32bcd16', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'ac84d1c7-e138-4a49-979f-64fadd4d874a', 'active', 0, 0, 0, 0, '2025-01-10 16:25:50+00', '2025-01-20 12:40:15+00'),
('eb3fa295-ff7d-4d90-bd5a-93aad4d57771', '4a67d0e6-56a4-4396-916b-922d27db71d8', '15b65f50-476d-43b9-8133-b1299c7e9728', 'active', 0, 0, 0, 0, '2025-04-08 09:15:25+00', '2025-05-04 14:30:40+00'),
('c5eb4bb6-adad-4823-bb78-242aad165c9d', '735565c1-93d9-4813-b227-3d9c06b78c8f', '47d5cef0-89d5-4e5b-aff1-9826999c9e66', 'active', 0, 0, 0, 0, '2024-12-28 12:40:15+00', '2025-02-10 16:55:30+00'),

-- Government & Democracy positions (creators adopting their own)
('9a716974-7f33-4081-8a98-af36fb4d0cc6', '2333392a-7c07-4733-8b46-00d32833d9bc', 'f6e13db3-5f2e-4783-afad-20b62ed88f61', 'active', 0, 0, 0, 0, '2025-07-20 11:50:30+00', '2025-07-31 08:15:45+00'),
('8588ae10-5137-47c2-bf4a-9b0221d3b92e', 'c922be05-e355-4052-8d3f-7774669ddd32', '9ebd4fe5-c6cb-4a56-b996-529dbf9bfee4', 'active', 0, 0, 0, 0, '2025-04-15 15:25:40+00', '2025-04-25 11:40:55+00'),
('b122a4c1-1f7b-440d-9297-15b86bee4608', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '18df8aad-3664-4feb-a013-ff3d1c760317', 'active', 0, 0, 0, 0, '2025-07-05 08:35:20+00', '2025-07-27 14:20:35+00'),
('dd1d9320-2a08-464e-a892-b25018687018', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'f254ac0e-0921-47af-a073-2bed3d793d74', 'active', 0, 0, 0, 0, '2025-06-10 14:10:55+00', '2025-06-16 10:25:10+00'),
('d7ee8bf4-f3eb-4ef2-96c5-b12ed73ab90e', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '03755ed6-3aaf-40d0-8d8b-5e559af7f377', 'active', 0, 0, 0, 0, '2025-02-14 10:45:35+00', '2025-03-12 15:30:20+00'),

-- Additional 25 entries: users adopting other users' positions
('5fb54e26-f414-4fbb-96fa-ccb788eeb4e4', '6c9344ed-0313-4b25-a616-5ac08967e84f', '772d04ed-b2ad-4f95-a630-c739811fa615', 'active', 0, 0, 0, 0, '2024-10-20 14:15:30+00', '2025-01-15 09:30:45+00'),
('1c7a8d60-82b2-4467-8f71-cebac6501e12', '4a67d0e6-56a4-4396-916b-922d27db71d8', '4d0b2198-414e-4cf9-93a9-83033b81ce76', 'active', 0, 0, 0, 0, '2024-12-05 10:20:15+00', '2025-03-18 16:45:20+00'),
('160740bc-d898-4c5b-96a3-2021b0d1d543', '2333392a-7c07-4733-8b46-00d32833d9bc', 'f7aeb957-a41a-4b1e-9482-6297f5f07743', 'active', 0, 0, 0, 0, '2025-03-25 12:30:40+00', '2025-06-10 14:55:15+00'),
('e28840ae-8d88-4a48-b823-ae69e363fff1', 'c922be05-e355-4052-8d3f-7774669ddd32', '28028e9a-90b5-4b2a-9054-d3d446180df7', 'active', 0, 0, 0, 0, '2025-02-15 16:40:25+00', '2025-04-22 11:15:50+00'),
('830a4b82-683d-4375-851f-9eb7f37cf8e2', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '0bde4b83-a447-41ee-9b5e-4af2071cd9fc', 'inactive', 0, 0, 0, 0, '2024-09-20 08:15:30+00', '2025-05-15 13:40:45+00'),
('f703a421-146f-48f0-918d-f19070cf8b6f', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'd3232838-0433-421f-abef-453dd5a5f2e0', 'active', 0, 0, 0, 0, '2025-04-18 11:45:20+00', '2025-06-14 16:30:35+00'),
('ecbc84bd-81a2-49fe-9fff-8f1872ce3a4c', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', 'active', 0, 0, 0, 0, '2024-10-12 15:30:45+00', '2025-02-28 10:15:20+00'),
('bd14341d-1a83-411f-b641-e7e95381b213', '6c9344ed-0313-4b25-a616-5ac08967e84f', '9c3219d3-78a0-496a-a58b-73d56c480b97', 'active', 0, 0, 0, 0, '2025-01-25 13:20:35+00', '2025-01-21 09:45:50+00'),
('c5691530-6585-4945-ba8f-83f806abb40d', '4a67d0e6-56a4-4396-916b-922d27db71d8', '03aba5c6-8dc8-4d6c-84e6-263aa7face03', 'active', 0, 0, 0, 0, '2025-01-10 18:25:15+00', '2025-04-30 12:40:30+00'),
('6b423ed7-fa20-4705-aeb0-8fae448967c6', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'd61ccb9d-0b69-4eac-baf8-2f786d130535', 'active', 0, 0, 0, 0, '2025-03-02 14:40:20+00', '2025-02-09 16:55:35+00'),
('9ffe0108-87c8-40b3-b844-df11b40a4fb9', 'c922be05-e355-4052-8d3f-7774669ddd32', '23ca2c62-3f0f-4a95-bc68-5be76481da80', 'active', 0, 0, 0, 0, '2024-12-15 16:25:40+00', '2025-03-20 11:10:55+00'),
('5614c911-d7f3-4e5e-965e-e9891152424c', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '8352ed64-61bb-435f-88c5-f0404e964d25', 'active', 0, 0, 0, 0, '2025-03-20 12:50:30+00', '2025-06-25 08:15:45+00'),
('11a4e64b-6575-49ab-a13e-39275173a7fc', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'efb3123c-6b67-44cf-b9d1-f8dfeca6915a', 'deleted', 0, 0, 0, 0, '2024-11-10 09:35:50+00', '2025-05-22 14:20:15+00'),
('d4eb94df-fe38-4bd0-ad15-a0a28a3ac426', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '939c6a46-4e79-411b-9de1-8e0874d73142', 'active', 0, 0, 0, 0, '2025-05-25 15:15:20+00', '2025-03-10 10:40:35+00'),
('5243d839-040e-4ae3-a667-281c590f8226', '6c9344ed-0313-4b25-a616-5ac08967e84f', '27f11a1f-2b0e-4358-8f0f-13c3aee18d70', 'active', 0, 0, 0, 0, '2024-12-25 11:30:45+00', '2025-01-18 16:45:20+00'),
('9f285a0f-144c-40f9-9475-bc9511629f53', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'ff30d27b-c18e-48a9-9eb2-ca99cf9fd75e', 'active', 0, 0, 0, 0, '2025-03-15 14:20:30+00', '2025-05-06 09:35:45+00'),
('bb5b53a9-f2ba-4904-a2a4-40bb96f74fab', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'fa017574-9db8-426c-8e11-ef8c83d7d5c1', 'active', 0, 0, 0, 0, '2025-02-22 16:45:15+00', '2025-02-10 12:20:30+00'),
('06e9981b-8cbd-4171-a9a4-990d1db58a08', '2333392a-7c07-4733-8b46-00d32833d9bc', '24790103-92a4-4fd2-b270-6a65a44ad91e', 'active', 0, 0, 0, 0, '2025-03-10 13:30:25+00', '2025-07-18 15:45:40+00'),
('bfebf46d-f499-4738-8ab7-a618f9147988', 'c922be05-e355-4052-8d3f-7774669ddd32', '4f315b6a-9b23-4b1c-8443-f8df6c7d3cae', 'active', 0, 0, 0, 0, '2024-11-30 14:20:15+00', '2025-04-15 10:35:30+00'),
('eaffcfa5-cd15-416c-b832-48a5fe07a6f5', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '188865ae-0b16-499c-b3cb-1ede81a14518', 'active', 0, 0, 0, 0, '2025-04-10 12:35:30+00', '2025-07-22 16:50:45+00'),
('7b3d42f6-4060-4e90-9db1-ab2c6dfd5558', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '20fabff1-a37a-4941-8bc8-4f082da6a189', 'active', 0, 0, 0, 0, '2024-11-05 16:50:25+00', '2025-06-10 13:15:40+00'),
('c5c39b15-0aa8-4c81-9d1b-c00a414ef3c8', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'c0d14b0f-370c-4f4f-8d7b-d7eed193af14', 'active', 0, 0, 0, 0, '2025-06-20 09:25:40+00', '2025-03-12 14:40:55+00'),
('a74ae605-56f2-4066-89fd-1e5a2153e29e', '6c9344ed-0313-4b25-a616-5ac08967e84f', '993634d7-ad78-4870-8d5e-43e1008da1e8', 'active', 0, 0, 0, 0, '2025-01-12 15:40:35+00', '2025-01-20 11:25:50+00'),
('d5c22c9b-18d6-4795-b315-2f4e85b35d59', '4a67d0e6-56a4-4396-916b-922d27db71d8', '727265d3-5cf0-4258-83d8-223a0a881936', 'inactive', 0, 0, 0, 0, '2025-04-25 11:20:00+00', '2025-05-04 16:35:15+00'),
('2d638359-54d4-40bb-9637-c9be4786f2a2', '735565c1-93d9-4813-b227-3d9c06b78c8f', '2c291423-f26b-4502-8e47-54b938785d66', 'active', 0, 0, 0, 0, '2025-03-30 14:55:45+00', '2025-02-08 10:20:30+00');

-- Test data for user activity sessions
INSERT INTO user_activity (id, user_id, activity_start_time, activity_end_time) VALUES
-- Admin user activity sessions
('ac802f89-ca12-4ecd-9340-352f7908041f', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '2024-11-15 14:20:00+00', '2024-11-15 14:45:00+00'),
('d4b48430-3c60-46fd-a6ee-3c1b50484a1e', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '2025-01-20 09:10:00+00', '2025-01-20 09:40:00+00'),
('85161466-a540-47a9-b697-f805e8a8ea8b', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '2025-03-10 16:30:00+00', '2025-03-10 17:00:00+00'),

-- Moderator1 activity sessions
('6f8bf596-c4ad-4515-9e5b-39e0be8a58db', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '2024-12-20 10:15:00+00', '2024-12-20 10:50:00+00'),
('54b62c48-c85c-44ce-b0c2-60f7eea36d29', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '2025-02-15 13:20:00+00', '2025-02-15 13:55:00+00'),
('ef0eae78-9eb9-4bfd-aefd-62c184e03785', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '2025-04-05 11:10:00+00', '2025-04-05 11:35:00+00'),

-- Moderator2 activity sessions
('1c1300e1-04f5-4af0-ac1a-4b319e94668d', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '2025-01-10 15:45:00+00', '2025-01-10 16:20:00+00'),
('1d0ef7e0-6d9d-4f65-bcd7-a1bbc58f220a', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '2025-03-25 08:30:00+00', '2025-03-25 09:00:00+00'),
('8594e167-183b-4496-bd90-594b0a807e6a', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '2025-05-20 14:15:00+00', '2025-05-20 14:45:00+00'),

-- Normal1 activity sessions
('20c4b330-a097-4885-a424-a258ea3c1203', '6c9344ed-0313-4b25-a616-5ac08967e84f', '2024-11-05 12:30:00+00', '2024-11-05 13:10:00+00'),
('1d1f618e-1ef1-4c1f-b1f9-3769c2b5b1d6', '6c9344ed-0313-4b25-a616-5ac08967e84f', '2024-12-28 16:20:00+00', '2024-12-28 16:50:00+00'),
('c4cc53f6-7b27-4b38-af53-251d96e94434', '6c9344ed-0313-4b25-a616-5ac08967e84f', '2025-02-10 11:15:00+00', '2025-02-10 11:45:00+00'),

-- Normal2 activity sessions
('a8b136c7-2d71-48d3-8119-a1ab78c2923b', '4a67d0e6-56a4-4396-916b-922d27db71d8', '2025-02-20 09:45:00+00', '2025-02-20 10:25:00+00'),
('2557945c-dbcf-410d-8f1c-4289e6bee320', '4a67d0e6-56a4-4396-916b-922d27db71d8', '2025-04-12 14:30:00+00', '2025-04-12 15:00:00+00'),
('ec64f153-6b85-40c9-ad41-a0ccaf08495d', '4a67d0e6-56a4-4396-916b-922d27db71d8', '2025-06-08 10:20:00+00', '2025-06-08 10:55:00+00'),

-- Normal3 activity sessions
('f79bce69-94b6-414b-9f8d-70d977c76008', '735565c1-93d9-4813-b227-3d9c06b78c8f', '2024-10-15 13:40:00+00', '2024-10-15 14:15:00+00'),
('fe2be2a3-3071-4e64-872e-12cfca44be16', '735565c1-93d9-4813-b227-3d9c06b78c8f', '2024-12-12 15:25:00+00', '2024-12-12 16:00:00+00'),
('44d406db-cd58-468c-a4b3-076eb25a741d', '735565c1-93d9-4813-b227-3d9c06b78c8f', '2025-01-28 11:10:00+00', '2025-01-28 11:40:00+00'),

-- Normal4 activity sessions
('3199ee81-f40d-4d8b-8414-3b1bce552adf', '2333392a-7c07-4733-8b46-00d32833d9bc', '2025-04-20 16:15:00+00', '2025-04-20 16:50:00+00'),
('f440ed57-cd18-4908-9cdc-8a75b14cd5b8', '2333392a-7c07-4733-8b46-00d32833d9bc', '2025-06-25 09:30:00+00', '2025-06-25 10:05:00+00'),
('61ee27a6-0120-4194-a21e-54ed713cae63', '2333392a-7c07-4733-8b46-00d32833d9bc', '2025-07-15 13:45:00+00', '2025-07-15 14:20:00+00'),

-- Normal5 activity sessions
('4b8e0f4f-625b-4e49-b0c3-c91d6a598f2f', 'c922be05-e355-4052-8d3f-7774669ddd32', '2024-11-25 10:20:00+00', '2024-11-25 10:55:00+00'),
('48442004-db79-4579-909d-ba916588ba0e', 'c922be05-e355-4052-8d3f-7774669ddd32', '2025-01-15 14:40:00+00', '2025-01-15 15:15:00+00'),
('05f03188-608a-4af8-95d6-0e9439309217', 'c922be05-e355-4052-8d3f-7774669ddd32', '2025-03-08 12:25:00+00', '2025-03-08 13:00:00+00');

-- Test data for user responses to positions
INSERT INTO response (id, position_id, user_id, response, created_time) VALUES
-- Admin user responses (responding to 8 positions)
('8da832d8-2ebb-4d04-9806-b0c6c8a6b7f8', '4d0b2198-414e-4cf9-93a9-83033b81ce76', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'disagree', '2024-11-15 14:25:00+00'),
('b0d51dac-e7d6-4c3f-b088-8a019548fcb4', 'f7aeb957-a41a-4b1e-9482-6297f5f07743', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'agree', '2024-11-15 14:30:00+00'),
('909f7101-743b-4d88-8b24-23d0955398ae', '28028e9a-90b5-4b2a-9054-d3d446180df7', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'agree', '2024-11-15 14:35:00+00'),
('750d0925-929b-4655-8556-5ec629758496', 'f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'disagree', '2025-01-20 09:15:00+00'),
('f884771d-fada-4bc0-87fc-41d15a524c7c', '9c3219d3-78a0-496a-a58b-73d56c480b97', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'agree', '2025-01-20 09:20:00+00'),
('18026af5-5195-41c1-9b3f-fbcf2bd6e507', '23ca2c62-3f0f-4a95-bc68-5be76481da80', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'agree', '2025-01-20 09:25:00+00'),
('14c2156f-8425-4986-b193-3f099dfea5cd', '8352ed64-61bb-435f-88c5-f0404e964d25', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'pass', '2025-03-10 16:35:00+00'),
('7b7c6712-cb19-4d6c-ab33-78a4a940b030', '27f11a1f-2b0e-4358-8f0f-13c3aee18d70', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'agree', '2025-03-10 16:40:00+00'),

-- Moderator1 responses (responding to 10 positions)
('56791485-e0fe-4e03-bbae-4ea50fb28e44', '772d04ed-b2ad-4f95-a630-c739811fa615', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'disagree', '2024-12-20 10:20:00+00'),
('7214dd60-3465-4fa6-870a-7198a0e9b9f2', 'f7aeb957-a41a-4b1e-9482-6297f5f07743', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2024-12-20 10:25:00+00'),
('1ae656f4-7674-49fa-898c-10a914d4955b', '28028e9a-90b5-4b2a-9054-d3d446180df7', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2024-12-20 10:30:00+00'),
('b93b9f01-f89d-4392-ad5c-a86509ae7a5a', 'f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2024-12-20 10:35:00+00'),
('4114294a-6427-440e-8041-73bcd3048740', '9c3219d3-78a0-496a-a58b-73d56c480b97', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'disagree', '2024-12-20 10:40:00+00'),
('9ff20d8a-581e-4a76-a4bf-ad6f05b64d4f', '23ca2c62-3f0f-4a95-bc68-5be76481da80', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'pass', '2025-02-15 13:25:00+00'),
('9e2f7976-ce04-486f-80f1-02fc7425c6cd', '8352ed64-61bb-435f-88c5-f0404e964d25', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'disagree', '2025-02-15 13:30:00+00'),
('d3dda13b-785f-410b-b81f-c87f4e945382', '27f11a1f-2b0e-4358-8f0f-13c3aee18d70', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2025-02-15 13:35:00+00'),
('9acc365e-b4e9-42ce-9319-e4995b830a3a', 'ff30d27b-c18e-48a9-9eb2-ca99cf9fd75e', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'disagree', '2025-04-05 11:15:00+00'),
('d7c67a4e-5e91-4052-bdb9-cd46eb9f6585', 'fa017574-9db8-426c-8e11-ef8c83d7d5c1', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2025-04-05 11:20:00+00'),

-- Moderator2 responses (responding to 12 positions)
('c28f8fd7-2f61-4fb9-801e-5c9116cb180d', '772d04ed-b2ad-4f95-a630-c739811fa615', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-01-10 15:50:00+00'),
('db3c495e-0c27-4669-9f84-87c9281afbfc', '4d0b2198-414e-4cf9-93a9-83033b81ce76', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'disagree', '2025-01-10 15:55:00+00'),
('1ed3f698-a885-4125-88cd-cb5e49e4344d', 'f7aeb957-a41a-4b1e-9482-6297f5f07743', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-01-10 16:00:00+00'),
('036e83cf-3dc2-4125-bc79-7bc38c04f756', '28028e9a-90b5-4b2a-9054-d3d446180df7', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-01-10 16:05:00+00'),
('1a21a11c-a962-45ed-a71b-450593802c30', 'd3232838-0433-421f-abef-453dd5a5f2e0', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'pass', '2025-01-10 16:10:00+00'),
('093a12e8-b825-47a4-b85b-751007414efb', 'f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'disagree', '2025-01-10 16:15:00+00'),
('67b9b423-6c63-4c8a-86c3-33dc110a600b', '23ca2c62-3f0f-4a95-bc68-5be76481da80', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-03-25 08:35:00+00'),
('37f4c5ca-e158-4144-9567-0d68f4bff79d', '8352ed64-61bb-435f-88c5-f0404e964d25', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'pass', '2025-03-25 08:40:00+00'),
('3a26d6d1-08df-438f-b17e-98ffbddbb7ee', '27f11a1f-2b0e-4358-8f0f-13c3aee18d70', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-03-25 08:45:00+00'),
('8cc6fd24-5677-4e39-ac7f-1b92c476a9f4', 'fa017574-9db8-426c-8e11-ef8c83d7d5c1', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-03-25 08:50:00+00'),
('71860cab-f97e-45d3-9f6d-33fe60b37a84', '24790103-92a4-4fd2-b270-6a65a44ad91e', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'disagree', '2025-05-20 14:20:00+00'),
('213528fe-8dc3-4008-b022-10541163edcf', '4f315b6a-9b23-4b1c-8443-f8df6c7d3cae', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-05-20 14:25:00+00'),

-- Normal1 responses (responding to 11 positions)
('b9fc2c05-f181-4327-829a-bf5c8835e944', '772d04ed-b2ad-4f95-a630-c739811fa615', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2024-11-05 12:35:00+00'),
('1e3f4dcb-7f05-4c0c-9623-37408f9011c4', '4d0b2198-414e-4cf9-93a9-83033b81ce76', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'disagree', '2024-11-05 12:40:00+00'),
('226f0e91-65ed-44a9-95c5-231f93927a9b', '28028e9a-90b5-4b2a-9054-d3d446180df7', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2024-11-05 12:45:00+00'),
('305a24c9-e5ac-4ac1-9830-1e1331535359', 'd3232838-0433-421f-abef-453dd5a5f2e0', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2024-11-05 12:50:00+00'),
('bc91c119-de3d-44b4-9549-83bae3a23c76', 'f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'disagree', '2024-11-05 12:55:00+00'),
('79570656-5fc7-4a51-86fb-94f43c8794d4', '9c3219d3-78a0-496a-a58b-73d56c480b97', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2024-11-05 13:00:00+00'),
('2fb190b1-2105-4fe7-8926-812e90288bdc', '8352ed64-61bb-435f-88c5-f0404e964d25', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'pass', '2024-12-28 16:25:00+00'),
('4dc3048c-dab7-4691-8b95-94f18b1362b8', '27f11a1f-2b0e-4358-8f0f-13c3aee18d70', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2024-12-28 16:30:00+00'),
('780c81c8-d80d-445f-8170-de918eae6747', 'ff30d27b-c18e-48a9-9eb2-ca99cf9fd75e', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2024-12-28 16:35:00+00'),
('8a75c7e8-141b-4d62-ac54-edee6ba97885', 'fa017574-9db8-426c-8e11-ef8c83d7d5c1', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2025-02-10 11:20:00+00'),
('df6480e9-4141-4c2f-acf6-32da5eda768c', '24790103-92a4-4fd2-b270-6a65a44ad91e', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'disagree', '2025-02-10 11:25:00+00'),

-- Normal2 responses (responding to 9 positions)
('92ae62eb-38eb-47ca-ab15-05f3a1985b0a', '772d04ed-b2ad-4f95-a630-c739811fa615', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-02-20 09:50:00+00'),
('5820d56c-ae9f-47ba-beb7-cc2a179830bb', '4d0b2198-414e-4cf9-93a9-83033b81ce76', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'disagree', '2025-02-20 09:55:00+00'),
('9a174503-508f-44f3-b7f6-a70c77c39fc3', 'f7aeb957-a41a-4b1e-9482-6297f5f07743', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-02-20 10:00:00+00'),
('5aa8ef50-f613-4414-a7ed-eac3108fe16c', 'd3232838-0433-421f-abef-453dd5a5f2e0', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'pass', '2025-02-20 10:05:00+00'),
('979832c8-0d52-4c38-bd85-5389d655024d', 'f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'disagree', '2025-02-20 10:10:00+00'),
('0b9e7523-e2f8-468b-b3d1-0089490d4397', '9c3219d3-78a0-496a-a58b-73d56c480b97', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-04-12 14:35:00+00'),
('e8b75010-9dc7-404c-a001-9d06d305e31d', '23ca2c62-3f0f-4a95-bc68-5be76481da80', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-04-12 14:40:00+00'),
('fe1171ea-be42-4849-9a8f-dc5eda17f3fb', '27f11a1f-2b0e-4358-8f0f-13c3aee18d70', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-04-12 14:45:00+00'),
('3505131d-7baf-42cc-afb5-9399d1f55a04', 'ff30d27b-c18e-48a9-9eb2-ca99cf9fd75e', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-06-08 10:25:00+00'),

-- Normal3 responses (responding to 13 positions)
('9f063f00-afda-42e4-bf00-e51098089b4a', '772d04ed-b2ad-4f95-a630-c739811fa615', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2024-10-15 13:45:00+00'),
('cf9a1feb-0210-42b5-b02e-abd7317482a2', '4d0b2198-414e-4cf9-93a9-83033b81ce76', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'disagree', '2024-10-15 13:50:00+00'),
('e783f249-7d5d-44ab-8feb-a73f3486f315', 'f7aeb957-a41a-4b1e-9482-6297f5f07743', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2024-10-15 13:55:00+00'),
('d6449fef-5b44-488f-b91e-2dca14112576', '28028e9a-90b5-4b2a-9054-d3d446180df7', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2024-10-15 14:00:00+00'),
('74f2d427-f854-4c50-8ad0-805c469ae34a', 'd3232838-0433-421f-abef-453dd5a5f2e0', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2024-10-15 14:05:00+00'),
('e08e9ce1-107f-4e9f-915b-8cae12a2bd59', 'f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'disagree', '2024-10-15 14:10:00+00'),
('a7677854-3316-4f9d-9871-960680b47988', '9c3219d3-78a0-496a-a58b-73d56c480b97', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2024-12-12 15:30:00+00'),
('c44d5ee8-e3dd-47bc-a8dd-e1c90115ed5d', '23ca2c62-3f0f-4a95-bc68-5be76481da80', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2024-12-12 15:35:00+00'),
('b00bcf1b-6e95-4bb5-8b8a-b0e8e6e55a84', '8352ed64-61bb-435f-88c5-f0404e964d25', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'pass', '2024-12-12 15:40:00+00'),
('7eb8cae9-0c82-452a-a23a-2b1b78fa5616', '27f11a1f-2b0e-4358-8f0f-13c3aee18d70', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2024-12-12 15:45:00+00'),
('482b3a95-4a3d-4333-a4a3-2d2390941e67', 'ff30d27b-c18e-48a9-9eb2-ca99cf9fd75e', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2024-12-12 15:50:00+00'),
('ad93eaf6-a5ca-4f56-80fc-d5b3b449f15f', 'fa017574-9db8-426c-8e11-ef8c83d7d5c1', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2025-01-28 11:15:00+00'),
('0642f954-2f96-4cd6-81e6-155543815b66', '24790103-92a4-4fd2-b270-6a65a44ad91e', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'disagree', '2025-01-28 11:20:00+00'),

-- Normal4 responses (responding to 7 positions)
('c39e8d6c-4380-495d-9751-d29bf397a474', '772d04ed-b2ad-4f95-a630-c739811fa615', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-04-20 16:20:00+00'),
('b0e0b463-8b85-4246-a1e9-7ef67994d689', '4d0b2198-414e-4cf9-93a9-83033b81ce76', '2333392a-7c07-4733-8b46-00d32833d9bc', 'disagree', '2025-04-20 16:25:00+00'),
('641e48dc-7637-4f53-b342-15d7725b7bc0', 'f7aeb957-a41a-4b1e-9482-6297f5f07743', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-04-20 16:30:00+00'),
('6967a127-391b-406d-bc78-528bd1971ec6', '28028e9a-90b5-4b2a-9054-d3d446180df7', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-04-20 16:35:00+00'),
('883212d1-a56e-43e0-8d4c-4bc3bf2331f3', 'f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', '2333392a-7c07-4733-8b46-00d32833d9bc', 'disagree', '2025-06-25 09:35:00+00'),
('eb631554-4677-4ebe-b35d-3bfa5f9eaf33', '9c3219d3-78a0-496a-a58b-73d56c480b97', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-06-25 09:40:00+00'),
('70a854a2-1626-4eca-bd6f-d6ae5276dd3e', '23ca2c62-3f0f-4a95-bc68-5be76481da80', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-07-15 13:50:00+00'),

-- Normal5 responses (responding to 14 positions)
('642b4b35-b9b7-4e5d-bf12-c50c1615e2f6', '772d04ed-b2ad-4f95-a630-c739811fa615', 'c922be05-e355-4052-8d3f-7774669ddd32', 'disagree', '2024-11-25 10:25:00+00'),
('ac864644-7442-4fd3-8227-c6287a242111', '4d0b2198-414e-4cf9-93a9-83033b81ce76', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2024-11-25 10:30:00+00'),
('854d1e1b-8bd5-402a-afb3-f9162fb193b7', 'f7aeb957-a41a-4b1e-9482-6297f5f07743', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2024-11-25 10:35:00+00'),
('fc4bcfb3-a330-460f-be19-cb0d57aa00e7', '28028e9a-90b5-4b2a-9054-d3d446180df7', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2024-11-25 10:40:00+00'),
('c57dcd05-b10a-4188-8857-953b278f50ac', 'd3232838-0433-421f-abef-453dd5a5f2e0', 'c922be05-e355-4052-8d3f-7774669ddd32', 'pass', '2024-11-25 10:45:00+00'),
('2e2a10aa-42fd-4917-a981-7a559f9e5218', '9c3219d3-78a0-496a-a58b-73d56c480b97', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2024-11-25 10:50:00+00'),
('48461c90-e206-4b13-8b94-1309b8964b51', '23ca2c62-3f0f-4a95-bc68-5be76481da80', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2025-01-15 14:45:00+00'),
('09567112-af9f-43ab-8f50-cf807fefb232', '8352ed64-61bb-435f-88c5-f0404e964d25', 'c922be05-e355-4052-8d3f-7774669ddd32', 'pass', '2025-01-15 14:50:00+00'),
('7a50d779-55ec-46e9-a549-a382f45191ce', 'ff30d27b-c18e-48a9-9eb2-ca99cf9fd75e', 'c922be05-e355-4052-8d3f-7774669ddd32', 'disagree', '2025-01-15 14:55:00+00'),
('b8c95611-c6a1-4edf-a7ea-8610b057fe14', 'fa017574-9db8-426c-8e11-ef8c83d7d5c1', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2025-01-15 15:00:00+00'),
('33098625-64a4-4183-8731-ecfa347a11eb', '24790103-92a4-4fd2-b270-6a65a44ad91e', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2025-01-15 15:05:00+00'),
('03225e00-b92c-4d55-911a-6ee151b9f519', '4f315b6a-9b23-4b1c-8443-f8df6c7d3cae', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2025-01-15 15:10:00+00'),
('2e47e2cb-9185-4a43-b950-7f2cf2cceb2d', '188865ae-0b16-499c-b3cb-1ede81a14518', 'c922be05-e355-4052-8d3f-7774669ddd32', 'pass', '2025-03-08 12:30:00+00'),
('9edee461-1cf9-4a09-a3ad-b9d3b9508bf9', '20fabff1-a37a-4941-8bc8-4f082da6a189', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2025-03-08 12:35:00+00'),

-- Additional user activity sessions for more responses
('5c00ee6b-fbd4-4c8e-a2f0-4b9bc3a60587', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '2025-05-10 10:15:00+00', '2025-05-10 10:45:00+00'),
('f78e1d94-bcf3-447a-8b62-c60571b8272d', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '2025-06-12 14:20:00+00', '2025-06-12 14:55:00+00'),
('cf850f67-5ec1-4766-b07f-faf6109eb042', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '2025-07-08 09:30:00+00', '2025-07-08 10:10:00+00'),
('d21796d0-4acf-4db2-92c1-d280ce9e5abc', '6c9344ed-0313-4b25-a616-5ac08967e84f', '2025-03-15 16:45:00+00', '2025-03-15 17:20:00+00'),
('2ed4b81b-a4a6-4b6e-8f5c-6f151239ab5a', '4a67d0e6-56a4-4396-916b-922d27db71d8', '2025-07-20 11:10:00+00', '2025-07-20 11:50:00+00'),
('c40d543e-be6a-4bff-a6f5-9f438a0d2fa5', '735565c1-93d9-4813-b227-3d9c06b78c8f', '2025-03-20 13:25:00+00', '2025-03-20 14:00:00+00'),
('7a25b912-bbf3-4d36-acd3-5e9946d721ec', '2333392a-7c07-4733-8b46-00d32833d9bc', '2025-08-05 15:30:00+00', '2025-08-05 16:05:00+00'),
('19cb7b39-18a3-43be-a3a7-cdf07a72342a', 'c922be05-e355-4052-8d3f-7774669ddd32', '2025-05-25 12:40:00+00', '2025-05-25 13:15:00+00'),

-- Additional user responses to positions
-- Admin user additional responses (8 more)
('975206d0-23b0-429d-943e-359772eeb907', '9ebe265e-1429-473a-8d27-7313997ffe88', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'agree', '2025-05-10 10:20:00+00'),
('15e2401a-a6a6-415f-91c5-cc8a6f269d2f', '038653a6-1008-4acf-a31b-8ebc31b3611d', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'agree', '2025-05-10 10:25:00+00'),
('742a2efd-afee-4581-9dcf-c455295c14e0', '2e3afe8d-1b4a-4a09-bcc1-965a43abf666', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'agree', '2025-05-10 10:30:00+00'),
('6b1522ca-265a-47f8-99bc-7c6b3ff75133', '4eb36f7a-5f7d-4c9f-9837-0b20f35fe0a9', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'agree', '2025-05-10 10:35:00+00'),
('73e1d949-b762-4a43-b045-be610a6fe9e8', '51679257-5218-46e9-b291-ab02cd2d57fd', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'pass', '2025-05-10 10:40:00+00'),
('3319f229-2bcf-4cad-8224-808de6424389', 'da947f66-41f4-4fb5-bab7-342015205947', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'disagree', '2025-05-10 10:42:00+00'),
('3ed60c06-d9c5-4a9c-b8d1-ec61c48e73d8', '1ae82e39-d2a0-4047-b3e6-3bb71774eaa5', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'agree', '2025-05-10 10:44:00+00'),
('a9fd46a9-cbe8-4e76-8496-40b9d193e729', '7a8282a2-b011-4740-87ab-f42a425851ea', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'disagree', '2025-05-10 10:46:00+00'),

-- Moderator1 additional responses (12 more)
('b9c0b090-87a1-4db4-9b1c-213cd3cceac0', '4f315b6a-9b23-4b1c-8443-f8df6c7d3cae', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2025-06-12 14:25:00+00'),
('bdf14aad-7b9a-45aa-8ce2-0ae2d220837c', '188865ae-0b16-499c-b3cb-1ede81a14518', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'pass', '2025-06-12 14:30:00+00'),
('45ff2b8f-b4a5-4479-8e74-065088cb2d87', '20fabff1-a37a-4941-8bc8-4f082da6a189', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2025-06-12 14:35:00+00'),
('5acf758f-387d-4892-8b69-f271bd50e2f4', 'c0d14b0f-370c-4f4f-8d7b-d7eed193af14', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'disagree', '2025-06-12 14:40:00+00'),
('ceaea9a9-e7d1-497f-a285-0c50b431d8d8', '993634d7-ad78-4870-8d5e-43e1008da1e8', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2025-06-12 14:45:00+00'),
('33f0e0e0-7c9a-49ec-a263-f3e32335a875', '2c291423-f26b-4502-8e47-54b938785d66', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'pass', '2025-06-12 14:47:00+00'),
('82c0a23f-3443-466b-a53f-12828289868d', '9ebe265e-1429-473a-8d27-7313997ffe88', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'disagree', '2025-06-12 14:49:00+00'),
('79703b3f-c452-44d8-a680-debfb8ecc052', '038653a6-1008-4acf-a31b-8ebc31b3611d', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2025-06-12 14:51:00+00'),
('6df4cfe6-e9bc-441f-a8fc-fadd278c1dd4', '2e3afe8d-1b4a-4a09-bcc1-965a43abf666', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2025-06-12 14:53:00+00'),
('46bc39a5-073a-4aa1-9202-625b8a89be0c', '4eb36f7a-5f7d-4c9f-9837-0b20f35fe0a9', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'agree', '2025-06-12 14:55:00+00'),
('caa530f5-8ab5-48c1-bc7e-f37aa9de07be', '51679257-5218-46e9-b291-ab02cd2d57fd', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'pass', '2025-06-12 14:57:00+00'),
('953a87b9-dc1d-44c8-81a3-9d43518f81b8', 'da947f66-41f4-4fb5-bab7-342015205947', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', 'disagree', '2025-06-12 14:59:00+00'),

-- Moderator2 additional responses (10 more)
('1540fa45-95da-4b41-a703-18713a797e54', '9ebe265e-1429-473a-8d27-7313997ffe88', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-07-08 09:35:00+00'),
('7ec5bf31-890f-4337-abb4-e6c8512735ac', '038653a6-1008-4acf-a31b-8ebc31b3611d', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-07-08 09:40:00+00'),
('01bc2564-8ca5-4057-9779-921011a17000', '2e3afe8d-1b4a-4a09-bcc1-965a43abf666', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-07-08 09:45:00+00'),
('18547054-286e-4a2a-8d6f-597b4191eefb', '4eb36f7a-5f7d-4c9f-9837-0b20f35fe0a9', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-07-08 09:50:00+00'),
('d1342b85-94e9-44de-9141-521727ccedff', '51679257-5218-46e9-b291-ab02cd2d57fd', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'pass', '2025-07-08 09:55:00+00'),
('76ae99d8-6c2d-4a5c-b75e-1100002b106d', 'da947f66-41f4-4fb5-bab7-342015205947', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'disagree', '2025-07-08 10:00:00+00'),
('418653e8-a2ee-40ae-9bbd-ade3f420f971', 'b1b80da2-5299-4e40-92c7-afc57d849a87', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-07-08 10:02:00+00'),
('ee80d984-2aac-40b4-836f-593ce577d042', '60b28e32-8fe8-4c96-8b64-552f16c76043', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-07-08 10:04:00+00'),
('8f4d0e9f-eb28-4aca-96f2-24fd3ceb25cf', '32fa7813-adb5-41bb-9bea-3e92b98851af', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'agree', '2025-07-08 10:06:00+00'),
('a6134632-4426-4cee-b8c5-75727a68250f', '4b15f919-3b0b-44fa-a1ab-5edace80f7d1', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'pass', '2025-07-08 10:08:00+00'),

-- Normal1 additional responses (9 more)
('02455a4c-c11a-4309-9155-7b8fceb54cb3', '9ebe265e-1429-473a-8d27-7313997ffe88', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2025-03-15 16:50:00+00'),
('7f404e51-6056-4a87-a80f-4667f6d470ec', '2e3afe8d-1b4a-4a09-bcc1-965a43abf666', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2025-03-15 16:55:00+00'),
('1f0c7e6d-b6fa-40df-b62f-f37b5fe43318', '4eb36f7a-5f7d-4c9f-9837-0b20f35fe0a9', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2025-03-15 17:00:00+00'),
('8657d8f0-a444-4493-8692-3ac810f4fc26', '51679257-5218-46e9-b291-ab02cd2d57fd', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'pass', '2025-03-15 17:05:00+00'),
('dd10b83f-0e45-4e0e-969f-770f2dde728c', 'da947f66-41f4-4fb5-bab7-342015205947', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'disagree', '2025-03-15 17:10:00+00'),
('ddb475a9-df7e-465f-ad4f-abfe422754fe', '1ae82e39-d2a0-4047-b3e6-3bb71774eaa5', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2025-03-15 17:12:00+00'),
('2c04bd4c-bb16-4ef3-9c0a-b90182033ddb', '05c8142d-15f5-469a-a34d-2eae28aed686', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2025-03-15 17:14:00+00'),
('2b2d197d-acdf-4e22-87f5-7925d65cc03b', '7a8282a2-b011-4740-87ab-f42a425851ea', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'disagree', '2025-03-15 17:16:00+00'),
('73756af8-61c1-4d02-b3a2-017500581cfe', 'b1b80da2-5299-4e40-92c7-afc57d849a87', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'agree', '2025-03-15 17:18:00+00'),

-- Normal2 additional responses (11 more)
('e709e87f-fa60-4743-8ea5-4ce185579423', '9ebe265e-1429-473a-8d27-7313997ffe88', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-07-20 11:15:00+00'),
('cc9c5450-a51c-4ecc-af8f-0699fdf9ac8d', '038653a6-1008-4acf-a31b-8ebc31b3611d', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-07-20 11:20:00+00'),
('e0c12bb1-eb00-4e0c-ac0f-ac2617224aec', '4eb36f7a-5f7d-4c9f-9837-0b20f35fe0a9', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-07-20 11:25:00+00'),
('2e04506a-11f6-42e4-a82f-cb536a8444e6', '51679257-5218-46e9-b291-ab02cd2d57fd', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'pass', '2025-07-20 11:30:00+00'),
('7b03bb5b-1fa6-4cc7-86c4-7fb3a11c8d63', 'da947f66-41f4-4fb5-bab7-342015205947', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'disagree', '2025-07-20 11:35:00+00'),
('b293fd72-98f3-4e31-9245-5f6b4457404c', '1ae82e39-d2a0-4047-b3e6-3bb71774eaa5', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-07-20 11:40:00+00'),
('cc74149f-3147-4260-95ed-e15da5f9d900', '05c8142d-15f5-469a-a34d-2eae28aed686', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-07-20 11:42:00+00'),
('f790cc52-cf0c-4060-ba30-250306434cfd', '7a8282a2-b011-4740-87ab-f42a425851ea', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'disagree', '2025-07-20 11:44:00+00'),
('6cf793a8-097b-4cdd-8e9e-15e9a1f7d518', '8a3d4804-612c-444b-838e-2cc048081c3f', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-07-20 11:46:00+00'),
('4fe5bd34-87cc-4044-9254-2ff2dd9c70bd', '60b28e32-8fe8-4c96-8b64-552f16c76043', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-07-20 11:48:00+00'),
('0268ed5c-8f76-4890-871e-ee2db7215640', '32fa7813-adb5-41bb-9bea-3e92b98851af', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'agree', '2025-07-20 11:50:00+00'),

-- Normal3 additional responses (7 more)
('7024b13d-6da5-4e06-bd00-6c96b8fa67fd', '9ebe265e-1429-473a-8d27-7313997ffe88', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2025-03-20 13:30:00+00'),
('087a49f4-4af9-4542-be20-f9d0fffeb2c2', '038653a6-1008-4acf-a31b-8ebc31b3611d', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2025-03-20 13:35:00+00'),
('7e2711e1-ced9-4f25-93ee-41fb73617be0', '2e3afe8d-1b4a-4a09-bcc1-965a43abf666', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2025-03-20 13:40:00+00'),
('c4de3cc7-e44e-4ede-9410-ac1306a5b690', '51679257-5218-46e9-b291-ab02cd2d57fd', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'pass', '2025-03-20 13:45:00+00'),
('f1053c43-c783-4ad5-a6c5-f7520f9b8f44', 'da947f66-41f4-4fb5-bab7-342015205947', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'disagree', '2025-03-20 13:50:00+00'),
('61e38c7e-3e45-48d8-92ba-40c82c01840a', '1ae82e39-d2a0-4047-b3e6-3bb71774eaa5', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2025-03-20 13:55:00+00'),
('a89c1666-d9b9-4cf9-9146-9464d3d1ae45', '05c8142d-15f5-469a-a34d-2eae28aed686', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'agree', '2025-03-20 13:58:00+00'),

-- Normal4 additional responses (13 more)
('831c50e2-9259-4b31-928e-6d27d4f095ef', '9ebe265e-1429-473a-8d27-7313997ffe88', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-08-05 15:35:00+00'),
('e9b6a1b0-59cb-4c48-ab8e-634fe3d1afec', '038653a6-1008-4acf-a31b-8ebc31b3611d', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-08-05 15:40:00+00'),
('a086a1dc-6c45-4db8-b4c9-3dc87db80675', '2e3afe8d-1b4a-4a09-bcc1-965a43abf666', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-08-05 15:45:00+00'),
('7d2a4a00-5b37-461b-be7b-3f98877515c4', '4eb36f7a-5f7d-4c9f-9837-0b20f35fe0a9', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-08-05 15:50:00+00'),
('f6b15380-2ebc-4033-ad4d-83a463dd59eb', '51679257-5218-46e9-b291-ab02cd2d57fd', '2333392a-7c07-4733-8b46-00d32833d9bc', 'pass', '2025-08-05 15:52:00+00'),
('37ca2f86-c149-4fb7-96e6-2dac7d79b489', 'da947f66-41f4-4fb5-bab7-342015205947', '2333392a-7c07-4733-8b46-00d32833d9bc', 'disagree', '2025-08-05 15:54:00+00'),
('061742d4-46a4-48f2-add0-71c4caf34999', '1ae82e39-d2a0-4047-b3e6-3bb71774eaa5', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-08-05 15:56:00+00'),
('78f9df74-da54-4502-9eec-21d404db7e25', '05c8142d-15f5-469a-a34d-2eae28aed686', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-08-05 15:58:00+00'),
('88ce1ee1-2a95-4a91-aaa7-3d1f3eb3b1bd', '7a8282a2-b011-4740-87ab-f42a425851ea', '2333392a-7c07-4733-8b46-00d32833d9bc', 'disagree', '2025-08-05 16:00:00+00'),
('bc10eecd-d561-4f77-b56f-76992668eaf7', '8a3d4804-612c-444b-838e-2cc048081c3f', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-08-05 16:02:00+00'),
('267c7bc4-a372-46ad-a48f-e3418505edb4', 'b1b80da2-5299-4e40-92c7-afc57d849a87', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-08-05 16:04:00+00'),
('ca7a722e-b078-43de-a5e3-70aeb6036ab8', '60b28e32-8fe8-4c96-8b64-552f16c76043', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-08-05 16:06:00+00'),
('9f0f8433-98d3-4ea8-9143-6597b2680d0f', '32fa7813-adb5-41bb-9bea-3e92b98851af', '2333392a-7c07-4733-8b46-00d32833d9bc', 'agree', '2025-08-05 16:08:00+00'),

-- Normal5 additional responses (6 more)
('f4d44ccf-c77a-4945-aa4d-8bd4d1cae757', '9ebe265e-1429-473a-8d27-7313997ffe88', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2025-05-25 12:45:00+00'),
('100546cf-0bd2-4e70-a90b-9a0f7a6cd5cb', '038653a6-1008-4acf-a31b-8ebc31b3611d', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2025-05-25 12:50:00+00'),
('1d903023-2baf-4332-ab7f-0e46dbfc2082', '2e3afe8d-1b4a-4a09-bcc1-965a43abf666', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2025-05-25 12:55:00+00'),
('8124e9b5-0e78-440c-b9da-2dcc41087727', '51679257-5218-46e9-b291-ab02cd2d57fd', 'c922be05-e355-4052-8d3f-7774669ddd32', 'pass', '2025-05-25 13:00:00+00'),
('ffd63f1e-874b-404a-98c6-b3fba825ce04', '1ae82e39-d2a0-4047-b3e6-3bb71774eaa5', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2025-05-25 13:05:00+00'),
('d2649f0e-308e-46e9-b740-9d0a7db73991', '05c8142d-15f5-469a-a34d-2eae28aed686', 'c922be05-e355-4052-8d3f-7774669ddd32', 'agree', '2025-05-25 13:10:00+00');

