# CareerOS Extension — Install & Run Guide

How to load CareerOS in **any Chrome-based browser** (Chrome, Edge, Brave) and run the full system.

---

## 1. Get the Files

Either clone this repo or receive the `extension/` folder as a zip.

If zip: unzip it, keep folder structure intact. You should have:
```
extension/
  manifest.json
  background.js
  content/
  popup/
  options/
  icons/
  lib/
```

---

## 2. Load the Extension (Chrome / Brave / Edge)

> These steps work on any Chromium-based browser. **Does not require publishing to Chrome Web Store.**

1. Open browser and go to the extensions page:
   - Chrome: `chrome://extensions/`
   - Brave: `brave://extensions/`
   - Edge: `edge://extensions/`

2. Enable **Developer mode** — toggle in the top-right corner.

3. Click **Load unpacked**.

4. Select the `extension/` folder (the one containing `manifest.json`).

5. Extension appears — pin it to toolbar for easy access (puzzle icon → pin CareerOS).

---

## 3. Run the Backend (Required)

Extension talks to `http://localhost:5001`. You must have the CareerOS backend running locally.

```bash
# From job-applications/
source venv/bin/activate

# Install deps if first time
pip install -r requirements.txt

# Start backend
uvicorn api.server:app --reload --port 5001
```

Backend is ready when terminal shows:
```
INFO:     Uvicorn running on http://0.0.0.0:5001
```

---

## 4. (Optional) Run the Dashboard UI

```bash
# From job-applications/dashboard/
npm install       # first time only
npm run dev
```

Dashboard opens at `http://localhost:5173`.

---

## 5. Sign In via Extension

1. Click the CareerOS icon in toolbar.
2. Enter credentials (same as dashboard login).
3. Popup shows "Connected" — extension is live.

If backend isn't running, popup shows a connection error.

---

## 6. Use the Extension

### Save a Job
1. Go to any job listing (LinkedIn, Indeed, Greenhouse, Lever, Workday, Ashby, etc.)
2. CareerOS panel slides in from the right — shows detected role + company.
3. Click **Save to CareerOS** → job saved to your dashboard.

### Autofill an Application
1. Open a job application form.
2. CareerOS Copilot panel appears on the right.
3. Click **Autofill** → fills name, email, phone, work experience from your profile.
4. Review everything. Click submit yourself — **never auto-submits.**

---

## 7. Change Backend URL (if not localhost:5001)

1. Click CareerOS icon → gear icon (⚙ Settings).
2. Update API URL to match your backend address.
3. Save.

---

## Sharing With Others

To give someone else the extension:

1. Zip the `extension/` folder.
2. Send them the zip + this guide.
3. They unzip and follow steps 2–5 above.
4. They also need their own backend running (step 3) with their own credentials.

> The extension is tied to whoever runs the backend locally — each person runs their own instance.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "Could not connect to backend" | Start uvicorn (step 3) |
| Panel doesn't appear on job sites | Refresh the page after loading extension |
| Extension shows error after load | Check `chrome://extensions/` for error details, click "Errors" |
| Login fails | Confirm backend is on port 5001; check credentials |
| Autofill misses fields | Profile may be incomplete — finish onboarding in dashboard |
