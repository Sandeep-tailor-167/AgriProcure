-- AgriProcure MySQL 8 production schema.
-- The demo server uses in-memory seed data; this schema documents the deployment contract.
CREATE DATABASE IF NOT EXISTS agriprocure CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE agriprocure;

CREATE TABLE users (
  user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(15) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('farmer', 'officer', 'admin') NOT NULL,
  status ENUM('active', 'suspended', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE procurement_centres (
  centre_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  centre_name VARCHAR(160) NOT NULL,
  address VARCHAR(255) NOT NULL,
  district VARCHAR(100) NOT NULL,
  public_phone VARCHAR(15),
  status ENUM('open', 'busy', 'closed', 'inactive') NOT NULL DEFAULT 'open',
  opening_time TIME NOT NULL,
  closing_time TIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_centre_district_status (district, status)
);

CREATE TABLE farmers (
  farmer_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  farmer_code VARCHAR(30) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  village VARCHAR(100),
  district VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
  preferred_centre_id BIGINT UNSIGNED NULL,
  CONSTRAINT fk_farmer_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_farmer_centre FOREIGN KEY (preferred_centre_id) REFERENCES procurement_centres(centre_id) ON DELETE SET NULL
);

CREATE TABLE officer_assignments (
  assignment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  centre_id BIGINT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  UNIQUE KEY uq_assignment (user_id, centre_id),
  CONSTRAINT fk_assignment_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_assignment_centre FOREIGN KEY (centre_id) REFERENCES procurement_centres(centre_id)
);

CREATE TABLE crops (
  crop_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  crop_name VARCHAR(100) NOT NULL UNIQUE,
  unit VARCHAR(20) NOT NULL DEFAULT 'quintal',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active'
);

CREATE TABLE centre_crops (
  centre_id BIGINT UNSIGNED NOT NULL,
  crop_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (centre_id, crop_id),
  CONSTRAINT fk_centre_crop_centre FOREIGN KEY (centre_id) REFERENCES procurement_centres(centre_id),
  CONSTRAINT fk_centre_crop_crop FOREIGN KEY (crop_id) REFERENCES crops(crop_id)
);

CREATE TABLE procurement_schedules (
  schedule_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  centre_id BIGINT UNSIGNED NOT NULL,
  crop_id BIGINT UNSIGNED NOT NULL,
  procurement_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  booked_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('draft', 'open', 'full', 'closed', 'cancelled') NOT NULL DEFAULT 'draft',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_centre_crop_slot (centre_id, crop_id, procurement_date, start_time),
  CHECK (capacity > 0 AND booked_count <= capacity AND start_time < end_time),
  CONSTRAINT fk_schedule_centre FOREIGN KEY (centre_id) REFERENCES procurement_centres(centre_id),
  CONSTRAINT fk_schedule_crop FOREIGN KEY (crop_id) REFERENCES crops(crop_id),
  CONSTRAINT fk_schedule_actor FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE TABLE appointments (
  appointment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_reference VARCHAR(32) NOT NULL UNIQUE,
  farmer_id BIGINT UNSIGNED NOT NULL,
  schedule_id BIGINT UNSIGNED NOT NULL,
  estimated_quantity DECIMAL(12,3) NOT NULL,
  booking_status ENUM('confirmed', 'checked_in', 'in_service', 'inspection', 'completed', 'cancelled', 'no_show', 'reschedule_required') NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP NULL,
  CHECK (estimated_quantity > 0),
  INDEX idx_appointment_farmer_status (farmer_id, booking_status),
  INDEX idx_appointment_schedule_status (schedule_id, booking_status),
  CONSTRAINT fk_appointment_farmer FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
  CONSTRAINT fk_appointment_schedule FOREIGN KEY (schedule_id) REFERENCES procurement_schedules(schedule_id)
);

CREATE TABLE queue_tokens (
  token_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id BIGINT UNSIGNED NOT NULL UNIQUE,
  token_number VARCHAR(30) NOT NULL,
  check_in_time TIMESTAMP NULL,
  service_started_at TIMESTAMP NULL,
  service_completed_at TIMESTAMP NULL,
  queue_status ENUM('not_checked_in', 'waiting', 'in_service', 'inspection', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'not_checked_in',
  UNIQUE KEY uq_token_number (token_number, appointment_id),
  CONSTRAINT fk_token_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
);

CREATE TABLE procurement_transactions (
  transaction_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id BIGINT UNSIGNED NOT NULL UNIQUE,
  officer_id BIGINT UNSIGNED NOT NULL,
  status ENUM('inspection_in_progress', 'procurement_decision', 'purchase_recorded', 'amended') NOT NULL,
  decision ENUM('accepted', 'rejected', 'on_hold') NULL,
  actual_quantity DECIMAL(12,3) NULL,
  accepted_quantity DECIMAL(12,3) NULL,
  rate DECIMAL(12,2) NULL,
  deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (actual_quantity IS NULL OR actual_quantity > 0),
  CHECK (accepted_quantity IS NULL OR (accepted_quantity >= 0 AND accepted_quantity <= actual_quantity)),
  CHECK (rate IS NULL OR rate > 0),
  CONSTRAINT fk_transaction_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id),
  CONSTRAINT fk_transaction_officer FOREIGN KEY (officer_id) REFERENCES users(user_id)
);

CREATE TABLE inspection_records (
  inspection_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transaction_id BIGINT UNSIGNED NOT NULL,
  inspection_result ENUM('accepted', 'rejected', 'on_hold') NOT NULL,
  notes TEXT,
  inspected_by BIGINT UNSIGNED NOT NULL,
  inspected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inspection_transaction FOREIGN KEY (transaction_id) REFERENCES procurement_transactions(transaction_id),
  CONSTRAINT fk_inspection_actor FOREIGN KEY (inspected_by) REFERENCES users(user_id)
);

CREATE TABLE payment_records (
  payment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transaction_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_status ENUM('pending', 'initiated', 'completed', 'failed', 'unknown') NOT NULL DEFAULT 'pending',
  verified_source VARCHAR(120),
  reference_number VARCHAR(100),
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_transaction FOREIGN KEY (transaction_id) REFERENCES procurement_transactions(transaction_id)
);

CREATE TABLE notifications (
  notification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('in_app', 'sms', 'email') NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  delivery_status ENUM('queued', 'sent', 'delivered', 'failed') NOT NULL DEFAULT 'queued',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notification_user_created (user_id, created_at DESC),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE audit_logs (
  log_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  action VARCHAR(80) NOT NULL,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity_type, entity_id, created_at DESC),
  INDEX idx_audit_actor (actor_id, created_at DESC),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(user_id)
);

-- Capacity-safe booking must run in one transaction:
-- START TRANSACTION;
-- SELECT capacity, booked_count, status FROM procurement_schedules WHERE schedule_id = ? FOR UPDATE;
-- INSERT INTO appointments (...);
-- UPDATE procurement_schedules SET booked_count = booked_count + 1 WHERE schedule_id = ? AND booked_count < capacity;
-- INSERT INTO queue_tokens (...);
-- COMMIT;

