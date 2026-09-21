-- IMPLEMENTATION STEPS: 11–13
CREATE TABLE IF NOT EXISTS ai_model_versions (
 model_version_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,model_type ENUM('demand','waiting_time') NOT NULL,
 version VARCHAR(100) NOT NULL,artifact_uri VARCHAR(500) NULL,training_source ENUM('operational','synthetic','mixed') NOT NULL,
 metrics JSON NOT NULL,model_status ENUM('candidate','active','retired','failed') NOT NULL DEFAULT 'candidate',trained_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY(model_version_id),UNIQUE KEY uq_model_version(model_type,version),KEY idx_model_active(model_type,model_status)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ai_predictions (
 prediction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,model_version_id BIGINT UNSIGNED NULL,prediction_type ENUM('demand','waiting_time') NOT NULL,
 centre_id BIGINT UNSIGNED NOT NULL,crop_id BIGINT UNSIGNED NULL,token_id BIGINT UNSIGNED NULL,target_date DATE NULL,
 prediction_value DECIMAL(14,3) NOT NULL,lower_bound DECIMAL(14,3) NULL,upper_bound DECIMAL(14,3) NULL,
 method ENUM('model','baseline','statistical_fallback') NOT NULL,input_features JSON NOT NULL,actual_value DECIMAL(14,3) NULL,
 generated_at DATETIME(3) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY(prediction_id),
 KEY idx_predictions_type_date(prediction_type,target_date,generated_at),KEY idx_predictions_centre(centre_id,generated_at),
 CONSTRAINT fk_predictions_model FOREIGN KEY(model_version_id) REFERENCES ai_model_versions(model_version_id),
 CONSTRAINT fk_predictions_centre FOREIGN KEY(centre_id) REFERENCES procurement_centres(centre_id),
 CONSTRAINT fk_predictions_crop FOREIGN KEY(crop_id) REFERENCES crops(crop_id),CONSTRAINT fk_predictions_token FOREIGN KEY(token_id) REFERENCES queue_tokens(token_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS capacity_recommendations (
 recommendation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,prediction_id BIGINT UNSIGNED NOT NULL,centre_id BIGINT UNSIGNED NOT NULL,crop_id BIGINT UNSIGNED NOT NULL,
 target_date DATE NOT NULL,predicted_demand DECIMAL(12,3) NOT NULL,available_capacity INT UNSIGNED NOT NULL,capacity_gap DECIMAL(12,3) NOT NULL,
 recommendation_type ENUM('add_capacity','add_window','redistribute','monitor') NOT NULL,recommended_capacity INT UNSIGNED NULL,reason VARCHAR(1000) NOT NULL,
 recommendation_status ENUM('pending','approved','rejected','implemented','expired') NOT NULL DEFAULT 'pending',reviewed_by BIGINT UNSIGNED NULL,review_reason VARCHAR(1000) NULL,reviewed_at DATETIME(3) NULL,resulting_schedule_id BIGINT UNSIGNED NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY(recommendation_id),UNIQUE KEY uq_recommendation_prediction(prediction_id),KEY idx_recommendations_status(recommendation_status,target_date),CONSTRAINT fk_recommendation_prediction FOREIGN KEY(prediction_id) REFERENCES ai_predictions(prediction_id),CONSTRAINT fk_recommendation_centre FOREIGN KEY(centre_id) REFERENCES procurement_centres(centre_id),CONSTRAINT fk_recommendation_crop FOREIGN KEY(crop_id) REFERENCES crops(crop_id),CONSTRAINT fk_recommendation_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(user_id),CONSTRAINT fk_recommendation_schedule FOREIGN KEY(resulting_schedule_id) REFERENCES procurement_schedules(schedule_id)
) ENGINE=InnoDB;
