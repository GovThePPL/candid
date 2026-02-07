-- Migration 019: Add presence and notification columns for chat matching

-- Push notification support
ALTER TABLE users ADD COLUMN push_token TEXT;
ALTER TABLE users ADD COLUMN push_platform VARCHAR(20)
  CHECK (push_platform IN ('expo', 'web'));
ALTER TABLE users ADD COLUMN notifications_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN notification_frequency SMALLINT DEFAULT 3
  CHECK (notification_frequency BETWEEN 0 AND 5);
  -- 0=off, 1=rarely(2/day), 2=less(5/day), 3=normal(10/day), 4=more(20/day), 5=often(unlimited)
ALTER TABLE users ADD COLUMN notifications_sent_today SMALLINT DEFAULT 0;
ALTER TABLE users ADD COLUMN notifications_sent_date DATE;
ALTER TABLE users ADD COLUMN quiet_hours_start SMALLINT
  CHECK (quiet_hours_start BETWEEN 0 AND 23);
ALTER TABLE users ADD COLUMN quiet_hours_end SMALLINT
  CHECK (quiet_hours_end BETWEEN 0 AND 23);
ALTER TABLE users ADD COLUMN timezone VARCHAR(50) DEFAULT 'America/New_York';

-- Context-specific response rates (0.00 to 1.00, default 1.0 for new users)
ALTER TABLE users ADD COLUMN response_rate_swiping DECIMAL(3,2) DEFAULT 1.00;
ALTER TABLE users ADD COLUMN response_rate_in_app DECIMAL(3,2) DEFAULT 1.00;
ALTER TABLE users ADD COLUMN response_rate_notification DECIMAL(3,2) DEFAULT 1.00;

-- Track how chat requests were delivered for response rate context
ALTER TABLE chat_request ADD COLUMN delivery_context VARCHAR(20) DEFAULT 'swiping'
  CHECK (delivery_context IN ('swiping', 'in_app', 'notification'));
