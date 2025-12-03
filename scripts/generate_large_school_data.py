"""
Generate Large School Dataset for Testing
==========================================

Generates realistic school data with 50+ columns and multiple tables
to test the analytics engine's scalability with large databases.

Usage:
    python generate_large_school_data.py --rows 1000 --output ./uploads
    
This will generate:
- comprehensive_student_data.csv (main dataset with 50+ columns)
- Optional: Separate files for different entities
"""

import csv
import random
import argparse
from datetime import datetime, timedelta
from pathlib import Path
import os

# Configuration
STUDENT_NAMES_FIRST = [
    "Aarav", "Aditi", "Akshay", "Ananya", "Arjun", "Avani", "Dev", "Diya",
    "Ishaan", "Kavya", "Krishna", "Meera", "Neha", "Priya", "Rahul", "Riya",
    "Rohan", "Saanvi", "Sahil", "Sanjana", "Shreya", "Siddharth", "Sneha",
    "Tanvi", "Varun", "Ved", "Vidya", "Vikram", "Yash", "Zara"
]

STUDENT_NAMES_LAST = [
    "Sharma", "Patel", "Kumar", "Singh", "Gupta", "Verma", "Mehta", "Joshi",
    "Reddy", "Rao", "Malhotra", "Agarwal", "Kapoor", "Chopra", "Nair", "Iyer",
    "Menon", "Pillai", "Krishnan", "Narayanan", "Srinivasan", "Raman", "Subramanian"
]

SUBJECTS = [
    "Mathematics", "English", "Science", "Social Studies", "Hindi", "Computer Science",
    "Physics", "Chemistry", "Biology", "History", "Geography", "Economics",
    "Business Studies", "Accountancy", "Physical Education", "Art", "Music"
]

STREAMS = ["Science", "Commerce", "Arts", "Vocational"]

CLASSES = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11 Science", 
           "Class 11 Commerce", "Class 11 Arts", "Class 12 Science", "Class 12 Commerce", "Class 12 Arts"]

SECTIONS = ["A", "B", "C", "D", "E"]

BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]

GENDERS = ["Male", "Female", "Other"]

TRANSPORT_MODES = ["School Bus", "Private Vehicle", "Public Transport", "Walking", "Bicycle"]

PARENT_OCCUPATIONS = [
    "Engineer", "Doctor", "Teacher", "Business Owner", "Government Employee",
    "Lawyer", "Accountant", "Nurse", "Farmer", "Retailer", "Driver", "Housewife"
]

CITIES = [
    "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune",
    "Ahmedabad", "Jaipur", "Lucknow", "Kanpur", "Nagpur", "Indore", "Thane"
]

STATES = [
    "Maharashtra", "Delhi", "Karnataka", "Telangana", "Tamil Nadu", "West Bengal",
    "Gujarat", "Rajasthan", "Uttar Pradesh", "Madhya Pradesh"
]

def generate_date_of_birth(min_age=10, max_age=18):
    """Generate a random date of birth"""
    age = random.randint(min_age, max_age)
    birth_date = datetime.now() - timedelta(days=age * 365 + random.randint(0, 365))
    return birth_date.strftime("%Y-%m-%d")

def generate_admission_date():
    """Generate admission date (within last 5 years)"""
    years_ago = random.randint(0, 5)
    admission_date = datetime.now() - timedelta(days=years_ago * 365 + random.randint(0, 365))
    return admission_date.strftime("%Y-%m-%d")

def generate_phone():
    """Generate a random phone number"""
    return f"{random.randint(7000000000, 9999999999)}"

def generate_email(first_name, last_name, student_id):
    """Generate email address"""
    return f"{first_name.lower()}.{last_name.lower()}{student_id}@school.edu"

def generate_address():
    """Generate random address"""
    house_no = random.randint(1, 999)
    street = random.choice(["Main Street", "Park Avenue", "Gandhi Road", "Nehru Marg", "MG Road"])
    city = random.choice(CITIES)
    state = random.choice(STATES)
    pincode = random.randint(100000, 999999)
    return f"{house_no}, {street}, {city}, {state} - {pincode}"

