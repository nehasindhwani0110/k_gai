# Quick Start: Testing Large Dataset

## 🚀 Quick Test Steps

### 1. Generate Test Data

```powershell
cd k_gai
python scripts/generate_large_school_data.py --rows 500 --output ./uploads
```

**Output**: `uploads/comprehensive_student_data.csv`
- ✅ 66 columns (dimensions)
- ✅ 500 rows
- ✅ ~0.27 MB

### 2. Start the Server

```powershell
# Terminal 1: Start Next.js server
npm run dev

# Terminal 2: Start Python backend (optional, for SQL databases)
npm run python:backend
```

### 3. Test in Browser

1. Open: `http://localhost:3000`
2. Upload: `uploads/comprehensive_student_data.csv`
3. Try queries:
   - "What is the average CGPA of all students?"
   - "Show me students with attendance above 90%"
   - "Which class has the highest average math score?"

### 4. Or Run Automated Test

```powershell
# In a new terminal (server must be running)
python scripts/test_large_dataset.py --file ./uploads/comprehensive_student_data.csv
```

---

## 📊 Generated Dataset Details

The script generates realistic school data with **66 columns**:

### Academic (13 columns)
- student_id, admission_number, roll_number
- current_class, section, academic_year
- cgpa, attendance_percentage, percentage, total_marks
- math_score, english_score, science_score, social_studies_score, hindi_score, computer_science_score

### Personal (8 columns)
- full_name, first_name, last_name
- gender, date_of_birth, age
- blood_group, height_cm, weight_kg, bmi

### Contact (7 columns)
- email, phone, address
- city, state, pincode

### Family (9 columns)
- father_name, mother_name
- father_occupation, mother_occupation
- father_phone, mother_phone
- father_email, mother_email
- annual_income

### Admission (3 columns)
- admission_date, previous_school

### Extracurricular (6 columns)
- has_sports, sports_category
- has_music, music_instrument
- has_arts, art_category

### Transport (3 columns)
- transport_mode, bus_route, distance_from_school_km

### Health (2 columns)
- has_medical_condition, medical_condition

### Financial (4 columns)
- fee_status, total_fee, paid_amount, pending_amount

### Behavioral (3 columns)
- discipline_score, behavior_rating, number_of_warnings

### Library (2 columns)
- books_issued, library_fine

### Technology (3 columns)
- has_laptop, has_tablet, internet_access

**Total: 66 columns** - Perfect for testing scalability!

---

## ✅ What to Expect

### Performance (After Fixes)
- ✅ First query: 5-15s (includes embedding generation)
- ✅ Subsequent queries: 3-8s (uses cache)
- ✅ Memory usage: ~30 MB (bounded)
- ✅ No rate limit errors
- ✅ No timeout errors

### Sample Queries to Test

1. **Simple Aggregation**:
   - "What is the average CGPA?"
   - "How many students are in each class?"

2. **Filtering**:
   - "Show students with attendance above 90%"
   - "Find students with pending fees"

3. **Grouping**:
   - "Compare average scores by gender"
   - "Which class has the highest math score?"

4. **Ranking**:
   - "Show top 10 students by total marks"
   - "Which students have the lowest attendance?"

5. **Distribution**:
   - "What is the distribution of students by blood group?"
   - "Which transport mode is most common?"

---

## 🎯 Success Indicators

✅ **Embedding Cache Working**:
- Check server logs for batch processing
- Should see: `[EMBEDDING-CACHE] Processing batch X/Y...`

✅ **Memory Bounded**:
- Memory should stay around 30-50 MB
- Should not grow unbounded

✅ **Fast Queries**:
- First query: 5-15s
- Subsequent: 3-8s

✅ **Accurate Results**:
- Queries return correct data
- Visualizations render properly

---

## 📝 Notes

- The generated CSV has **66 columns** - perfect for testing large schema handling
- You can generate more rows: `--rows 1000` or `--rows 2000`
- All data is realistic and follows proper data types
- The script uses Indian school naming conventions (can be customized)

---

Ready to test! 🚀

