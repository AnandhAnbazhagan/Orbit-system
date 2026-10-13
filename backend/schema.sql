CREATE DATABASE IF NOT EXISTS embsys_orbit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE embsys_orbit;


CREATE TABLE employees (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	employee_id VARCHAR(40) NOT NULL, 
	first_name VARCHAR(100) NOT NULL, 
	last_name VARCHAR(100) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	phone VARCHAR(30), 
	department VARCHAR(100), 
	designation VARCHAR(100), 
	joining_date DATE, 
	reporting_manager_id INTEGER, 
	employment_type VARCHAR(50), 
	profile_image VARCHAR(500), 
	status VARCHAR(30) NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(reporting_manager_id) REFERENCES employees (id) ON DELETE SET NULL
)

;


CREATE TABLE inventory_items (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	item_name VARCHAR(200) NOT NULL, 
	sku VARCHAR(80) NOT NULL, 
	category VARCHAR(100), 
	description TEXT, 
	quantity INTEGER NOT NULL, 
	minimum_stock INTEGER NOT NULL, 
	unit VARCHAR(30) NOT NULL, 
	location VARCHAR(120), 
	supplier VARCHAR(200), 
	purchase_price NUMERIC(14, 2), 
	status VARCHAR(30) NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
)

;


CREATE TABLE role_permissions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	role_name VARCHAR(30) NOT NULL, 
	permission_code VARCHAR(80) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (role_name, permission_code)
)

;


CREATE TABLE employee_permissions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	employee_id INTEGER NOT NULL, 
	permission_code VARCHAR(80) NOT NULL, 
	allowed BOOL NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (employee_id, permission_code), 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE
)

;


CREATE TABLE teams (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(150) NOT NULL, 
	department VARCHAR(100), 
	leader_id INTEGER, 
	description TEXT, 
	status VARCHAR(30) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(leader_id) REFERENCES employees (id) ON DELETE SET NULL
)

;


CREATE TABLE users (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	email VARCHAR(255) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	role_name VARCHAR(30) NOT NULL, 
	employee_id INTEGER, 
	is_active BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE SET NULL
)

;


CREATE TABLE activity_logs (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER, 
	action VARCHAR(80) NOT NULL, 
	entity_type VARCHAR(80), 
	entity_id INTEGER, 
	description TEXT, 
	ip_address VARCHAR(64), 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
)

;


CREATE TABLE files (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	owner_id INTEGER, 
	entity_type VARCHAR(80), 
	entity_id INTEGER, 
	file_name VARCHAR(255) NOT NULL, 
	file_path VARCHAR(500) NOT NULL, 
	mime_type VARCHAR(120), 
	size_bytes INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE SET NULL
)

;


CREATE TABLE inventory_transactions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	item_id INTEGER NOT NULL, 
	transaction_type VARCHAR(30) NOT NULL, 
	quantity INTEGER NOT NULL, 
	from_location VARCHAR(120), 
	to_location VARCHAR(120), 
	performed_by INTEGER, 
	notes TEXT, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(item_id) REFERENCES inventory_items (id) ON DELETE CASCADE, 
	FOREIGN KEY(performed_by) REFERENCES users (id) ON DELETE SET NULL
)

;


