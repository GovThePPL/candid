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
('772d04ed-b2ad-4f95-a630-c739811fa615', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Universal healthcare should be a fundamental right guaranteed by the government.', '2024-10-15 09:30:00+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('4d0b2198-414e-4cf9-93a9-83033b81ce76', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Private healthcare markets provide better quality care than government-run systems.', '2024-12-01 16:45:12+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('f7aeb957-a41a-4b1e-9482-6297f5f07743', '6c9344ed-0313-4b25-a616-5ac08967e84f', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Prescription drug prices should be regulated by the federal government.', '2024-11-20 11:15:30+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('28028e9a-90b5-4b2a-9054-d3d446180df7', '4a67d0e6-56a4-4396-916b-922d27db71d8', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Mental health services should receive equal insurance coverage as physical health.', '2025-02-10 08:22:45+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('0bde4b83-a447-41ee-9b5e-4af2071cd9fc', '735565c1-93d9-4813-b227-3d9c06b78c8f', '4d439108-2128-46ec-b4b2-80ec3dbf6aa3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Abortion access should be protected as part of healthcare rights.', '2024-09-15 13:40:20+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Economy & Taxation positions
('d3232838-0433-421f-abef-453dd5a5f2e0', '2333392a-7c07-4733-8b46-00d32833d9bc', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Wealthy individuals and corporations should pay higher tax rates.', '2025-04-12 10:30:15+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('f3c1e31b-fa3a-4dbb-9404-2666830d8f6a', 'c922be05-e355-4052-8d3f-7774669ddd32', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Lower taxes stimulate economic growth and benefit everyone.', '2024-10-08 14:25:40+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('9c3219d3-78a0-496a-a58b-73d56c480b97', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'A universal basic income would reduce poverty and inequality.', '2025-01-20 09:15:25+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('03aba5c6-8dc8-4d6c-84e6-263aa7face03', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Free trade agreements benefit the global economy.', '2025-01-05 16:50:10+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('d61ccb9d-0b69-4eac-baf8-2f786d130535', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '63e233e9-187e-441f-a7a9-f5f44dffadf0', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The minimum wage should be raised to $15 per hour nationally.', '2025-02-28 12:35:55+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Education positions
('23ca2c62-3f0f-4a95-bc68-5be76481da80', '6c9344ed-0313-4b25-a616-5ac08967e84f', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Public college tuition should be free for all students.', '2024-12-10 15:20:30+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('8352ed64-61bb-435f-88c5-f0404e964d25', '4a67d0e6-56a4-4396-916b-922d27db71d8', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'School choice and voucher programs improve educational outcomes.', '2025-03-15 11:45:20+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('efb3123c-6b67-44cf-b9d1-f8dfeca6915a', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Critical race theory should be taught in public schools.', '2024-11-05 08:30:45+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('939c6a46-4e79-411b-9de1-8e0874d73142', '2333392a-7c07-4733-8b46-00d32833d9bc', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Student loan debt should be forgiven by the federal government.', '2025-05-20 14:10:15+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('27f11a1f-2b0e-4358-8f0f-13c3aee18d70', 'c922be05-e355-4052-8d3f-7774669ddd32', 'be3305f5-df1a-4cf5-855e-49a88ed3cbd3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Teachers should be paid significantly higher salaries.', '2024-12-20 10:25:40+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Environment & Climate positions
('ff30d27b-c18e-48a9-9eb2-ca99cf9fd75e', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The government should implement a carbon tax to combat climate change.', '2025-03-10 13:15:25+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('fa017574-9db8-426c-8e11-ef8c83d7d5c1', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Nuclear energy is essential for reducing carbon emissions.', '2025-02-18 09:40:50+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('24790103-92a4-4fd2-b270-6a65a44ad91e', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Renewable energy subsidies should be eliminated.', '2025-01-12 16:20:35+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('4f315b6a-9b23-4b1c-8443-f8df6c7d3cae', '6c9344ed-0313-4b25-a616-5ac08967e84f', '66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The Paris Climate Agreement should be strengthened with binding targets.', '2024-11-25 12:55:10+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('188865ae-0b16-499c-b3cb-1ede81a14518', '4a67d0e6-56a4-4396-916b-922d27db71d8', '66344e48-ecfe-4b7f-aa33-fe05e0d08873', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Fracking should be banned to protect the environment.', '2025-04-05 11:30:25+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Immigration positions
('20fabff1-a37a-4941-8bc8-4f082da6a189', '735565c1-93d9-4813-b227-3d9c06b78c8f', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'A path to citizenship should be provided for undocumented immigrants.', '2024-10-30 15:45:20+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('c0d14b0f-370c-4f4f-8d7b-d7eed193af14', '2333392a-7c07-4733-8b46-00d32833d9bc', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Border security should be the top immigration priority.', '2025-06-15 08:20:45+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('993634d7-ad78-4870-8d5e-43e1008da1e8', 'c922be05-e355-4052-8d3f-7774669ddd32', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The US should accept more refugees from war-torn countries.', '2025-01-08 14:35:30+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('727265d3-5cf0-4258-83d8-223a0a881936', '010f84ad-0abd-4352-a7b3-7f9b95d51983', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Sanctuary cities should lose federal funding.', '2025-04-22 10:15:55+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('2c291423-f26b-4502-8e47-54b938785d66', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', 'e2e608f7-169e-409b-9678-6dee57fab9c3', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Merit-based immigration systems are fairer than family-based systems.', '2025-03-28 13:50:40+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Criminal Justice positions
('9ebe265e-1429-473a-8d27-7313997ffe88', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '04edc480-aded-4b93-94c4-d62cbb507dc4', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The death penalty should be abolished nationwide.', '2025-02-05 09:25:15+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('038653a6-1008-4acf-a31b-8ebc31b3611d', '6c9344ed-0313-4b25-a616-5ac08967e84f', '04edc480-aded-4b93-94c4-d62cbb507dc4', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Police departments should be defunded and resources redirected to social services.', '2024-12-15 16:40:25+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('2e3afe8d-1b4a-4a09-bcc1-965a43abf666', '4a67d0e6-56a4-4396-916b-922d27db71d8', '04edc480-aded-4b93-94c4-d62cbb507dc4', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Mandatory minimum sentencing laws should be repealed.', '2025-04-18 12:15:50+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('4eb36f7a-5f7d-4c9f-9837-0b20f35fe0a9', '735565c1-93d9-4813-b227-3d9c06b78c8f', '04edc480-aded-4b93-94c4-d62cbb507dc4', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Drug possession should be decriminalized and treated as a health issue.', '2024-12-05 11:30:35+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('51679257-5218-46e9-b291-ab02cd2d57fd', '2333392a-7c07-4733-8b46-00d32833d9bc', '04edc480-aded-4b93-94c4-d62cbb507dc4', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Private prisons should be eliminated from the justice system.', '2025-07-10 15:20:10+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Foreign Policy & Defense positions
('da947f66-41f4-4fb5-bab7-342015205947', 'c922be05-e355-4052-8d3f-7774669ddd32', '92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Military spending should be significantly reduced.', '2025-02-25 10:45:20+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('1ae82e39-d2a0-4047-b3e6-3bb71774eaa5', '010f84ad-0abd-4352-a7b3-7f9b95d51983', '92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'The US should maintain strong military presence globally.', '2025-05-08 14:30:45+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('05c8142d-15f5-469a-a34d-2eae28aed686', '0d4a5d0d-e845-49c2-99e2-1e7fe3c3ca0e', '92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'NATO should be strengthened to counter authoritarian threats.', '2025-04-30 08:15:30+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('7a8282a2-b011-4740-87ab-f42a425851ea', 'a443c4ff-86ab-4751-aec9-d9b23d7acb9c', '92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Foreign aid should be reduced to focus on domestic priorities.', '2025-03-20 13:25:55+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('8a3d4804-612c-444b-838e-2cc048081c3f', '6c9344ed-0313-4b25-a616-5ac08967e84f', '92d7131c-bf5c-40c1-89ef-e58b40e67bc8', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Drone warfare should be subject to stricter oversight and limitations.', '2025-01-18 16:50:15+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),

-- Civil Rights & Liberties positions
('b1b80da2-5299-4e40-92c7-afc57d849a87', '4a67d0e6-56a4-4396-916b-922d27db71d8', '2d83d6eb-3000-47eb-b136-9d1c44f9b98d', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Same-sex marriage should be protected as a constitutional right.', '2025-03-25 09:40:25+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('60b28e32-8fe8-4c96-8b64-552f16c76043', '735565c1-93d9-4813-b227-3d9c06b78c8f', '2d83d6eb-3000-47eb-b136-9d1c44f9b98d', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Voting rights should be expanded and protected from restrictions.', '2024-11-12 12:20:40+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
('32fa7813-adb5-41bb-9bea-3e92b98851af', '2333392a-7c07-4733-8b46-00d32833d9bc', '2d83d6eb-3000-47eb-b136-9d1c44f9b98d', 'ba5e3dcf-af51-47f4-941d-ee3448ee826a', 'Transgender individuals should have equal rights and protections.', '2025-06-02 15:35:50+00', '2025-08-10 14:22:33+00', 0, 0, 0, 0, 'active'),
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

