# ⚡ Quick Start Checklist

Follow these steps in order. Check each box as you complete it.

## ✅ Prerequisites Check

- [ ] Node.js installed (`node --version` shows v18+)
- [ ] npm installed (`npm --version` shows version)
- [ ] Python installed (`python --version` shows 3.9+)
- [ ] pip installed (`pip --version` shows version)
- [ ] OpenAI API key obtained (from https://platform.openai.com/api-keys)

## 📦 Installation Steps

- [ ] Opened PowerShell in project folder: `C:\Users\HP\OneDrive\Desktop\k_gai`
- [ ] Ran `npm install` (takes 2-5 minutes)
- [ ] Navigated to `analytics-engine\python-backend`
- [ ] Ran `pip install -r requirements.txt` (takes 1-3 minutes)
- [ ] Returned to project root folder

## 🔐 Environment Setup

- [ ] Created `.env.local` file in project root
- [ ] Added `OPENAI_API_KEY=sk-your-key-here`
- [ ] Added `OPENAI_MODEL=gpt-4-turbo-preview`
- [ ] Saved the file

## 🚀 Running

- [ ] In project root, ran `npm run dev`
- [ ] Server started successfully (shows "Ready" message)
- [ ] Opened browser to http://localhost:3000
- [ ] Clicked "Go to Analytics Dashboard" or went to http://localhost:3000/analytics
- [ ] Can see the analytics interface with two tabs

## 🎯 Testing

- [ ] Clicked "Dashboard Metrics" tab - metrics are loading
- [ ] Clicked "Adhoc Query" tab
- [ ] Typed a test question: "What is the total number of students?"
- [ ] Clicked "Ask" button
- [ ] Query was generated successfully

## ✨ Success!

If all boxes are checked, you're ready to use the analytics engine!

---

## 🆘 Having Issues?

1. **Check the full README.md** for detailed troubleshooting
2. **Verify prerequisites** are installed correctly
3. **Check `.env.local`** file exists and has correct API key
4. **Look at terminal** for error messages

---

## 📝 Quick Command Reference

```powershell
# Install everything
npm install
cd analytics-engine\python-backend
pip install -r requirements.txt
cd ..\..

# Start server
npm run dev

# Stop server
Ctrl+C
```

---

**Next Steps:** Read the full README.md for detailed explanations and advanced usage!

