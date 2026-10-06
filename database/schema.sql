-- AgroSathi MySQL 8 schema (runs automatically on first container start)
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role ENUM('farmer','agent','admin') NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  mobile VARCHAR(20) NULL,
  password_hash VARCHAR(100) NOT NULL,
  profile_image VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS locations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  district VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'India',
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  UNIQUE KEY uq_location (district, state, country)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crop_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  UNIQUE KEY uq_crop_category (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS farmer_profiles (
  user_id INT UNSIGNED PRIMARY KEY,
  village VARCHAR(120) NULL,
  district VARCHAR(100) NULL,
  state VARCHAR(100) NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'India',
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  farm_size DECIMAL(10,2) NULL,
  farm_size_unit ENUM('acre','hectare','bigha') NOT NULL DEFAULT 'acre',
  soil_type VARCHAR(80) NULL,
  irrigation_type VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_farmer_location (state, district),
  CONSTRAINT fk_fp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id INT UNSIGNED PRIMARY KEY,
  specialization VARCHAR(120) NULL,
  bio VARCHAR(500) NULL,
  max_farmers INT UNSIGNED NOT NULL DEFAULT 25,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ap_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS farms (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  farmer_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  area DECIMAL(10,2) NULL,
  area_unit ENUM('acre','hectare','bigha') NOT NULL DEFAULT 'acre',
  soil_type VARCHAR(80) NULL,
  irrigation_type VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_farms_farmer (farmer_id),
  CONSTRAINT fk_farms_farmer FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crops (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  farmer_id INT UNSIGNED NOT NULL,
  farm_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NULL,
  crop_name VARCHAR(100) NOT NULL,
  variety VARCHAR(100) NULL,
  sowing_date DATE NULL,
  expected_harvest_date DATE NULL,
  area DECIMAL(10,2) NULL,
  soil_type VARCHAR(80) NULL,
  irrigation_type VARCHAR(80) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_crops_farmer (farmer_id),
  KEY idx_crops_farm (farm_id),
  CONSTRAINT fk_crops_farmer FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_crops_farm FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL,
  CONSTRAINT fk_crops_category FOREIGN KEY (category_id) REFERENCES crop_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- active_farmer_id is set to farmer_id while the assignment is active and NULL once ended.
-- The UNIQUE key therefore guarantees at most one active agent per farmer.
CREATE TABLE IF NOT EXISTS agent_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  farmer_id INT UNSIGNED NOT NULL,
  agent_id INT UNSIGNED NOT NULL,
  assigned_by INT UNSIGNED NULL,
  active_farmer_id INT UNSIGNED NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  UNIQUE KEY uq_one_active_agent (active_farmer_id),
  KEY idx_assign_agent (agent_id, ended_at),
  KEY idx_assign_farmer (farmer_id),
  CONSTRAINT fk_as_farmer FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_as_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_as_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  farmer_id INT UNSIGNED NOT NULL,
  agent_id INT UNSIGNED NULL,
  crop_id INT UNSIGNED NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'general',
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  status ENUM('open','assigned','in_progress','waiting_for_farmer','resolved','closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  KEY idx_tickets_farmer (farmer_id, status),
  KEY idx_tickets_agent (agent_id, status),
  KEY idx_tickets_status_priority (status, priority),
  CONSTRAINT fk_t_farmer FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_t_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_t_crop FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tm_ticket (ticket_id, created_at),
  CONSTRAINT fk_tm_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- One real-time conversation per farmer; agent_id follows the farmer's current assignment.
CREATE TABLE IF NOT EXISTS conversations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  farmer_id INT UNSIGNED NOT NULL,
  agent_id INT UNSIGNED NULL,
  last_message_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conv_farmer (farmer_id),
  KEY idx_conv_agent (agent_id),
  CONSTRAINT fk_c_farmer FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_c_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cm_conv (conversation_id, id),
  KEY idx_cm_unread (conversation_id, sender_id, read_at),
  CONSTRAINT fk_cm_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NULL,
  link VARCHAR(200) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notif_user (user_id, is_read, created_at),
  CONSTRAINT fk_n_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Last known weather per location; used as a stale fallback if the provider fails.
CREATE TABLE IF NOT EXISTS weather_cache (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  location_key VARCHAR(120) NOT NULL,
  payload JSON NOT NULL,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_weather_loc (location_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  content MEDIUMTEXT NOT NULL,
  source VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_kd_category (category),
  CONSTRAINT fk_kd_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Chunks + embeddings behind VectorStoreService (MySQL-backed vector store).
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  embedding JSON NOT NULL,
  embedding_model VARCHAR(80) NOT NULL,
  KEY idx_kc_doc (document_id),
  CONSTRAINT fk_kc_doc FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ai_conversations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_aic_user (user_id, updated_at),
  CONSTRAINT fk_aic_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ai_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ai_conversation_id INT UNSIGNED NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  sources JSON NULL,
  model VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_aim_conv (ai_conversation_id, id),
  CONSTRAINT fk_aim_conv FOREIGN KEY (ai_conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Every AI call (farmer chat, agent assist, recommendations) for the admin usage view.
CREATE TABLE IF NOT EXISTS ai_usage (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  kind VARCHAR(40) NOT NULL,
  success TINYINT(1) NOT NULL DEFAULT 1,
  latency_ms INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_aiu_created (created_at),
  KEY idx_aiu_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id INT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) NULL,
  target_id INT UNSIGNED NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_actor (actor_id),
  KEY idx_audit_target (target_type, target_id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
