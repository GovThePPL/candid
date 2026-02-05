-- Add age_range and income_range columns, and standardize race values

-- Add age_range column
ALTER TABLE user_demographics ADD COLUMN age_range VARCHAR(20)
    CHECK (age_range IN ('18-24', '25-34', '35-44', '45-54', '55-64', '65+'));

-- Add income_range column
ALTER TABLE user_demographics ADD COLUMN income_range VARCHAR(30)
    CHECK (income_range IN ('under_25k', '25k-50k', '50k-75k', '75k-100k', '100k-150k', '150k-200k', 'over_200k'));

-- Standardize existing race values to new format
UPDATE user_demographics SET race = 'white' WHERE race ILIKE '%white%';
UPDATE user_demographics SET race = 'black' WHERE race ILIKE '%black%' OR race ILIKE '%african%';
UPDATE user_demographics SET race = 'hispanic' WHERE race ILIKE '%hispanic%' OR race ILIKE '%latino%';
UPDATE user_demographics SET race = 'asian' WHERE race ILIKE '%asian%';
UPDATE user_demographics SET race = 'native_american' WHERE race ILIKE '%native%' OR race ILIKE '%indian%';
UPDATE user_demographics SET race = 'pacific_islander' WHERE race ILIKE '%pacific%' OR race ILIKE '%islander%';
UPDATE user_demographics SET race = 'multiracial' WHERE race ILIKE '%multi%' OR race ILIKE '%mixed%';
UPDATE user_demographics SET race = 'other' WHERE race IS NOT NULL AND race NOT IN ('white', 'black', 'hispanic', 'asian', 'native_american', 'pacific_islander', 'multiracial');

-- Add CHECK constraint for race (drop any existing constraint first if it exists)
ALTER TABLE user_demographics ADD CONSTRAINT user_demographics_race_check
    CHECK (race IN ('white', 'black', 'hispanic', 'asian', 'native_american', 'pacific_islander', 'multiracial', 'other'));

-- Add indexes for the new columns
CREATE INDEX idx_user_demographics_age_range ON user_demographics(age_range)
    WHERE age_range IS NOT NULL;

CREATE INDEX idx_user_demographics_income_range ON user_demographics(income_range)
    WHERE income_range IS NOT NULL;

CREATE INDEX idx_user_demographics_race ON user_demographics(race)
    WHERE race IS NOT NULL;
