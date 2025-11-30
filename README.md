# Multi-Tenant Analytics Engine for Education Systems

A comprehensive analytics engine that converts natural language queries into SQL/query logic, generates insights, and provides data visualizations for education systems.

---

## 📋 Table of Contents

1. [What This Project Does](#what-this-project-does)
2. [Prerequisites Checklist](#prerequisites-checklist)
3. [Step-by-Step Installation](#step-by-step-installation)
4. [Environment Setup](#environment-setup)
5. [Running the Application](#running-the-application)
6. [Using the Application](#using-the-application)
7. [Troubleshooting](#troubleshooting)
8. [Project Structure](#project-structure)

---

## 🎯 What This Project Does

This analytics engine allows you to:
- **Ask questions in plain English** and get SQL queries automatically generated
- **View dashboard metrics** with 6 automatically generated key insights
- **Visualize data** using bar charts, line charts, pie charts, tables, scatter plots, gauges, and maps
- **Connect to multiple data sources**: SQL databases, canonical schemas, or CSV files

---

## ✅ Prerequisites Checklist

Before you start, make sure you have these installed:

### 1. Node.js (Version 18 or higher)

**Check if you have Node.js:**
```powershell
node --version
```

**If you don't have Node.js:**
- Download from: https://nodejs.org/
- Choose the LTS (Long Term Support) version
- Install it (default settings are fine)
- **Restart your terminal/PowerShell** after installation

**Verify installation:**
```powershell
node --version
npm --version
```
You should see version numbers like `v18.17.0` and `9.6.7`

### 2. Python (Version 3.9 or higher)

**Check if you have Python:**
```powershell
python --version
```

**If you don't have Python:**
- Download from: https://www.python.org/downloads/
- **IMPORTANT**: During installation, check "Add Python to PATH"
- Install it
- **Restart your terminal/PowerShell** after installation

**Verify installation:**
```powershell
python --version
pip --version
```
You should see version numbers like `Python 3.11.5` and `pip 23.2.1`

### 3. OpenAI API Key

**Get your API key:**
1. Go to: https://platform.openai.com/
2. Sign up or log in
3. Navigate to: https://platform.openai.com/api-keys
4. Click "Create new secret key"
5. Copy the key (it looks like: `sk-...`)
6. **Save it somewhere safe** - you'll need it in the next step

**Note**: You'll need a paid OpenAI account with credits. Free tier won't work.

### 4. Git (Optional but Recommended)

**Check if you have Git:**
```powershell
git --version
```

**If you don't have Git:**
- Download from: https://git-scm.com/download/win
- Install with default settings
- **Restart your terminal/PowerShell** after installation

---

## 🚀 Step-by-Step Installation

### Step 1: Open PowerShell in Your Project Folder

1. Navigate to your project folder: `C:\Users\HP\OneDrive\Desktop\k_gai`
2. Right-click in the folder
3. Select "Open in Terminal" or "Open PowerShell window here"
4. Or open PowerShell and run:
   ```powershell
   cd "C:\Users\HP\OneDrive\Desktop\k_gai"
   ```

### Step 2: Install Node.js Dependencies

**Run this command:**
```powershell
npm install
```

**What this does:**
- Downloads all required Node.js packages (Next.js, React, etc.)
- Creates a `node_modules` folder
- Takes 2-5 minutes depending on your internet speed

**Expected output:**
```
added 500+ packages, and audited 500+ packages in 2m
```

**If you see errors:**
- Make sure you're in the correct folder (should contain `package.json`)
- Check your internet connection
- Try: `npm cache clean --force` then `npm install` again

### Step 3: Install Python Dependencies

**Navigate to Python backend folder:**
```powershell
cd analytics-engine\python-backend
```

**Install Python packages:**
```powershell
pip install -r requirements.txt
```

**What this does:**
- Installs SQLAlchemy, Pandas, DuckDB, and database drivers
- Takes 1-3 minutes

**Expected output:**
```
Successfully installed sqlalchemy-2.0.23 pandas-2.1.4 duckdb-0.9.2 ...
```

**If you see errors:**
- Make sure Python is installed correctly
- Try: `python -m pip install -r requirements.txt`
- On Windows, you might need: `py -m pip install -r requirements.txt`

**Go back to project root:**
```powershell
cd ..\..
```

### Step 4: Create Environment Variables File

**Create the `.env.local` file:**

1. In your project folder (`k_gai`), create a new file named `.env.local`
2. **Important**: The file name starts with a dot (`.env.local`)
3. Open it in a text editor (Notepad, VS Code, etc.)

**Copy and paste this template:**
```env
# OpenAI API Configuration (REQUIRED)
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview

# Database Connection (OPTIONAL - only if using SQL database)
# Uncomment and fill in if you have a database:
# NEXT_PUBLIC_DB_CONNECTION_STRING=postgresql://user:password@localhost:5432/dbname

# For MySQL, use:
# NEXT_PUBLIC_DB_CONNECTION_STRING=mysql://user:password@localhost:3306/dbname

# For SQLite, use:
# NEXT_PUBLIC_DB_CONNECTION_STRING=sqlite:///path/to/database.db
```

**Replace `sk-your-actual-api-key-here` with your actual OpenAI API key**

**Save the file** (Ctrl+S)

**Verify the file exists:**
```powershell
dir .env.local
```

You should see the file listed.

---

## ⚙️ Environment Setup

### Understanding the Environment Variables

**Required Variables:**

1. **`OPENAI_API_KEY`**
   - Your OpenAI API key (starts with `sk-`)
   - **Required** for the LLM to generate SQL queries
   - Get it from: https://platform.openai.com/api-keys

2. **`OPENAI_MODEL`**
   - Which OpenAI model to use
   - Default: `gpt-4-turbo-preview`
   - You can also use: `gpt-3.5-turbo` (cheaper but less accurate)

**Optional Variables:**

3. **`NEXT_PUBLIC_DB_CONNECTION_STRING`**
   - Only needed if you're connecting to a real SQL database
   - Format: `postgresql://username:password@host:port/database`
   - If you're just testing with CSV files, you can skip this

### Example `.env.local` File

**For testing without a database:**
```env
OPENAI_API_KEY=sk-proj-abc123xyz789...
OPENAI_MODEL=gpt-4-turbo-preview
```

**For production with PostgreSQL:**
```env
OPENAI_API_KEY=sk-proj-abc123xyz789...
OPENAI_MODEL=gpt-4-turbo-preview
NEXT_PUBLIC_DB_CONNECTION_STRING=postgresql://admin:mypassword@localhost:5432/schooldb
```

---

## 🏃 Running the Application

### Step 1: Start the Development Server

**Make sure you're in the project root folder:**
```powershell
cd "C:\Users\HP\OneDrive\Desktop\k_gai"
```

**Start the server:**
```powershell
npm run dev
```

**What happens:**
- Next.js compiles your application
- Starts a local development server
- You'll see output like:

```
  ▲ Next.js 14.0.0
  - Local:        http://localhost:3000
  - Ready in 2.3s
```

**Keep this terminal window open!** The server needs to keep running.

### Step 2: Open the Application

1. Open your web browser (Chrome, Edge, Firefox, etc.)
2. Go to: **http://localhost:3000**
3. You should see the landing page

### Step 3: Access the Analytics Dashboard

1. Click the button "Go to Analytics Dashboard"
2. Or go directly to: **http://localhost:3000/analytics**
3. You should see the analytics interface with two tabs:
   - **Dashboard Metrics** (default)
   - **Adhoc Query**

---

## 📖 Using the Application

### Dashboard Metrics Tab

**What it does:**
- Automatically generates 6 key metrics for education analytics
- Shows visualizations for each metric

**How to use:**
1. Click on the **"Dashboard Metrics"** tab (should be selected by default)
2. Wait a few seconds for metrics to load
3. You'll see 6 cards with different metrics and visualizations

**Note**: The first time, it may take 10-30 seconds as it calls the OpenAI API.

### Adhoc Query Tab

**What it does:**
- Lets you ask questions in plain English
- Generates SQL queries automatically
- Shows results as visualizations

**How to use:**
1. Click on the **"Adhoc Query"** tab
2. Type a question in the input box, for example:
   - "What is the average score for 10th graders in Math?"
   - "How many students are enrolled in each grade?"
   - "Show me the top 5 subjects by average score"
3. Click the **"Ask"** button
4. Wait a few seconds (it's calling OpenAI API)
5. You'll see:
   - The generated SQL query
   - An insight summary
   - A visualization (if data is available)

**Example Questions to Try:**
- "What is the total number of students?"
- "Show me enrollment by grade level"
- "What are the average scores by subject?"

---

## 🔧 Troubleshooting

### Problem: "npm: command not found" or "npm is not recognized"

**Solution:**
- Node.js is not installed or not in PATH
- Reinstall Node.js from https://nodejs.org/
- **Restart your terminal/PowerShell** after installation
- Verify with: `node --version` and `npm --version`

### Problem: "python: command not found" or "pip is not recognized"

**Solution:**
- Python is not installed or not in PATH
- Reinstall Python from https://www.python.org/downloads/
- **IMPORTANT**: Check "Add Python to PATH" during installation
- **Restart your terminal/PowerShell** after installation
- Verify with: `python --version` and `pip --version`

### Problem: "Cannot find module 'next'" or similar errors

**Solution:**
- Dependencies are not installed
- Run: `npm install` in the project root folder
- Make sure you're in the correct folder (should have `package.json`)

### Problem: "OPENAI_API_KEY is not set" or API errors

**Solution:**
1. Check that `.env.local` file exists in the project root
2. Verify the file name is exactly `.env.local` (starts with a dot)
3. Make sure your API key is correct (starts with `sk-`)
4. Check that you have credits in your OpenAI account
5. **Restart the development server** after changing `.env.local`:
   - Stop the server (Ctrl+C)
   - Run `npm run dev` again

### Problem: Port 3000 is already in use

**Solution:**
- Another application is using port 3000
- Stop the other application, OR
- Use a different port:
  ```powershell
  $env:PORT=3001; npm run dev
  ```
- Then access: http://localhost:3001

### Problem: "Failed to generate query" or "Internal server error"

**Solution:**
1. Check your OpenAI API key is valid
2. Check you have credits in your OpenAI account
3. Check your internet connection
4. Look at the terminal/console for detailed error messages
5. Make sure `.env.local` file is in the project root (not in a subfolder)

### Problem: Visualizations not showing

**Solution:**
- This is normal if you don't have actual data connected
- The system generates queries but needs real data to visualize
- For testing, you can use CSV files or connect a test database

### Problem: Python packages installation fails

**Solution:**
- Try: `python -m pip install --upgrade pip`
- Then: `python -m pip install -r requirements.txt`
- On Windows, you might need: `py -m pip install -r requirements.txt`
- Make sure you're in the `analytics-engine\python-backend` folder

---

## 📁 Project Structure

```
k_gai/
├── analytics-engine/              # Core analytics engine
│   ├── types/                     # TypeScript type definitions
│   │   └── index.ts              # All type definitions
│   ├── services/                  # Core services
│   │   ├── llm-service.ts        # OpenAI integration for query generation
│   │   ├── schema-introspection.ts # Schema validation
│   │   ├── csv-processor.ts      # CSV file processing
│   │   └── query-executor.ts     # Query execution
│   └── python-backend/           # Python services
│       ├── schema_introspection.py
│       ├── csv_processor.py
│       ├── query_executor.py
│       └── requirements.txt      # Python dependencies
├── app/                           # Next.js app directory
│   ├── api/analytics/            # API routes
│   │   ├── route.ts             # Main analytics API
│   │   ├── execute/route.ts     # Query execution API
│   │   └── schema/route.ts     # Schema introspection API
│   ├── analytics/               # Analytics page
│   │   └── page.tsx
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home page
│   └── globals.css              # Global styles
├── components/analytics/         # React components
│   ├── AdhocQuery.tsx           # Natural language query interface
│   ├── DashboardMetrics.tsx     # Dashboard metrics display
│   ├── VisualizationRenderer.tsx # Routes to correct visualization
│   └── visualizations/          # Individual chart components
│       ├── BarChart.tsx
│       ├── LineChart.tsx
│       ├── PieChart.tsx
│       ├── Table.tsx
│       ├── ScatterPlot.tsx
│       ├── Gauge.tsx
│       └── MapView.tsx
├── .env.local                    # Environment variables (YOU CREATE THIS)
├── package.json                  # Node.js dependencies
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── next.config.js                # Next.js configuration
└── README.md                     # This file
```

---

## 🎓 Quick Start Summary

**Copy-paste these commands in order:**

```powershell
# 1. Navigate to project folder
cd "C:\Users\HP\OneDrive\Desktop\k_gai"

# 2. Install Node.js dependencies
npm install

# 3. Install Python dependencies
cd analytics-engine\python-backend
pip install -r requirements.txt
cd ..\..

# 4. Create .env.local file (see Environment Setup section above)
# Copy the template and add your OpenAI API key

# 5. Start the server
npm run dev

# 6. Open browser to http://localhost:3000/analytics
```

---

## 📞 Need Help?

If you're stuck:
1. Check the **Troubleshooting** section above
2. Look at the terminal/console for error messages
3. Verify all prerequisites are installed correctly
4. Make sure `.env.local` file exists and has your API key

---

## 🎉 You're All Set!

Once everything is running:
- ✅ Server is running on http://localhost:3000
- ✅ You can ask questions in the Adhoc Query tab
- ✅ You can view dashboard metrics
- ✅ Visualizations will appear automatically

**Happy analyzing!** 🚀
