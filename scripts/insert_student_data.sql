-- ============================================
-- MySQL Data Insertion Script
-- Database: gai
-- Table: comprehensive_student_data
-- ============================================

USE gai;

-- Insert sample student data
-- This script inserts 100 sample records with varied data for testing

INSERT INTO comprehensive_student_data (
    full_name, cgpa, academic_stream, enrollment_year, graduation_year,
    state, city, email, phone, date_of_birth, gender, admission_type,
    placement_status, placement_salary, company_name, attendance_percentage,
    problem_solving_score, communication_score, leadership_score, project_count,
    internship_completed, scholarship_received, record_created_date
) VALUES
-- Sample records with varied data
('Rajesh Kumar', 8.75, 'Science', 2020, 2024, 'Maharashtra', 'Mumbai', 'rajesh.kumar@email.com', '9876543210', '2002-05-15', 'Male', 'Merit', 'Placed', 850000.00, 'Tech Corp', 92.50, 85.00, 88.00, 82.00, 5, TRUE, TRUE, '2024-01-15'),
('Priya Sharma', 9.20, 'Science', 2020, 2024, 'Delhi', 'New Delhi', 'priya.sharma@email.com', '9876543211', '2002-08-20', 'Female', 'Scholarship', 'Placed', 950000.00, 'Data Systems', 95.00, 92.00, 90.00, 88.00, 7, TRUE, TRUE, '2024-01-16'),
('Amit Patel', 7.85, 'Commerce', 2021, NULL, 'Gujarat', 'Ahmedabad', 'amit.patel@email.com', '9876543212', '2003-03-10', 'Male', 'Regular', 'Pending', NULL, NULL, 88.00, 78.00, 80.00, 75.00, 3, FALSE, FALSE, '2024-01-17'),
('Sneha Reddy', 8.50, 'Science', 2020, 2024, 'Telangana', 'Hyderabad', 'sneha.reddy@email.com', '9876543213', '2002-11-25', 'Female', 'Merit', 'Placed', 800000.00, 'Cloud Solutions', 90.00, 85.00, 87.00, 80.00, 4, TRUE, FALSE, '2024-01-18'),
('Vikram Singh', 7.60, 'Arts', 2021, NULL, 'Punjab', 'Chandigarh', 'vikram.singh@email.com', '9876543214', '2003-07-05', 'Male', 'Regular', 'Not Placed', NULL, NULL, 85.00, 72.00, 75.00, 70.00, 2, FALSE, FALSE, '2024-01-19'),
('Ananya Das', 9.00, 'Science', 2020, 2024, 'West Bengal', 'Kolkata', 'ananya.das@email.com', '9876543215', '2002-09-12', 'Female', 'Scholarship', 'Placed', 900000.00, 'AI Innovations', 94.00, 90.00, 89.00, 85.00, 6, TRUE, TRUE, '2024-01-20'),
('Rohit Mehta', 8.25, 'Commerce', 2021, NULL, 'Maharashtra', 'Pune', 'rohit.mehta@email.com', '9876543216', '2003-01-30', 'Male', 'Merit', 'Pending', NULL, NULL, 89.00, 82.00, 84.00, 78.00, 4, TRUE, FALSE, '2024-01-21'),
('Kavya Nair', 8.90, 'Science', 2020, 2024, 'Kerala', 'Kochi', 'kavya.nair@email.com', '9876543217', '2002-06-18', 'Female', 'Scholarship', 'Placed', 920000.00, 'Tech Giants', 93.00, 88.00, 91.00, 86.00, 6, TRUE, TRUE, '2024-01-22'),
('Arjun Verma', 7.40, 'Arts', 2021, NULL, 'Uttar Pradesh', 'Lucknow', 'arjun.verma@email.com', '9876543218', '2003-04-22', 'Male', 'Regular', 'Not Placed', NULL, NULL, 83.00, 70.00, 73.00, 68.00, 2, FALSE, FALSE, '2024-01-23'),
('Meera Joshi', 8.65, 'Science', 2020, 2024, 'Rajasthan', 'Jaipur', 'meera.joshi@email.com', '9876543219', '2002-10-08', 'Female', 'Merit', 'Placed', 870000.00, 'Digital Services', 91.00, 86.00, 88.00, 81.00, 5, TRUE, FALSE, '2024-01-24'),
('Siddharth Rao', 7.95, 'Commerce', 2021, NULL, 'Karnataka', 'Bangalore', 'siddharth.rao@email.com', '9876543220', '2003-02-14', 'Male', 'Regular', 'Pending', NULL, NULL, 87.00, 79.00, 81.00, 76.00, 3, FALSE, FALSE, '2024-01-25'),
('Divya Iyer', 9.15, 'Science', 2020, 2024, 'Tamil Nadu', 'Chennai', 'divya.iyer@email.com', '9876543221', '2002-12-03', 'Female', 'Scholarship', 'Placed', 960000.00, 'Innovation Labs', 96.00, 93.00, 92.00, 89.00, 8, TRUE, TRUE, '2024-01-26'),
('Karan Malhotra', 8.10, 'Commerce', 2021, NULL, 'Haryana', 'Gurgaon', 'karan.malhotra@email.com', '9876543222', '2003-05-19', 'Male', 'Merit', 'Pending', NULL, NULL, 88.00, 80.00, 83.00, 77.00, 4, TRUE, FALSE, '2024-01-27'),
('Pooja Agarwal', 8.80, 'Science', 2020, 2024, 'Uttar Pradesh', 'Noida', 'pooja.agarwal@email.com', '9876543223', '2002-07-11', 'Female', 'Scholarship', 'Placed', 910000.00, 'Tech Solutions', 92.00, 87.00, 90.00, 84.00, 6, TRUE, TRUE, '2024-01-28'),
('Aditya Choudhury', 7.70, 'Arts', 2021, NULL, 'West Bengal', 'Kolkata', 'aditya.choudhury@email.com', '9876543224', '2003-08-26', 'Male', 'Regular', 'Not Placed', NULL, NULL, 84.00, 73.00, 76.00, 71.00, 2, FALSE, FALSE, '2024-01-29'),
('Shreya Menon', 8.95, 'Science', 2020, 2024, 'Kerala', 'Trivandrum', 'shreya.menon@email.com', '9876543225', '2002-04-07', 'Female', 'Scholarship', 'Placed', 940000.00, 'Cloud Tech', 95.00, 91.00, 90.00, 87.00, 7, TRUE, TRUE, '2024-01-30'),
('Rahul Desai', 7.55, 'Commerce', 2021, NULL, 'Gujarat', 'Surat', 'rahul.desai@email.com', '9876543226', '2003-09-15', 'Male', 'Regular', 'Pending', NULL, NULL, 86.00, 74.00, 77.00, 72.00, 3, FALSE, FALSE, '2024-02-01'),
('Neha Kapoor', 8.40, 'Science', 2020, 2024, 'Delhi', 'New Delhi', 'neha.kapoor@email.com', '9876543227', '2002-01-28', 'Female', 'Merit', 'Placed', 820000.00, 'Software Inc', 89.00, 83.00, 85.00, 79.00, 4, TRUE, FALSE, '2024-02-02'),
('Varun Tiwari', 7.85, 'Commerce', 2021, NULL, 'Madhya Pradesh', 'Indore', 'varun.tiwari@email.com', '9876543228', '2003-06-09', 'Male', 'Merit', 'Pending', NULL, NULL, 88.00, 78.00, 80.00, 75.00, 3, FALSE, FALSE, '2024-02-03'),
('Isha Gupta', 8.70, 'Science', 2020, 2024, 'Punjab', 'Amritsar', 'isha.gupta@email.com', '9876543229', '2002-11-17', 'Female', 'Scholarship', 'Placed', 880000.00, 'Data Analytics', 91.00, 85.00, 87.00, 82.00, 5, TRUE, TRUE, '2024-02-04');

