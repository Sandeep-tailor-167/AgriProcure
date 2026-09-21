-- AgriProcure labelled synthetic development reference data.
-- This contains no real farmer, officer, appointment, transaction, or payment data.

INSERT INTO crops (crop_code, crop_name_en, crop_name_hi, quantity_unit, crop_status)
VALUES
  ('WHEAT', 'Wheat', 'गेहूँ', 'quintal', 'active'),
  ('PADDY', 'Paddy', 'धान', 'quintal', 'active'),
  ('MUSTARD', 'Mustard', 'सरसों', 'quintal', 'active'),
  ('MAIZE', 'Maize', 'मक्का', 'quintal', 'active')
ON DUPLICATE KEY UPDATE crop_name_en = VALUES(crop_name_en), crop_name_hi = VALUES(crop_name_hi), crop_status = VALUES(crop_status);

INSERT INTO procurement_centres (
  centre_code, centre_name, address_line, district, state, postal_code,
  public_phone, opening_time, closing_time, physical_daily_capacity, centre_status
)
VALUES
  ('DEMO-KRL-001', '[DEMO] Karnal Grain Mandi', 'GT Road, Sector 12', 'Karnal', 'Haryana', '132001', '18001204101', '08:00:00', '17:00:00', 120, 'open'),
  ('DEMO-ASD-001', '[DEMO] Assandh Procurement Centre', 'Safidon Road', 'Karnal', 'Haryana', '132039', '18001204102', '07:30:00', '16:00:00', 90, 'open')
ON DUPLICATE KEY UPDATE centre_name = VALUES(centre_name), physical_daily_capacity = VALUES(physical_daily_capacity), centre_status = VALUES(centre_status);

INSERT INTO centre_crops (centre_id, crop_id)
SELECT centre.centre_id, crop.crop_id
FROM procurement_centres centre
JOIN crops crop ON crop.crop_code IN ('WHEAT', 'PADDY', 'MUSTARD')
WHERE centre.centre_code = 'DEMO-KRL-001'
ON DUPLICATE KEY UPDATE centre_id = VALUES(centre_id);

INSERT INTO centre_crops (centre_id, crop_id)
SELECT centre.centre_id, crop.crop_id
FROM procurement_centres centre
JOIN crops crop ON crop.crop_code IN ('WHEAT', 'PADDY')
WHERE centre.centre_code = 'DEMO-ASD-001'
ON DUPLICATE KEY UPDATE centre_id = VALUES(centre_id);
