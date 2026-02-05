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

    -- Item IDs for all-categories survey
    v_item_progressive UUID;
    v_item_conservative UUID;
    v_item_moderate UUID;
    v_item_libertarian UUID;
    v_item_pragmatic UUID;

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
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Oregon Community Labels',
        'pairwise',
        'Which label better describes your political views?',
        'active',
        NOW() - INTERVAL '7 days',
        NOW() + INTERVAL '30 days',
        NOW() - INTERVAL '7 days'
    ) RETURNING id INTO v_all_categories_survey;

    -- Items for all-categories survey
    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Progressive', 1)
    RETURNING id INTO v_item_progressive;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Conservative', 2)
    RETURNING id INTO v_item_conservative;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Moderate', 3)
    RETURNING id INTO v_item_moderate;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Libertarian', 4)
    RETURNING id INTO v_item_libertarian;

    INSERT INTO pairwise_item (id, survey_id, item_text, item_order)
    VALUES (uuid_generate_v4(), v_all_categories_survey, 'Pragmatic', 5)
    RETURNING id INTO v_item_pragmatic;

    -- Responses for all-categories survey
    -- Liberal users (admin1, normal1, normal3) prefer Progressive
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_admin1_id, v_item_progressive, v_item_conservative);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal1_id, v_item_progressive, v_item_conservative);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal1_id, v_item_progressive, v_item_moderate);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal3_id, v_item_progressive, v_item_libertarian);

    -- Conservative users (mod1, normal2, normal4) prefer Conservative
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_mod1_id, v_item_conservative, v_item_progressive);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal2_id, v_item_conservative, v_item_progressive);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal4_id, v_item_conservative, v_item_progressive);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal4_id, v_item_conservative, v_item_moderate);

    -- Moderate user (mod2) prefers Moderate or Pragmatic
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_mod2_id, v_item_moderate, v_item_progressive);
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_mod2_id, v_item_pragmatic, v_item_conservative);

    -- normal5 (no lean) votes randomly
    INSERT INTO pairwise_response (survey_id, user_id, winner_item_id, loser_item_id)
    VALUES (v_all_categories_survey, v_normal5_id, v_item_pragmatic, v_item_libertarian);

    -- ============================================
    -- HEALTHCARE SURVEY
    -- ============================================
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Healthcare Policy Labels',
        'pairwise',
        'Which label better describes your healthcare views?',
        'active',
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
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Economy & Tax Policy Labels',
        'pairwise',
        'Which label better describes your economic views?',
        'active',
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
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Education Policy Labels',
        'pairwise',
        'Which label better describes your education views?',
        'active',
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
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Environment & Climate Labels',
        'pairwise',
        'Which label better describes your environmental views?',
        'active',
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
    INSERT INTO survey (id, survey_title, survey_type, comparison_question, status, start_time, end_time, created_time)
    VALUES (
        uuid_generate_v4(),
        'Immigration Policy Labels',
        'pairwise',
        'Which label better describes your immigration views?',
        'active',
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

    RAISE NOTICE 'Pairwise survey test data created successfully';
    RAISE NOTICE 'Created 6 surveys: All Categories, Healthcare, Economy, Education, Environment, Immigration';
    RAISE NOTICE 'Users responded based on ideological leanings';
END $$;
