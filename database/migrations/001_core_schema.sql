-- AgriProcure migration 001: core procurement schema
-- Requires MySQL 8.0.16+ for enforced CHECK constraints.

CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  password_hash VARCHAR(255) NULL,
  role ENUM('farmer', 'officer', 'admin') NOT NULL,
  account_status ENUM('pending_verification', 'active', 'suspended', 'inactive') NOT NULL DEFAULT 'pending_verification',
  phone_verified_at DATETIME(3) NULL,
  failed_login_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_role_status (role, account_status),
  CONSTRAINT chk_users_phone CHECK (phone REGEXP '^[0-9]{10,15}$')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS procurement_centres (
  centre_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  centre_code VARCHAR(32) NOT NULL,
  centre_name VARCHAR(160) NOT NULL,
  address_line VARCHAR(255) NOT NULL,
  village VARCHAR(100) NULL,
  district VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(12) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  public_phone VARCHAR(15) NULL,
  opening_time TIME NOT NULL,
  closing_time TIME NOT NULL,
  physical_daily_capacity INT UNSIGNED NOT NULL,
  centre_status ENUM('open', 'busy', 'closed', 'inactive') NOT NULL DEFAULT 'open',
  closure_reason VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (centre_id),
  UNIQUE KEY uq_centres_code (centre_code),
  KEY idx_centres_location_status (state, district, centre_status),
  CONSTRAINT fk_centres_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT chk_centres_hours CHECK (opening_time < closing_time),
  CONSTRAINT chk_centres_capacity CHECK (physical_daily_capacity > 0),
  CONSTRAINT chk_centres_coordinates CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS farmers (
  farmer_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  farmer_code VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  village VARCHAR(100) NULL,
  district VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  preferred_language ENUM('en', 'hi') NOT NULL DEFAULT 'en',
  preferred_centre_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (farmer_id),
  UNIQUE KEY uq_farmers_code (farmer_code),
  UNIQUE KEY uq_farmers_user (user_id),
  KEY idx_farmers_location (state, district),
  CONSTRAINT fk_farmers_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_farmers_preferred_centre FOREIGN KEY (preferred_centre_id) REFERENCES procurement_centres(centre_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS officer_assignments (
  assignment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  centre_id BIGINT UNSIGNED NOT NULL,
  assigned_by BIGINT UNSIGNED NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at DATETIME(3) NULL,
  assignment_status ENUM('active', 'ended') NOT NULL DEFAULT 'active',
  PRIMARY KEY (assignment_id),
  UNIQUE KEY uq_officer_centre_assignment (user_id, centre_id, assigned_at),
  KEY idx_assignments_centre_status (centre_id, assignment_status),
  KEY idx_assignments_user_status (user_id, assignment_status),
  CONSTRAINT fk_assignments_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_assignments_centre FOREIGN KEY (centre_id) REFERENCES procurement_centres(centre_id),
  CONSTRAINT fk_assignments_actor FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT chk_assignments_dates CHECK (ended_at IS NULL OR ended_at >= assigned_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crops (
  crop_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  crop_code VARCHAR(32) NOT NULL,
  crop_name_en VARCHAR(100) NOT NULL,
  crop_name_hi VARCHAR(100) NOT NULL,
  quantity_unit ENUM('quintal', 'kilogram', 'tonne') NOT NULL DEFAULT 'quintal',
  crop_status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (crop_id),
  UNIQUE KEY uq_crops_code (crop_code),
  UNIQUE KEY uq_crops_name_en (crop_name_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS centre_crops (
  centre_id BIGINT UNSIGNED NOT NULL,
  crop_id BIGINT UNSIGNED NOT NULL,
  supported_from DATE NULL,
  supported_until DATE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (centre_id, crop_id),
  CONSTRAINT fk_centre_crops_centre FOREIGN KEY (centre_id) REFERENCES procurement_centres(centre_id),
  CONSTRAINT fk_centre_crops_crop FOREIGN KEY (crop_id) REFERENCES crops(crop_id),
  CONSTRAINT chk_centre_crop_dates CHECK (supported_until IS NULL OR supported_from IS NULL OR supported_until >= supported_from)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS procurement_schedules (
  schedule_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  centre_id BIGINT UNSIGNED NOT NULL,
  crop_id BIGINT UNSIGNED NOT NULL,
  procurement_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  booked_count INT UNSIGNED NOT NULL DEFAULT 0,
  schedule_status ENUM('draft', 'published', 'full', 'closed', 'cancelled') NOT NULL DEFAULT 'draft',
  closure_reason VARCHAR(500) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (schedule_id),
  UNIQUE KEY uq_schedule_window (centre_id, crop_id, procurement_date, start_time),
  KEY idx_schedules_discovery (procurement_date, schedule_status, crop_id, centre_id),
  CONSTRAINT fk_schedules_centre FOREIGN KEY (centre_id) REFERENCES procurement_centres(centre_id),
  CONSTRAINT fk_schedules_crop FOREIGN KEY (crop_id) REFERENCES crops(crop_id),
  CONSTRAINT fk_schedules_actor FOREIGN KEY (created_by) REFERENCES users(user_id),
  CONSTRAINT chk_schedules_time CHECK (start_time < end_time),
  CONSTRAINT chk_schedules_capacity CHECK (capacity > 0 AND booked_count <= capacity),
  CONSTRAINT chk_schedules_publish CHECK (schedule_status <> 'published' OR published_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedule_revisions (
  revision_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  snapshot JSON NOT NULL,
  change_reason VARCHAR(500) NOT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (revision_id),
  UNIQUE KEY uq_schedule_revision (schedule_id, version),
  CONSTRAINT fk_schedule_revisions_schedule FOREIGN KEY (schedule_id) REFERENCES procurement_schedules(schedule_id),
  CONSTRAINT fk_schedule_revisions_actor FOREIGN KEY (changed_by) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appointments (
  appointment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_reference VARCHAR(32) NOT NULL,
  farmer_id BIGINT UNSIGNED NOT NULL,
  schedule_id BIGINT UNSIGNED NOT NULL,
  estimated_quantity DECIMAL(12,3) NOT NULL,
  booking_status ENUM('confirmed', 'checked_in', 'in_service', 'inspection', 'completed', 'cancelled', 'no_show', 'reschedule_required') NOT NULL DEFAULT 'confirmed',
  rescheduled_from_id BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  cancelled_at DATETIME(3) NULL,
  active_booking_key VARCHAR(100) GENERATED ALWAYS AS (
    CASE WHEN booking_status IN ('confirmed', 'checked_in', 'in_service', 'inspection')
      THEN CONCAT(farmer_id, ':', schedule_id) ELSE NULL END
  ) STORED,
  PRIMARY KEY (appointment_id),
  UNIQUE KEY uq_appointments_reference (booking_reference),
  UNIQUE KEY uq_appointments_active_slot (active_booking_key),
  KEY idx_appointments_farmer_created (farmer_id, created_at DESC),
  KEY idx_appointments_schedule_status (schedule_id, booking_status),
  CONSTRAINT fk_appointments_farmer FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
  CONSTRAINT fk_appointments_schedule FOREIGN KEY (schedule_id) REFERENCES procurement_schedules(schedule_id),
  CONSTRAINT fk_appointments_rescheduled_from FOREIGN KEY (rescheduled_from_id) REFERENCES appointments(appointment_id) ON DELETE SET NULL,
  CONSTRAINT chk_appointments_quantity CHECK (estimated_quantity > 0),
  CONSTRAINT chk_appointments_cancel CHECK (booking_status <> 'cancelled' OR cancelled_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS queue_tokens (
  token_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id BIGINT UNSIGNED NOT NULL,
  token_number VARCHAR(32) NOT NULL,
  queue_date DATE NOT NULL,
  queue_status ENUM('not_checked_in', 'waiting', 'called', 'in_service', 'inspection', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'not_checked_in',
  priority_rank SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  check_in_time DATETIME(3) NULL,
  called_at DATETIME(3) NULL,
  service_started_at DATETIME(3) NULL,
  service_completed_at DATETIME(3) NULL,
  claimed_by BIGINT UNSIGNED NULL,
  claim_version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token_id),
  UNIQUE KEY uq_tokens_appointment (appointment_id),
  UNIQUE KEY uq_tokens_window_number (queue_date, token_number),
  KEY idx_tokens_queue (queue_date, queue_status, priority_rank, check_in_time),
  CONSTRAINT fk_tokens_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id),
  CONSTRAINT fk_tokens_claimed_by FOREIGN KEY (claimed_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS queue_token_sequences (
  centre_id BIGINT UNSIGNED NOT NULL,
  queue_date DATE NOT NULL,
  crop_id BIGINT UNSIGNED NOT NULL,
  next_sequence INT UNSIGNED NOT NULL,
  PRIMARY KEY (centre_id, queue_date, crop_id),
  CONSTRAINT fk_token_sequences_centre FOREIGN KEY (centre_id) REFERENCES procurement_centres(centre_id),
  CONSTRAINT fk_token_sequences_crop FOREIGN KEY (crop_id) REFERENCES crops(crop_id),
  CONSTRAINT chk_token_sequence CHECK (next_sequence > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS queue_events (
  queue_event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  reason VARCHAR(500) NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (queue_event_id),
  KEY idx_queue_events_token_time (token_id, occurred_at),
  CONSTRAINT fk_queue_events_token FOREIGN KEY (token_id) REFERENCES queue_tokens(token_id),
  CONSTRAINT fk_queue_events_actor FOREIGN KEY (actor_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS centre_queue_controls (
  centre_id BIGINT UNSIGNED NOT NULL,
  queue_date DATE NOT NULL,
  queue_state ENUM('running', 'paused', 'closed') NOT NULL DEFAULT 'running',
  active_counters SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  pause_reason VARCHAR(500) NULL,
  last_updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (centre_id, queue_date),
  CONSTRAINT fk_queue_controls_centre FOREIGN KEY (centre_id) REFERENCES procurement_centres(centre_id),
  CONSTRAINT fk_queue_controls_actor FOREIGN KEY (last_updated_by) REFERENCES users(user_id),
  CONSTRAINT chk_queue_active_counters CHECK (active_counters > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS operational_interruptions (
  interruption_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  centre_id BIGINT UNSIGNED NOT NULL,
  started_at DATETIME(3) NOT NULL,
  ended_at DATETIME(3) NULL,
  interruption_type ENUM('equipment', 'staffing', 'weather', 'connectivity', 'storage', 'other') NOT NULL,
  description VARCHAR(1000) NOT NULL,
  reported_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (interruption_id),
  KEY idx_interruptions_centre_time (centre_id, started_at),
  CONSTRAINT fk_interruptions_centre FOREIGN KEY (centre_id) REFERENCES procurement_centres(centre_id),
  CONSTRAINT fk_interruptions_actor FOREIGN KEY (reported_by) REFERENCES users(user_id),
  CONSTRAINT chk_interruptions_dates CHECK (ended_at IS NULL OR ended_at >= started_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS procurement_transactions (
  transaction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_reference VARCHAR(32) NOT NULL,
  appointment_id BIGINT UNSIGNED NOT NULL,
  officer_id BIGINT UNSIGNED NOT NULL,
  transaction_status ENUM('inspection_in_progress', 'accepted', 'rejected', 'on_hold', 'purchase_recorded', 'payment_pending', 'payment_initiated', 'payment_completed', 'payment_failed', 'corrected') NOT NULL,
  decision_reason VARCHAR(1000) NULL,
  actual_quantity DECIMAL(12,3) NULL,
  accepted_quantity DECIMAL(12,3) NULL,
  rate DECIMAL(12,2) NULL,
  gross_amount DECIMAL(14,2) NULL,
  deduction_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NULL,
  purchase_idempotency_key VARCHAR(100) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (transaction_id),
  UNIQUE KEY uq_transactions_reference (transaction_reference),
  UNIQUE KEY uq_transactions_appointment (appointment_id),
  UNIQUE KEY uq_transactions_purchase_idempotency (purchase_idempotency_key),
  KEY idx_transactions_officer_created (officer_id, created_at DESC),
  KEY idx_transactions_status_created (transaction_status, created_at DESC),
  CONSTRAINT fk_transactions_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id),
  CONSTRAINT fk_transactions_officer FOREIGN KEY (officer_id) REFERENCES users(user_id),
  CONSTRAINT chk_transactions_quantities CHECK (
    (actual_quantity IS NULL OR actual_quantity > 0) AND
    (accepted_quantity IS NULL OR (accepted_quantity >= 0 AND accepted_quantity <= actual_quantity))
  ),
  CONSTRAINT chk_transactions_money CHECK (
    (rate IS NULL OR rate > 0) AND deduction_amount >= 0 AND
    (gross_amount IS NULL OR gross_amount >= 0) AND
    (total_amount IS NULL OR total_amount >= 0)
  ),
  CONSTRAINT chk_transactions_decision_reason CHECK (transaction_status NOT IN ('rejected', 'on_hold') OR decision_reason IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inspection_records (
  inspection_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id BIGINT UNSIGNED NOT NULL,
  inspection_version INT UNSIGNED NOT NULL,
  inspection_result ENUM('accepted', 'rejected', 'on_hold') NOT NULL,
  quality_grade VARCHAR(40) NULL,
  actual_quantity DECIMAL(12,3) NOT NULL,
  notes VARCHAR(2000) NULL,
  inspected_by BIGINT UNSIGNED NOT NULL,
  inspected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (inspection_id),
  UNIQUE KEY uq_inspection_version (transaction_id, inspection_version),
  CONSTRAINT fk_inspections_transaction FOREIGN KEY (transaction_id) REFERENCES procurement_transactions(transaction_id),
  CONSTRAINT fk_inspections_actor FOREIGN KEY (inspected_by) REFERENCES users(user_id),
  CONSTRAINT chk_inspections_quantity CHECK (actual_quantity > 0),
  CONSTRAINT chk_inspections_reason CHECK (inspection_result = 'accepted' OR notes IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transaction_amendments (
  amendment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id BIGINT UNSIGNED NOT NULL,
  previous_snapshot JSON NOT NULL,
  amended_snapshot JSON NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  amended_by BIGINT UNSIGNED NOT NULL,
  amended_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (amendment_id),
  KEY idx_amendments_transaction_time (transaction_id, amended_at),
  CONSTRAINT fk_amendments_transaction FOREIGN KEY (transaction_id) REFERENCES procurement_transactions(transaction_id),
  CONSTRAINT fk_amendments_actor FOREIGN KEY (amended_by) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_records (
  payment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id BIGINT UNSIGNED NOT NULL,
  payment_status ENUM('pending', 'initiated', 'completed', 'failed', 'unknown', 'corrected') NOT NULL DEFAULT 'pending',
  amount DECIMAL(14,2) NOT NULL,
  verification_source VARCHAR(160) NULL,
  provider_reference VARCHAR(160) NULL,
  source_record JSON NULL,
  recorded_by BIGINT UNSIGNED NOT NULL,
  verified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (payment_id),
  UNIQUE KEY uq_payment_provider_reference (provider_reference),
  KEY idx_payments_transaction_created (transaction_id, created_at DESC),
  CONSTRAINT fk_payments_transaction FOREIGN KEY (transaction_id) REFERENCES procurement_transactions(transaction_id),
  CONSTRAINT fk_payments_actor FOREIGN KEY (recorded_by) REFERENCES users(user_id),
  CONSTRAINT chk_payments_amount CHECK (amount >= 0),
  CONSTRAINT chk_payments_completed_verified CHECK (payment_status <> 'completed' OR (verification_source IS NOT NULL AND provider_reference IS NOT NULL AND verified_at IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  request_id VARCHAR(64) NULL,
  ip_address VARBINARY(16) NULL,
  before_snapshot JSON NULL,
  after_snapshot JSON NULL,
  metadata JSON NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (audit_id),
  KEY idx_audit_entity_time (entity_type, entity_id, occurred_at DESC),
  KEY idx_audit_actor_time (actor_id, occurred_at DESC),
  KEY idx_audit_action_time (action, occurred_at DESC),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;
