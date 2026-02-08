-- Pairwise Survey Test Data for Oregon
-- Creates surveys with category-appropriate labels and user responses based on ideological leanings

-- Oregon location ID
-- ba5e3dcf-af51-47f4-941d-ee3448ee826a

-- User political leanings (from basic.sql):
-- admin1: liberal
-- moderator1: conservative
-- moderator2: moderate
-- normal1: very_liberal
-- normal2: conservative
-- normal3: liberal
-- normal4: very_conservative
-- normal5: NULL (no lean)

-- Get user IDs for reference
DO $$
DECLARE
    v_admin1_id UUID;
    v_mod1_id UUID;
    v_mod2_id UUID;
    v_normal1_id UUID;
    v_normal2_id UUID;
    v_normal3_id UUID;
    v_normal4_id UUID;
    v_normal5_id UUID;

    -- Survey IDs
    v_all_categories_survey UUID;
    v_healthcare_survey UUID;
    v_economy_survey UUID;
    v_education_survey UUID;
    v_environment_survey UUID;
    v_immigration_survey UUID;

    -- Item IDs for all-categories survey (10 community labels)
    v_item_progressive UUID;
    v_item_liberal UUID;
    v_item_social_democrat UUID;
    v_item_socialist UUID;
    v_item_moderate UUID;
    v_item_centrist UUID;
    v_item_libertarian UUID;
    v_item_conservative UUID;
    v_item_populist UUID;
    v_item_traditionalist UUID;

    -- Item IDs for healthcare
    v_hc_universal UUID;
    v_hc_market UUID;
    v_hc_hybrid UUID;
    v_hc_staterun UUID;

    -- Item IDs for economy
    v_ec_freemarket UUID;
    v_ec_regulated UUID;
    v_ec_progressive_tax UUID;
    v_ec_flat_tax UUID;

    -- Item IDs for education
    v_ed_public UUID;
    v_ed_choice UUID;
    v_ed_charter UUID;
    v_ed_local UUID;

    -- Item IDs for environment
    v_env_green UUID;
    v_env_balanced UUID;
    v_env_business UUID;
    v_env_innovation UUID;

    -- Item IDs for immigration
    v_imm_pathway UUID;
    v_imm_enforcement UUID;
    v_imm_merit UUID;
    v_imm_compassionate UUID;