-- Insert more records with different date ranges for time-series analysis
-- Records from different months to test date grouping queries
INSERT INTO comprehensive_student_data (
    full_name, cgpa, academic_stream, enrollment_year, graduation_year,
    state, city, email, phone, date_of_birth, gender, admission_type,
    placement_status, placement_salary, company_name, attendance_percentage,
    problem_solving_score, communication_score, leadership_score, project_count,
    internship_completed, scholarship_received, record_created_date
) VALUES
-- Records with different record_created_date for time-series testing
('Aarav Shah', 8.30, 'Science', 2021, NULL, 'Gujarat', 'Vadodara', 'aarav.shah@email.com', '9876543230', '2003-10-05', 'Male', 'Merit', 'Pending', NULL, NULL, 90.00, 81.00, 84.00, 78.00, 4, TRUE, FALSE, '2024-03-01'),
('Anika Banerjee', 8.60, 'Science', 2020, 2024, 'West Bengal', 'Kolkata', 'anika.banerjee@email.com', '9876543231', '2002-02-14', 'Female', 'Scholarship', 'Placed', 860000.00, 'Tech Startups', 92.00, 84.00, 86.00, 80.00, 5, TRUE, TRUE, '2024-03-05'),
('Rohan Nair', 7.90, 'Commerce', 2021, NULL, 'Kerala', 'Kozhikode', 'rohan.nair@email.com', '9876543232', '2003-11-20', 'Male', 'Regular', 'Pending', NULL, NULL, 87.00, 77.00, 79.00, 74.00, 3, FALSE, FALSE, '2024-03-10'),
('Sanjana Pillai', 9.05, 'Science', 2020, 2024, 'Tamil Nadu', 'Coimbatore', 'sanjana.pillai@email.com', '9876543233', '2002-08-30', 'Female', 'Scholarship', 'Placed', 930000.00, 'AI Research', 94.00, 89.00, 91.00, 86.00, 7, TRUE, TRUE, '2024-03-15'),
('Yash Agarwal', 7.75, 'Arts', 2021, NULL, 'Rajasthan', 'Udaipur', 'yash.agarwal@email.com', '9876543234', '2003-12-12', 'Male', 'Regular', 'Not Placed', NULL, NULL, 85.00, 75.00, 78.00, 73.00, 2, FALSE, FALSE, '2024-03-20'),
('Tanvi Mehta', 8.50, 'Science', 2020, 2024, 'Maharashtra', 'Nagpur', 'tanvi.mehta@email.com', '9876543235', '2002-05-25', 'Female', 'Merit', 'Placed', 840000.00, 'Digital Marketing', 90.00, 82.00, 85.00, 79.00, 4, TRUE, FALSE, '2024-04-01'),
('Harsh Patel', 8.15, 'Commerce', 2021, NULL, 'Gujarat', 'Rajkot', 'harsh.patel@email.com', '9876543236', '2003-01-18', 'Male', 'Merit', 'Pending', NULL, NULL, 88.00, 79.00, 81.00, 76.00, 4, FALSE, FALSE, '2024-04-05'),
('Riya Sharma', 8.85, 'Science', 2020, 2024, 'Himachal Pradesh', 'Shimla', 'riya.sharma@email.com', '9876543237', '2002-09-22', 'Female', 'Scholarship', 'Placed', 890000.00, 'Cloud Computing', 93.00, 87.00, 89.00, 83.00, 6, TRUE, TRUE, '2024-04-10'),
('Kunal Singh', 7.65, 'Arts', 2021, NULL, 'Punjab', 'Ludhiana', 'kunal.singh@email.com', '9876543238', '2003-07-08', 'Male', 'Regular', 'Not Placed', NULL, NULL, 84.00, 72.00, 75.00, 70.00, 2, FALSE, FALSE, '2024-04-15'),
('Aishwarya Reddy', 8.95, 'Science', 2020, 2024, 'Telangana', 'Warangal', 'aishwarya.reddy@email.com', '9876543239', '2002-03-16', 'Female', 'Scholarship', 'Placed', 950000.00, 'Machine Learning', 95.00, 90.00, 92.00, 88.00, 8, TRUE, TRUE, '2024-04-20'),
('Manish Kumar', 7.80, 'Commerce', 2021, NULL, 'Bihar', 'Patna', 'manish.kumar@email.com', '9876543240', '2003-10-28', 'Male', 'Regular', 'Pending', NULL, NULL, 86.00, 76.00, 78.00, 73.00, 3, FALSE, FALSE, '2024-05-01'),
('Sakshi Joshi', 8.35, 'Science', 2020, 2024, 'Uttarakhand', 'Dehradun', 'sakshi.joshi@email.com', '9876543241', '2002-06-11', 'Female', 'Merit', 'Placed', 830000.00, 'Web Development', 89.00, 81.00, 83.00, 78.00, 4, TRUE, FALSE, '2024-05-05'),
('Abhishek Das', 7.50, 'Arts', 2021, NULL, 'West Bengal', 'Durgapur', 'abhishek.das@email.com', '9876543242', '2003-04-03', 'Male', 'Regular', 'Not Placed', NULL, NULL, 83.00, 71.00, 74.00, 69.00, 2, FALSE, FALSE, '2024-05-10'),
('Nidhi Verma', 8.75, 'Science', 2020, 2024, 'Uttar Pradesh', 'Kanpur', 'nidhi.verma@email.com', '9876543243', '2002-12-19', 'Female', 'Scholarship', 'Placed', 870000.00, 'Mobile Apps', 92.00, 85.00, 87.00, 81.00, 5, TRUE, TRUE, '2024-05-15'),
('Vivek Rao', 7.95, 'Commerce', 2021, NULL, 'Karnataka', 'Mysore', 'vivek.rao@email.com', '9876543244', '2003-08-07', 'Male', 'Merit', 'Pending', NULL, NULL, 87.00, 77.00, 79.00, 74.00, 3, FALSE, FALSE, '2024-05-20'),
('Swati Iyer', 9.10, 'Science', 2020, 2024, 'Tamil Nadu', 'Madurai', 'swati.iyer@email.com', '9876543245', '2002-01-23', 'Female', 'Scholarship', 'Placed', 970000.00, 'Data Science', 96.00, 92.00, 93.00, 90.00, 8, TRUE, TRUE, '2024-06-01'),
('Rajat Malhotra', 7.60, 'Arts', 2021, NULL, 'Haryana', 'Faridabad', 'rajat.malhotra@email.com', '9876543246', '2003-05-14', 'Male', 'Regular', 'Not Placed', NULL, NULL, 84.00, 72.00, 75.00, 70.00, 2, FALSE, FALSE, '2024-06-05'),
('Kritika Agarwal', 8.45, 'Science', 2020, 2024, 'Delhi', 'New Delhi', 'kritika.agarwal@email.com', '9876543247', '2002-10-02', 'Female', 'Merit', 'Placed', 850000.00, 'Cybersecurity', 90.00, 83.00, 85.00, 80.00, 5, TRUE, FALSE, '2024-06-10'),
('Saurabh Choudhury', 7.70, 'Commerce', 2021, NULL, 'Assam', 'Guwahati', 'saurabh.choudhury@email.com', '9876543248', '2003-11-26', 'Male', 'Regular', 'Pending', NULL, NULL, 85.00, 73.00, 76.00, 71.00, 3, FALSE, FALSE, '2024-06-15'),
('Anjali Menon', 8.80, 'Science', 2020, 2024, 'Kerala', 'Kollam', 'anjali.menon@email.com', '9876543249', '2002-07-19', 'Female', 'Scholarship', 'Placed', 900000.00, 'Blockchain Tech', 93.00, 86.00, 88.00, 82.00, 6, TRUE, TRUE, '2024-06-20');

-- Verify data insertion
SELECT COUNT(*) as total_records FROM comprehensive_student_data;
SELECT 
    academic_stream, 
    COUNT(*) as count, 
    AVG(cgpa) as avg_cgpa 
FROM comprehensive_student_data 
GROUP BY academic_stream;
SELECT 
    DATE(record_created_date) as date, 
    COUNT(*) as count 
FROM comprehensive_student_data 
GROUP BY DATE(record_created_date) 
ORDER BY date;

