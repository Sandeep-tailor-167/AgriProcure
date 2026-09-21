-- AgriProcure migration 002: mobile authentication and session security

CREATE TABLE IF NOT EXISTS otp_challenges (
  challenge_id CHAR(36) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  purpose ENUM('registration', 'login_recovery', 'phone_change') NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  provider_name VARCHAR(64) NOT NULL,
  provider_message_id VARCHAR(160) NULL,
  delivery_status ENUM('submitted', 'delivered', 'failed', 'unknown') NOT NULL DEFAULT 'unknown',
  failed_reason VARCHAR(500) NULL,
  attempts_used SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  maximum_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (challenge_id),
  KEY idx_otp_phone_purpose_created (phone, purpose, created_at DESC),
  KEY idx_otp_expiry (expires_at),
  CONSTRAINT chk_otp_phone CHECK (phone REGEXP '^[0-9]{10,15}$'),
  CONSTRAINT chk_otp_attempts CHECK (attempts_used <= maximum_attempts),
  CONSTRAINT chk_otp_expiry CHECK (expires_at > created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
  session_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(500) NULL,
  ip_address VARBINARY(16) NULL,
  expires_at DATETIME(3) NOT NULL,
  last_used_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  revoke_reason VARCHAR(200) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (session_id),
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY idx_sessions_user_active (user_id, revoked_at, expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS authentication_events (
  authentication_event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  phone VARCHAR(15) NULL,
  event_type ENUM('otp_requested', 'otp_verified', 'otp_failed', 'login_succeeded', 'login_failed', 'logout', 'session_revoked', 'account_locked') NOT NULL,
  outcome ENUM('success', 'failure') NOT NULL,
  reason_code VARCHAR(80) NULL,
  ip_address VARBINARY(16) NULL,
  user_agent VARCHAR(500) NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (authentication_event_id),
  KEY idx_auth_events_user_time (user_id, occurred_at DESC),
  KEY idx_auth_events_phone_time (phone, occurred_at DESC),
  CONSTRAINT fk_auth_events_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;