CREATE TABLE notifications (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	message TEXT NOT NULL, 
	type VARCHAR(50) NOT NULL, 
	is_read BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;


CREATE TABLE projects (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	project_code VARCHAR(40) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	description TEXT, 
	client VARCHAR(200), 
	manager_id INTEGER, 
	team_id INTEGER, 
	start_date DATE, 
	deadline DATE, 
	status VARCHAR(30) NOT NULL, 
	priority VARCHAR(20) NOT NULL, 
	budget NUMERIC(14, 2), 
	created_by INTEGER, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(manager_id) REFERENCES employees (id) ON DELETE SET NULL, 
	FOREIGN KEY(team_id) REFERENCES teams (id) ON DELETE SET NULL, 
	FOREIGN KEY(created_by) REFERENCES employees (id) ON DELETE SET NULL
)

;


CREATE TABLE team_members (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	team_id INTEGER NOT NULL, 
	employee_id INTEGER NOT NULL, 
	role_in_team VARCHAR(80), 
	joined_date DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(team_id) REFERENCES teams (id) ON DELETE CASCADE, 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE
)

;


CREATE TABLE chat_conversations (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(200), 
	conversation_type VARCHAR(40) NOT NULL, 
	project_id INTEGER, 
	team_id INTEGER, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE SET NULL, 
	FOREIGN KEY(team_id) REFERENCES teams (id) ON DELETE SET NULL
)

;


CREATE TABLE project_members (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	project_id INTEGER NOT NULL, 
	employee_id INTEGER NOT NULL, 
	member_role VARCHAR(50), 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(employee_id) REFERENCES employees (id) ON DELETE CASCADE
)

;


CREATE TABLE tasks (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	project_id INTEGER, 
	title VARCHAR(200) NOT NULL, 
	description TEXT, 
	assigned_employee_id INTEGER, 
	created_by INTEGER, 
	priority VARCHAR(20) NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	start_date DATE, 
	deadline DATE, 
	estimated_hours FLOAT, 
	actual_hours FLOAT, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(assigned_employee_id) REFERENCES employees (id) ON DELETE SET NULL, 
	FOREIGN KEY(created_by) REFERENCES employees (id) ON DELETE SET NULL
)

;


CREATE TABLE chat_members (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	conversation_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;


CREATE TABLE chat_messages (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	conversation_id INTEGER NOT NULL, 
	sender_id INTEGER NOT NULL, 
	message TEXT, 
	message_type VARCHAR(20) NOT NULL, 
	file_name VARCHAR(255), 
	file_path VARCHAR(500), 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE, 
	FOREIGN KEY(sender_id) REFERENCES users (id) ON DELETE CASCADE
)

;


CREATE TABLE task_comments (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	task_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	comment TEXT NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(task_id) REFERENCES tasks (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;

INSERT IGNORE INTO roles (name, display_name) VALUES ('EXECUTIVE','Executive'),('ADMIN','Administrator'),('MANAGER','Manager'),('EMPLOYEE','Employee');
INSERT IGNORE INTO permissions (code, description) VALUES ('VIEW_DASHBOARD','View dashboard');
INSERT IGNORE INTO permissions (code, description) VALUES ('MANAGE_EMPLOYEES','Manage employees');
INSERT IGNORE INTO permissions (code, description) VALUES ('REGISTER_EMPLOYEE','Register employee');
INSERT IGNORE INTO permissions (code, description) VALUES ('MANAGE_ACCESS','Manage access');
INSERT IGNORE INTO permissions (code, description) VALUES ('MANAGE_PROJECTS','Manage projects');
INSERT IGNORE INTO permissions (code, description) VALUES ('MANAGE_TASKS','Manage tasks');
INSERT IGNORE INTO permissions (code, description) VALUES ('MANAGE_TEAMS','Manage teams');
INSERT IGNORE INTO permissions (code, description) VALUES ('MANAGE_INVENTORY','Manage inventory');
INSERT IGNORE INTO permissions (code, description) VALUES ('VIEW_REPORTS','View reports');
INSERT IGNORE INTO permissions (code, description) VALUES ('MANAGE_REPORTS','Manage reports');
INSERT IGNORE INTO permissions (code, description) VALUES ('USE_CHAT','Use chat');
INSERT IGNORE INTO permissions (code, description) VALUES ('UPLOAD_FILES','Upload files');
INSERT IGNORE INTO permissions (code, description) VALUES ('VIEW_FILES','View files');
INSERT IGNORE INTO permissions (code, description) VALUES ('MANAGE_SETTINGS','Manage settings');
