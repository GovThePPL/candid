-- Migration: Bridging awards increment kudos_count
-- Run against an existing database to make bridging awards count toward kudos.

BEGIN;

-- Trigger function: bridging_award changes → update users.kudos_count
CREATE OR REPLACE FUNCTION update_user_kudos_from_bridging() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT NEW.dismissed THEN
            UPDATE users SET kudos_count = kudos_count + 1 WHERE id = NEW.user_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NOT OLD.dismissed AND NEW.dismissed THEN
            UPDATE users SET kudos_count = GREATEST(kudos_count - 1, 0) WHERE id = NEW.user_id;
        ELSIF OLD.dismissed AND NOT NEW.dismissed THEN
            UPDATE users SET kudos_count = kudos_count + 1 WHERE id = NEW.user_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF NOT OLD.dismissed THEN
            UPDATE users SET kudos_count = GREATEST(kudos_count - 1, 0) WHERE id = OLD.user_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_kudos_from_bridging
    AFTER INSERT OR UPDATE OR DELETE ON bridging_award
    FOR EACH ROW EXECUTE FUNCTION update_user_kudos_from_bridging();

-- Backfill: add existing non-dismissed bridging awards to kudos_count
UPDATE users u
SET kudos_count = kudos_count + ba.cnt
FROM (
    SELECT user_id, COUNT(*) AS cnt
    FROM bridging_award
    WHERE dismissed = false
    GROUP BY user_id
) ba
WHERE u.id = ba.user_id;

COMMIT;
