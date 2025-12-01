-- ============================================
-- SQL Script to Create Schools Table and Insert Sample Schools
-- This is for SQLite (Prisma database)
-- ============================================

-- Note: This script is for reference. 
-- In production, use Prisma migrations: npx prisma migrate dev

-- For now, we'll create a script that can be run after Prisma migration
-- The actual table creation will be done by Prisma

-- Sample data to insert after School table is created
-- Run this after: npx prisma migrate dev --name add_school_model

-- Insert sample schools
-- Password: "neha" (hashed with bcrypt - hash: $2b$10$rOzJ8K8K8K8K8K8K8K8K8O)
-- For testing, we'll use a simple hash. In production, use bcrypt.

-- SQLite doesn't support INSERT IGNORE, so we'll use INSERT OR IGNORE
-- Or better, use Prisma seed script

-- Example SQL (for reference - actual insertion done via Prisma):
-- INSERT INTO School (id, email, password, name, connectionString, isActive, createdAt, updatedAt)
-- VALUES 
--   ('clx_school_a', 'schoola@gmail.com', '$2b$10$rOzJ8K8K8K8K8K8K8K8K8O', 'School A', 'mysql://root:neha@2004@localhost:3306/gai', true, datetime('now'), datetime('now')),
--   ('clx_school_b', 'schoolb@gmail.com', '$2b$10$rOzJ8K8K8K8K8K8K8K8K8P', 'School B', 'mysql://root:neha@2004@localhost:3306/gai', true, datetime('now'), datetime('now'));

-- Note: In production, passwords should be hashed using bcrypt
-- For testing, we'll create a Prisma seed script instead