BEGIN
    -- Get user IDs
    SELECT id INTO v_admin1_id FROM users WHERE username = 'admin1';
    SELECT id INTO v_mod1_id FROM users WHERE username = 'moderator1';
    SELECT id INTO v_mod2_id FROM users WHERE username = 'moderator2';
    SELECT id INTO v_normal1_id FROM users WHERE username = 'normal1';
    SELECT id INTO v_normal2_id FROM users WHERE username = 'normal2';
    SELECT id INTO v_normal3_id FROM users WHERE username = 'normal3';
    SELECT id INTO v_normal4_id FROM users WHERE username = 'normal4';
    SELECT id INTO v_normal5_id FROM users WHERE username = 'normal5';

    -- ============================================
    -- ALL CATEGORIES SURVEY (general political identity labels)
    -- ============================================
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Oregon Community Labels',
        'pairwise',
        'Which label better describes your political views?',
        'active',
        'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
        NOW() - INTERVAL '7 days',
        NOW() + INTERVAL '30 days',
        NOW() - INTERVAL '7 days'
    ) RETURNING id INTO v_all_categories_survey;

    -- Items for all-categories survey (10 community labels spanning the political spectrum)
    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Progressive', 1)
    RETURNING id INTO v_item_progressive;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Liberal', 2)
    RETURNING id INTO v_item_liberal;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Social Democrat', 3)
    RETURNING id INTO v_item_social_democrat;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Socialist', 4)
    RETURNING id INTO v_item_socialist;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Moderate', 5)
    RETURNING id INTO v_item_moderate;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Centrist', 6)
    RETURNING id INTO v_item_centrist;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Libertarian', 7)
    RETURNING id INTO v_item_libertarian;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Conservative', 8)
    RETURNING id INTO v_item_conservative;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Populist', 9)
    RETURNING id INTO v_item_populist;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Traditionalist', 10)
    RETURNING id INTO v_item_traditionalist;

    -- Responses for all-categories survey (belief-coherent with 10 labels)
    -- admin1 (liberal): prefers Liberal, Progressive over right-leaning labels
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_admin1_id, v_item_liberal, v_item_conservative);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_admin1_id, v_item_progressive, v_item_traditionalist);

    -- normal1 (progressive): prefers Progressive, Social Democrat over right-leaning
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal1_id, v_item_progressive, v_item_conservative);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal1_id, v_item_social_democrat, v_item_populist);

    -- normal3 (liberal): prefers Liberal over Libertarian
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal3_id, v_item_liberal, v_item_libertarian);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal3_id, v_item_progressive, v_item_populist);

    -- mod1 (conservative): prefers Conservative, Libertarian over left-leaning
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_mod1_id, v_item_conservative, v_item_progressive);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_mod1_id, v_item_libertarian, v_item_socialist);

    -- normal2 (conservative): prefers Conservative over Socialist
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal2_id, v_item_conservative, v_item_socialist);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal2_id, v_item_centrist, v_item_progressive);

    -- normal4 (populist): prefers Populist, Traditionalist over left-leaning
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal4_id, v_item_populist, v_item_progressive);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal4_id, v_item_traditionalist, v_item_liberal);

    -- mod2 (moderate): prefers Moderate, Centrist
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_mod2_id, v_item_moderate, v_item_traditionalist);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_mod2_id, v_item_centrist, v_item_socialist);

    -- normal5 (centrist/no lean): prefers Centrist, Moderate
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal5_id, v_item_centrist, v_item_populist);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal5_id, v_item_moderate, v_item_socialist);

    -- ============================================
    -- HEALTHCARE SURVEY
    -- ============================================
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, position_category_id, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Healthcare Policy Labels',
        'pairwise',
        'Which label better describes your healthcare views?',
        'active',
        'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
        '4d439108-2128-46ec-b4b2-80ec3dbf6aa3',
        NOW() - INTERVAL '7 days',
        NOW() + INTERVAL '30 days',
        NOW() - INTERVAL '7 days'
    ) RETURNING id INTO v_healthcare_survey;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_healthcare_survey, 'Universal Coverage', 1)
    RETURNING id INTO v_hc_universal;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_healthcare_survey, 'Market-Based', 2)
    RETURNING id INTO v_hc_market;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_healthcare_survey, 'Public-Private Hybrid', 3)
    RETURNING id INTO v_hc_hybrid;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_healthcare_survey, 'State-Run System', 4)
    RETURNING id INTO v_hc_staterun;

    -- Liberal users prefer Universal Coverage / State-Run
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_healthcare_survey, v_admin1_id, v_hc_universal, v_hc_market);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_healthcare_survey, v_normal1_id, v_hc_staterun, v_hc_market);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_healthcare_survey, v_normal1_id, v_hc_universal, v_hc_hybrid);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_healthcare_survey, v_normal3_id, v_hc_universal, v_hc_market);

    -- Conservative users prefer Market-Based
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_healthcare_survey, v_mod1_id, v_hc_market, v_hc_universal);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_healthcare_survey, v_normal2_id, v_hc_market, v_hc_staterun);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_healthcare_survey, v_normal4_id, v_hc_market, v_hc_universal);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_healthcare_survey, v_normal4_id, v_hc_market, v_hc_hybrid);

    -- Moderate prefers Hybrid
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_healthcare_survey, v_mod2_id, v_hc_hybrid, v_hc_staterun);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_healthcare_survey, v_mod2_id, v_hc_hybrid, v_hc_market);

    -- ============================================
    -- ECONOMY SURVEY
    -- ============================================
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, position_category_id, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Economy & Tax Policy Labels',
        'pairwise',
        'Which label better describes your economic views?',
        'active',
        'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
        '63e233e9-187e-441f-a7a9-f5f44dffadf0',
        NOW() - INTERVAL '7 days',
        NOW() + INTERVAL '30 days',
        NOW() - INTERVAL '7 days'
    ) RETURNING id INTO v_economy_survey;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_economy_survey, 'Free Market', 1)
    RETURNING id INTO v_ec_freemarket;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_economy_survey, 'Regulated Economy', 2)
    RETURNING id INTO v_ec_regulated;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_economy_survey, 'Progressive Taxation', 3)
    RETURNING id INTO v_ec_progressive_tax;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_economy_survey, 'Low Taxes', 4)
    RETURNING id INTO v_ec_flat_tax;

    -- Liberal users prefer Regulated Economy / Progressive Taxation
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_economy_survey, v_admin1_id, v_ec_progressive_tax, v_ec_flat_tax);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_economy_survey, v_normal1_id, v_ec_regulated, v_ec_freemarket);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_economy_survey, v_normal3_id, v_ec_progressive_tax, v_ec_freemarket);

    -- Conservative users prefer Free Market / Low Taxes
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_economy_survey, v_mod1_id, v_ec_freemarket, v_ec_regulated);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_economy_survey, v_normal2_id, v_ec_flat_tax, v_ec_progressive_tax);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_economy_survey, v_normal4_id, v_ec_freemarket, v_ec_regulated);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_economy_survey, v_normal4_id, v_ec_flat_tax, v_ec_progressive_tax);

    -- Moderate sees merit in both
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_economy_survey, v_mod2_id, v_ec_regulated, v_ec_flat_tax);

    -- ============================================
    -- EDUCATION SURVEY
    -- ============================================
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, position_category_id, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Education Policy Labels',
        'pairwise',
        'Which label better describes your education views?',
        'active',
        'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
        'be3305f5-df1a-4cf5-855e-49a88ed3cbd3',
        NOW() - INTERVAL '7 days',
        NOW() + INTERVAL '30 days',
        NOW() - INTERVAL '7 days'
    ) RETURNING id INTO v_education_survey;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_education_survey, 'Public Schools First', 1)
    RETURNING id INTO v_ed_public;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_education_survey, 'School Choice', 2)
    RETURNING id INTO v_ed_choice;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_education_survey, 'Charter Schools', 3)
    RETURNING id INTO v_ed_charter;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_education_survey, 'Local Control', 4)
    RETURNING id INTO v_ed_local;

    -- Liberal users prefer Public Schools
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_education_survey, v_admin1_id, v_ed_public, v_ed_choice);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_education_survey, v_normal1_id, v_ed_public, v_ed_charter);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_education_survey, v_normal3_id, v_ed_public, v_ed_local);

    -- Conservative users prefer School Choice / Local Control
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_education_survey, v_mod1_id, v_ed_choice, v_ed_public);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_education_survey, v_normal2_id, v_ed_local, v_ed_public);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_education_survey, v_normal4_id, v_ed_choice, v_ed_public);

    -- Moderate sees value in charter schools
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_education_survey, v_mod2_id, v_ed_charter, v_ed_choice);

    -- ============================================
    -- ENVIRONMENT SURVEY
    -- ============================================
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, position_category_id, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Environment & Climate Labels',
        'pairwise',
        'Which label better describes your environmental views?',
        'active',
        'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
        '66344e48-ecfe-4b7f-aa33-fe05e0d08873',
        NOW() - INTERVAL '7 days',
        NOW() + INTERVAL '30 days',
        NOW() - INTERVAL '7 days'
    ) RETURNING id INTO v_environment_survey;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_environment_survey, 'Green New Deal', 1)
    RETURNING id INTO v_env_green;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_environment_survey, 'Balanced Approach', 2)
    RETURNING id INTO v_env_balanced;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_environment_survey, 'Business First', 3)
    RETURNING id INTO v_env_business;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_environment_survey, 'Innovation-Driven', 4)
    RETURNING id INTO v_env_innovation;

    -- Liberal users prefer Green New Deal
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_environment_survey, v_admin1_id, v_env_green, v_env_business);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_environment_survey, v_normal1_id, v_env_green, v_env_balanced);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_environment_survey, v_normal1_id, v_env_green, v_env_innovation);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_environment_survey, v_normal3_id, v_env_green, v_env_business);

    -- Conservative users prefer Business First / Innovation
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_environment_survey, v_mod1_id, v_env_business, v_env_green);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_environment_survey, v_normal2_id, v_env_innovation, v_env_green);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_environment_survey, v_normal4_id, v_env_business, v_env_green);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_environment_survey, v_normal4_id, v_env_business, v_env_balanced);

    -- Moderate prefers balanced
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_environment_survey, v_mod2_id, v_env_balanced, v_env_green);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_environment_survey, v_mod2_id, v_env_balanced, v_env_business);

    -- ============================================
    -- IMMIGRATION SURVEY
    -- ============================================
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, position_category_id, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Immigration Policy Labels',
        'pairwise',
        'Which label better describes your immigration views?',
        'active',
        'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
        'e2e608f7-169e-409b-9678-6dee57fab9c3',
        NOW() - INTERVAL '7 days',
        NOW() + INTERVAL '30 days',
        NOW() - INTERVAL '7 days'
    ) RETURNING id INTO v_immigration_survey;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_immigration_survey, 'Pathway to Citizenship', 1)
    RETURNING id INTO v_imm_pathway;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_immigration_survey, 'Border Enforcement', 2)
    RETURNING id INTO v_imm_enforcement;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_immigration_survey, 'Merit-Based', 3)
    RETURNING id INTO v_imm_merit;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_immigration_survey, 'Compassionate Reform', 4)
    RETURNING id INTO v_imm_compassionate;

    -- Liberal users prefer Pathway / Compassionate
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_admin1_id, v_imm_pathway, v_imm_enforcement);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_normal1_id, v_imm_compassionate, v_imm_enforcement);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_normal1_id, v_imm_pathway, v_imm_merit);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_normal3_id, v_imm_compassionate, v_imm_merit);

    -- Conservative users prefer Enforcement / Merit-Based
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_mod1_id, v_imm_enforcement, v_imm_pathway);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_normal2_id, v_imm_merit, v_imm_compassionate);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_normal4_id, v_imm_enforcement, v_imm_pathway);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_normal4_id, v_imm_enforcement, v_imm_compassionate);

    -- Moderate prefers merit-based
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_mod2_id, v_imm_merit, v_imm_enforcement);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_mod2_id, v_imm_merit, v_imm_pathway);

    -- normal5 random votes
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_immigration_survey, v_normal5_id, v_imm_pathway, v_imm_merit);

    -- ============================================
    -- CIVIL RIGHTS & LIBERTIES SURVEY
    -- ============================================
    DECLARE
        v_civil_rights_survey UUID;
        v_cr_rights_expansion UUID;
        v_cr_constitutional UUID;
        v_cr_balanced UUID;
        v_cr_civil_libertarian UUID;
    BEGIN
        INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, position_category_id, start_time, end_time, created_time)
        VALUES (
            uuid_generate_v4(),
            'Civil Rights Policy Labels',
            'pairwise',
            'Which label better describes your civil rights views?',
            'active',
            'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
            '2d83d6eb-3000-47eb-b136-9d1c44f9b98d',
            NOW() - INTERVAL '7 days',
            NOW() + INTERVAL '30 days',
            NOW() - INTERVAL '7 days'
        ) RETURNING id INTO v_civil_rights_survey;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_civil_rights_survey, 'Rights Expansion', 1)
        RETURNING id INTO v_cr_rights_expansion;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_civil_rights_survey, 'Constitutional Originalist', 2)
        RETURNING id INTO v_cr_constitutional;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_civil_rights_survey, 'Balanced Protection', 3)
        RETURNING id INTO v_cr_balanced;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_civil_rights_survey, 'Civil Libertarian', 4)
        RETURNING id INTO v_cr_civil_libertarian;

        -- Liberal users prefer Rights Expansion
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_civil_rights_survey, v_admin1_id, v_cr_rights_expansion, v_cr_constitutional);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_civil_rights_survey, v_normal1_id, v_cr_rights_expansion, v_cr_constitutional);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_civil_rights_survey, v_normal3_id, v_cr_rights_expansion, v_cr_balanced);

        -- Conservative users prefer Constitutional Originalist
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_civil_rights_survey, v_mod1_id, v_cr_constitutional, v_cr_rights_expansion);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_civil_rights_survey, v_normal2_id, v_cr_constitutional, v_cr_rights_expansion);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_civil_rights_survey, v_normal4_id, v_cr_constitutional, v_cr_rights_expansion);

        -- Moderate prefers Balanced
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_civil_rights_survey, v_mod2_id, v_cr_balanced, v_cr_constitutional);

        -- normal5 prefers Civil Libertarian
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_civil_rights_survey, v_normal5_id, v_cr_civil_libertarian, v_cr_balanced);
    END;

    -- ============================================
    -- CRIMINAL JUSTICE SURVEY
    -- ============================================
    DECLARE
        v_criminal_justice_survey UUID;
        v_cj_reform UUID;
        v_cj_tough UUID;
        v_cj_restorative UUID;
        v_cj_balanced UUID;
    BEGIN
        INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, position_category_id, start_time, end_time, created_time)
        VALUES (
            uuid_generate_v4(),
            'Criminal Justice Policy Labels',
            'pairwise',
            'Which label better describes your criminal justice views?',
            'active',
            'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
            '04edc480-aded-4b93-94c4-d62cbb507dc4',
            NOW() - INTERVAL '7 days',
            NOW() + INTERVAL '30 days',
            NOW() - INTERVAL '7 days'
        ) RETURNING id INTO v_criminal_justice_survey;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_criminal_justice_survey, 'Reform & Rehabilitation', 1)
        RETURNING id INTO v_cj_reform;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_criminal_justice_survey, 'Tough on Crime', 2)
        RETURNING id INTO v_cj_tough;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_criminal_justice_survey, 'Restorative Justice', 3)
        RETURNING id INTO v_cj_restorative;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_criminal_justice_survey, 'Balanced Approach', 4)
        RETURNING id INTO v_cj_balanced;

        -- Liberal users prefer Reform & Rehabilitation / Restorative
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_criminal_justice_survey, v_admin1_id, v_cj_reform, v_cj_tough);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_criminal_justice_survey, v_normal1_id, v_cj_restorative, v_cj_tough);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_criminal_justice_survey, v_normal3_id, v_cj_reform, v_cj_tough);

        -- Conservative users prefer Tough on Crime
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_criminal_justice_survey, v_mod1_id, v_cj_tough, v_cj_reform);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_criminal_justice_survey, v_normal2_id, v_cj_tough, v_cj_restorative);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_criminal_justice_survey, v_normal4_id, v_cj_tough, v_cj_reform);

        -- Moderate prefers Balanced
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_criminal_justice_survey, v_mod2_id, v_cj_balanced, v_cj_tough);

        -- normal5 prefers Balanced
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_criminal_justice_survey, v_normal5_id, v_cj_balanced, v_cj_reform);
    END;

    -- ============================================
    -- FOREIGN POLICY & DEFENSE SURVEY
    -- ============================================
    DECLARE
        v_foreign_policy_survey UUID;
        v_fp_diplomacy UUID;
        v_fp_strength UUID;
        v_fp_nonintervention UUID;
        v_fp_global_leadership UUID;
    BEGIN
        INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, position_category_id, start_time, end_time, created_time)
        VALUES (
            uuid_generate_v4(),
            'Foreign Policy Labels',
            'pairwise',
            'Which label better describes your foreign policy views?',
            'active',
            'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
            '92d7131c-bf5c-40c1-89ef-e58b40e67bc8',
            NOW() - INTERVAL '7 days',
            NOW() + INTERVAL '30 days',
            NOW() - INTERVAL '7 days'
        ) RETURNING id INTO v_foreign_policy_survey;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_foreign_policy_survey, 'Diplomacy First', 1)
        RETURNING id INTO v_fp_diplomacy;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_foreign_policy_survey, 'Peace Through Strength', 2)
        RETURNING id INTO v_fp_strength;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_foreign_policy_survey, 'Non-Interventionist', 3)
        RETURNING id INTO v_fp_nonintervention;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_foreign_policy_survey, 'Global Leadership', 4)
        RETURNING id INTO v_fp_global_leadership;

        -- Liberal users prefer Diplomacy First
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_foreign_policy_survey, v_admin1_id, v_fp_diplomacy, v_fp_strength);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_foreign_policy_survey, v_normal1_id, v_fp_diplomacy, v_fp_strength);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_foreign_policy_survey, v_normal3_id, v_fp_diplomacy, v_fp_global_leadership);

        -- Conservative users prefer Peace Through Strength
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_foreign_policy_survey, v_mod1_id, v_fp_strength, v_fp_diplomacy);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_foreign_policy_survey, v_normal2_id, v_fp_strength, v_fp_diplomacy);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_foreign_policy_survey, v_normal4_id, v_fp_strength, v_fp_nonintervention);

        -- Moderate prefers Global Leadership
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_foreign_policy_survey, v_mod2_id, v_fp_global_leadership, v_fp_strength);

        -- normal5 prefers Non-Interventionist
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_foreign_policy_survey, v_normal5_id, v_fp_nonintervention, v_fp_diplomacy);
    END;

    -- ============================================
    -- GOVERNMENT & DEMOCRACY SURVEY
    -- ============================================
    DECLARE
        v_government_survey UUID;
        v_gov_active UUID;
        v_gov_limited UUID;
        v_gov_direct UUID;
        v_gov_constitutional UUID;
    BEGIN
        INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, position_category_id, start_time, end_time, created_time)
        VALUES (
            uuid_generate_v4(),
            'Government & Democracy Labels',
            'pairwise',
            'Which label better describes your government views?',
            'active',
            'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
            'cdc48d27-d636-481b-90b2-d6f6a2e6780e',
            NOW() - INTERVAL '7 days',
            NOW() + INTERVAL '30 days',
            NOW() - INTERVAL '7 days'
        ) RETURNING id INTO v_government_survey;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_government_survey, 'Active Government', 1)
        RETURNING id INTO v_gov_active;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_government_survey, 'Limited Government', 2)
        RETURNING id INTO v_gov_limited;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_government_survey, 'Direct Democracy', 3)
        RETURNING id INTO v_gov_direct;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_government_survey, 'Constitutional Republic', 4)
        RETURNING id INTO v_gov_constitutional;

        -- Liberal users prefer Active Government
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_government_survey, v_admin1_id, v_gov_active, v_gov_limited);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_government_survey, v_normal1_id, v_gov_active, v_gov_limited);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_government_survey, v_normal1_id, v_gov_direct, v_gov_constitutional);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_government_survey, v_normal3_id, v_gov_active, v_gov_constitutional);

        -- Conservative users prefer Limited Government / Constitutional Republic
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_government_survey, v_mod1_id, v_gov_limited, v_gov_active);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_government_survey, v_normal2_id, v_gov_constitutional, v_gov_direct);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_government_survey, v_normal4_id, v_gov_limited, v_gov_active);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_government_survey, v_normal4_id, v_gov_constitutional, v_gov_direct);

        -- Moderate prefers Direct Democracy
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_government_survey, v_mod2_id, v_gov_direct, v_gov_limited);

        -- normal5 prefers Constitutional Republic
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_government_survey, v_normal5_id, v_gov_constitutional, v_gov_active);
    END;

    -- ============================================
    -- SOCIAL ISSUES SURVEY
    -- ============================================
    DECLARE
        v_social_survey UUID;
        v_si_progressive UUID;
        v_si_conservative UUID;
        v_si_individual UUID;
        v_si_community UUID;
    BEGIN
        INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, location_id, position_category_id, start_time, end_time, created_time)
        VALUES (
            uuid_generate_v4(),
            'Social Issues Labels',
            'pairwise',
            'Which label better describes your social views?',
            'active',
            'ba5e3dcf-af51-47f4-941d-ee3448ee826a',
            '26c8146e-d080-419e-b98b-5089c3a81b5b',
            NOW() - INTERVAL '7 days',
            NOW() + INTERVAL '30 days',
            NOW() - INTERVAL '7 days'
        ) RETURNING id INTO v_social_survey;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_social_survey, 'Social Progressive', 1)
        RETURNING id INTO v_si_progressive;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_social_survey, 'Social Conservative', 2)
        RETURNING id INTO v_si_conservative;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_social_survey, 'Individual Liberty', 3)
        RETURNING id INTO v_si_individual;

        INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
        VALUES (uuid_generate_v4(), v_social_survey, 'Community Values', 4)
        RETURNING id INTO v_si_community;

        -- Liberal users prefer Social Progressive
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_social_survey, v_admin1_id, v_si_progressive, v_si_conservative);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_social_survey, v_normal1_id, v_si_progressive, v_si_conservative);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_social_survey, v_normal1_id, v_si_progressive, v_si_community);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_social_survey, v_normal3_id, v_si_progressive, v_si_conservative);

        -- Conservative users prefer Social Conservative / Community Values
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_social_survey, v_mod1_id, v_si_conservative, v_si_progressive);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_social_survey, v_normal2_id, v_si_community, v_si_progressive);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_social_survey, v_normal4_id, v_si_conservative, v_si_progressive);
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_social_survey, v_normal4_id, v_si_community, v_si_individual);

        -- Moderate prefers Individual Liberty
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_social_survey, v_mod2_id, v_si_individual, v_si_conservative);

        -- normal5 prefers Individual Liberty
        INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
        VALUES (v_social_survey, v_normal5_id, v_si_individual, v_si_community);
    END;

    RAISE NOTICE 'Pairwise survey test data created successfully';
    RAISE NOTICE 'Created 11 surveys: All Categories (10 labels), Healthcare, Economy, Education, Environment, Immigration, Civil Rights, Criminal Justice, Foreign Policy, Government, Social Issues';
    RAISE NOTICE 'Users responded based on ideological leanings (10 belief systems)';
END $$;