def generate_student_data(num_rows=1000):
    """Generate comprehensive student data with 50+ columns"""
    
    print(f"Generating {num_rows} student records with 50+ columns...")
    
    data = []
    
    for i in range(1, num_rows + 1):
        first_name = random.choice(STUDENT_NAMES_FIRST)
        last_name = random.choice(STUDENT_NAMES_LAST)
        full_name = f"{first_name} {last_name}"
        student_id = f"STU{str(i).zfill(6)}"
        
        # Academic Information
        current_class = random.choice(CLASSES)
        section = random.choice(SECTIONS)
        roll_number = random.randint(1, 60)
        academic_year = f"{datetime.now().year - 1}-{datetime.now().year}"
        
        # Personal Information
        gender = random.choice(GENDERS)
        date_of_birth = generate_date_of_birth()
        age = (datetime.now() - datetime.strptime(date_of_birth, "%Y-%m-%d")).days // 365
        blood_group = random.choice(BLOOD_GROUPS)
        
        # Contact Information
        email = generate_email(first_name, last_name, i)
        phone = generate_phone()
        address = generate_address()
        city = address.split(", ")[-2] if ", " in address else random.choice(CITIES)
        state = address.split(", ")[-1].split(" - ")[0] if " - " in address else random.choice(STATES)
        pincode = address.split(" - ")[1] if " - " in address else str(random.randint(100000, 999999))
        
        # Family Information
        father_name = f"{random.choice(STUDENT_NAMES_FIRST)} {last_name}"
        mother_name = f"{random.choice(STUDENT_NAMES_FIRST)} {last_name}"
        father_occupation = random.choice(PARENT_OCCUPATIONS)
        mother_occupation = random.choice(PARENT_OCCUPATIONS)
        father_phone = generate_phone()
        mother_phone = generate_phone()
        father_email = f"father.{last_name.lower()}{i}@email.com"
        mother_email = f"mother.{last_name.lower()}{i}@email.com"
        annual_income = random.choice([
            "Below 2 Lakhs", "2-5 Lakhs", "5-10 Lakhs", "10-20 Lakhs", "Above 20 Lakhs"
        ])
        
        # Admission Information
        admission_date = generate_admission_date()
        admission_number = f"ADM{str(i).zfill(6)}"
        previous_school = random.choice([
            "ABC Public School", "XYZ International School", "Green Valley School",
            "Sunshine Academy", "Rainbow School", "None"
        ])
        
        # Academic Performance
        cgpa = round(random.uniform(6.0, 10.0), 2)
        attendance_percentage = round(random.uniform(75.0, 100.0), 2)
        math_score = random.randint(60, 100)
        english_score = random.randint(60, 100)
        science_score = random.randint(60, 100)
        social_score = random.randint(60, 100)
        hindi_score = random.randint(60, 100)
        computer_score = random.randint(60, 100)
        total_marks = math_score + english_score + science_score + social_score + hindi_score + computer_score
        percentage = round((total_marks / 600) * 100, 2)
        
        # Extracurricular
        has_sports = random.choice([True, False])
        sports_category = random.choice(["Cricket", "Football", "Basketball", "Tennis", "Swimming", "None"]) if has_sports else "None"
        has_music = random.choice([True, False])
        music_instrument = random.choice(["Piano", "Guitar", "Violin", "Drums", "None"]) if has_music else "None"
        has_arts = random.choice([True, False])
        art_category = random.choice(["Painting", "Drawing", "Sculpture", "None"]) if has_arts else "None"
        
        # Transport & Logistics
        transport_mode = random.choice(TRANSPORT_MODES)
        bus_route = f"Route {random.randint(1, 20)}" if transport_mode == "School Bus" else "N/A"
        distance_from_school = round(random.uniform(1.0, 25.0), 2)
        
        # Health Information
        has_medical_condition = random.choice([True, False])
        medical_condition = random.choice([
            "Asthma", "Diabetes", "Allergy", "None"
        ]) if has_medical_condition else "None"
        height_cm = random.randint(140, 180)
        weight_kg = round(random.uniform(35.0, 80.0), 1)
        bmi = round(weight_kg / ((height_cm / 100) ** 2), 2)
        
        # Financial Information
        fee_status = random.choice(["Paid", "Pending", "Partial", "Scholarship"])
        total_fee = random.choice([50000, 75000, 100000, 125000, 150000])
        paid_amount = round(total_fee * random.uniform(0.5, 1.0), 2) if fee_status != "Pending" else 0
        pending_amount = total_fee - paid_amount
        
        # Behavioral & Discipline
        discipline_score = random.randint(70, 100)
        behavior_rating = random.choice(["Excellent", "Good", "Average", "Needs Improvement"])
        number_of_warnings = random.randint(0, 5)
        
        # Library & Resources
        books_issued = random.randint(0, 10)
        library_fine = round(random.uniform(0, 500), 2)
        
        # Technology
        has_laptop = random.choice([True, False])
        has_tablet = random.choice([True, False])
        internet_access = random.choice([True, False])
        
        # Create row with all columns
        row = {
            # Identification
            "student_id": student_id,
            "admission_number": admission_number,
            "roll_number": roll_number,
            "full_name": full_name,
            "first_name": first_name,
            "last_name": last_name,
            
            # Academic
            "current_class": current_class,
            "section": section,
            "academic_year": academic_year,
            "cgpa": cgpa,
            "attendance_percentage": attendance_percentage,
            "percentage": percentage,
            "total_marks": total_marks,
            
            # Subject Scores
            "math_score": math_score,
            "english_score": english_score,
            "science_score": science_score,
            "social_studies_score": social_score,
            "hindi_score": hindi_score,
            "computer_science_score": computer_score,
            
            # Personal
            "gender": gender,
            "date_of_birth": date_of_birth,
            "age": age,
            "blood_group": blood_group,
            "height_cm": height_cm,
            "weight_kg": weight_kg,
            "bmi": bmi,
            
            # Contact
            "email": email,
            "phone": phone,
            "address": address,
            "city": city,
            "state": state,
            "pincode": pincode,
            
            # Family
            "father_name": father_name,
            "mother_name": mother_name,
            "father_occupation": father_occupation,
            "mother_occupation": mother_occupation,
            "father_phone": father_phone,
            "mother_phone": mother_phone,
            "father_email": father_email,
            "mother_email": mother_email,
            "annual_income": annual_income,
            
            # Admission
            "admission_date": admission_date,
            "previous_school": previous_school,
            
            # Extracurricular
            "has_sports": has_sports,
            "sports_category": sports_category,
            "has_music": has_music,
            "music_instrument": music_instrument,
            "has_arts": has_arts,
            "art_category": art_category,
            
            # Transport
            "transport_mode": transport_mode,
            "bus_route": bus_route,
            "distance_from_school_km": distance_from_school,
            
            # Health
            "has_medical_condition": has_medical_condition,
            "medical_condition": medical_condition,
            
            # Financial
            "fee_status": fee_status,
            "total_fee": total_fee,
            "paid_amount": paid_amount,
            "pending_amount": pending_amount,
            
            # Behavioral
            "discipline_score": discipline_score,
            "behavior_rating": behavior_rating,
            "number_of_warnings": number_of_warnings,
            
            # Library
            "books_issued": books_issued,
            "library_fine": library_fine,
            
            # Technology
            "has_laptop": has_laptop,
            "has_tablet": has_tablet,
            "internet_access": internet_access,
        }
        
        data.append(row)
        
        if (i + 1) % 100 == 0:
            print(f"  Generated {i + 1}/{num_rows} records...")
    
    return data

