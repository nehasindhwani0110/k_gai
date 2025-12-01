-- ============================================
-- MySQL Database Setup Script
-- Database: gai
-- Host: localhost
-- ============================================

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS gai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Use the database
USE gai;

-- Drop table if exists (for testing/recreation)
DROP TABLE IF EXISTS comprehensive_student_data;

-- Create comprehensive_student_data table
CREATE TABLE comprehensive_student_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    cgpa DECIMAL(4, 2) NOT NULL COMMENT 'Cumulative Grade Point Average (0.00 to 10.00)',
    academic_stream VARCHAR(100) NOT NULL COMMENT 'Science, Commerce, Arts, etc.',
    enrollment_year INT NOT NULL COMMENT 'Year of enrollment',
    graduation_year INT NULL COMMENT 'Year of graduation (NULL if not graduated)',
    state VARCHAR(100) NOT NULL COMMENT 'State/Province',
    city VARCHAR(100) NOT NULL COMMENT 'City',
    email VARCHAR(255) NULL COMMENT 'Student email',
    phone VARCHAR(20) NULL COMMENT 'Contact number',
    date_of_birth DATE NULL COMMENT 'Date of birth',
    gender VARCHAR(20) NULL COMMENT 'Gender',
    admission_type VARCHAR(50) NULL COMMENT 'Regular, Merit, Scholarship, etc.',
    placement_status VARCHAR(50) NULL COMMENT 'Placed, Not Placed, Pending',
    placement_salary DECIMAL(10, 2) NULL COMMENT 'Salary if placed',
    company_name VARCHAR(255) NULL COMMENT 'Company name if placed',
    attendance_percentage DECIMAL(5, 2) NULL COMMENT 'Overall attendance percentage',
    problem_solving_score DECIMAL(5, 2) NULL COMMENT 'Problem solving assessment score',
    communication_score DECIMAL(5, 2) NULL COMMENT 'Communication skills score',
    leadership_score DECIMAL(5, 2) NULL COMMENT 'Leadership assessment score',
    project_count INT DEFAULT 0 COMMENT 'Number of projects completed',
    internship_completed BOOLEAN DEFAULT FALSE COMMENT 'Whether internship is completed',
    scholarship_received BOOLEAN DEFAULT FALSE COMMENT 'Whether received scholarship',
    record_created_date DATE NOT NULL COMMENT 'Date when record was created',
    record_updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update timestamp',
    
    -- Indexes for common query patterns
    INDEX idx_cgpa (cgpa),
    INDEX idx_academic_stream (academic_stream),
    INDEX idx_state (state),
    INDEX idx_enrollment_year (enrollment_year),
    INDEX idx_placement_status (placement_status),
    INDEX idx_record_created_date (record_created_date),
    INDEX idx_full_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Comprehensive student data for analytics';

-- Verify table creation
SHOW CREATE TABLE comprehensive_student_data;

-- Show table structure
DESCRIBE comprehensive_student_data;

