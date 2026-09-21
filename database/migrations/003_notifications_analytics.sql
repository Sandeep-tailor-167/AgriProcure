-- IMPLEMENTATION STEPS: 09–10
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id BIGINT UNSIGNED NOT NULL, event_type VARCHAR(60) NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE, sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY(user_id,event_type), CONSTRAINT fk_notification_preferences_user FOREIGN KEY(user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(60) NOT NULL, title VARCHAR(160) NOT NULL, message VARCHAR(1000) NOT NULL,
  data JSON NULL, deduplication_key VARCHAR(160) NOT NULL, read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY(notification_id),
  UNIQUE KEY uq_notifications_dedupe(deduplication_key), KEY idx_notifications_user_time(user_id,created_at DESC),
  CONSTRAINT fk_notifications_user FOREIGN KEY(user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  attempt_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, notification_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('in_app','sms') NOT NULL, attempt_number SMALLINT UNSIGNED NOT NULL,
  delivery_status ENUM('queued','submitted','delivered','failed','permanent_failure') NOT NULL,
  provider_name VARCHAR(80) NULL, provider_message_id VARCHAR(160) NULL, error_code VARCHAR(100) NULL,
  error_message VARCHAR(500) NULL, next_retry_at DATETIME(3) NULL, attempted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  delivered_at DATETIME(3) NULL, PRIMARY KEY(attempt_id), UNIQUE KEY uq_notification_channel_attempt(notification_id,channel,attempt_number),
  UNIQUE KEY uq_notification_provider_message(provider_name,provider_message_id), KEY idx_delivery_retry(delivery_status,next_retry_at),
  CONSTRAINT fk_delivery_notification FOREIGN KEY(notification_id) REFERENCES notifications(notification_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS operational_metrics (
  metric_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, centre_id BIGINT UNSIGNED NOT NULL, crop_id BIGINT UNSIGNED NULL,
  metric_date DATE NOT NULL, appointments INT UNSIGNED NOT NULL DEFAULT 0, completed_appointments INT UNSIGNED NOT NULL DEFAULT 0,
  check_ins INT UNSIGNED NOT NULL DEFAULT 0, no_shows INT UNSIGNED NOT NULL DEFAULT 0, average_wait_minutes DECIMAL(10,2) NULL,
  procured_quantity DECIMAL(14,3) NOT NULL DEFAULT 0, purchase_value DECIMAL(16,2) NOT NULL DEFAULT 0,
  capacity INT UNSIGNED NOT NULL DEFAULT 0, computed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(metric_id), UNIQUE KEY uq_operational_metric(centre_id,crop_id,metric_date), KEY idx_metric_date(metric_date),
  CONSTRAINT fk_metrics_centre FOREIGN KEY(centre_id) REFERENCES procurement_centres(centre_id),
  CONSTRAINT fk_metrics_crop FOREIGN KEY(crop_id) REFERENCES crops(crop_id)
) ENGINE=InnoDB;