def save_to_csv(data, filename):
    """Save data to CSV file"""
    if not data:
        print("No data to save!")
        return
    
    # Get all column names from first row
    fieldnames = list(data[0].keys())
    
    print(f"\nSaving to {filename}...")
    print(f"  Columns: {len(fieldnames)}")
    print(f"  Rows: {len(data)}")
    
    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
    
    file_size = os.path.getsize(filename) / (1024 * 1024)  # Size in MB
    print(f"  File size: {file_size:.2f} MB")
    print(f"  ✅ Saved successfully!")

def main():
    parser = argparse.ArgumentParser(description='Generate large school dataset for testing')
    parser.add_argument('--rows', type=int, default=1000, help='Number of student records to generate (default: 1000)')
    parser.add_argument('--output', type=str, default='./uploads', help='Output directory (default: ./uploads)')
    parser.add_argument('--filename', type=str, default='comprehensive_student_data', help='Output filename without extension (default: comprehensive_student_data)')
    
    args = parser.parse_args()
    
    # Create output directory if it doesn't exist
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate data
    print("=" * 70)
    print("School Data Generator - Large Dataset for Testing")
    print("=" * 70)
    
    data = generate_student_data(args.rows)
    
    # Save to CSV
    output_file = output_dir / f"{args.filename}.csv"
    save_to_csv(data, str(output_file))
    
    print("\n" + "=" * 70)
    print("✅ Generation Complete!")
    print("=" * 70)
    print(f"\nFile: {output_file}")
    print(f"Columns: {len(data[0].keys())}")
    print(f"Rows: {len(data)}")
    print(f"\nYou can now upload this file to test the analytics engine!")
    print(f"Expected performance:")
    print(f"  - Initial embedding cache: ~8-10 minutes")
    print(f"  - Query generation: 3-8 seconds")
    print(f"  - Memory usage: ~30 MB (bounded)")

if __name__ == "__main__":
    main()

