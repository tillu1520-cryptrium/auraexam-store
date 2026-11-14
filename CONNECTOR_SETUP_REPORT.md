# Connector, MCP & Integration Setup Report (Phase 0)

**Date**: 2026-11-14  
**Project**: Exam Question Paper PDF Store  
**Environment**: Windows 11 (26H2), Antigravity IDE v1.107.0 (VS Code core 1.143.1)  
**Workspace Root**: `c:\Users\KIIT\Desktop\project 1`  

---

## 1. Environment & MCP Configuration Audit

* **Antigravity IDE Version**: `1.107.0` (x64)
* **MCP Architecture**: Supports Stdio Transport (local processes) and Streamable HTTP Transport (remote services).
* **Existing Configuration**:
  * Active MCP Config: [`~/.gemini/config/mcp_config.json`](file:///C:/Users/KIIT/.gemini/config/mcp_config.json)
  * Existing Integrations: `flow-connector` (daemon), `dart` (Flutter/Dart MCP server).
* **Backup Action**:
  * Successfully created backup at [`~/.gemini/config/mcp_config.backup.json`](file:///C:/Users/KIIT/.gemini/config/mcp_config.backup.json).
  * Existing integrations were strictly preserved without overwriting.
* **Security & Isolation**:
  * Initialized local Git repository at `c:\Users\KIIT\Desktop\project 1\.git`.
  * Created comprehensive `.gitignore` preventing all `.env`, secret keys, credentials, tokens, and certificates from being tracked.
  * Created sanitized `.env.example` for safe developer onboarding.

---

## 2. Integration Verification Summary Table

| Integration | Category | Installed | Authenticated | Connected | Status | Required Verification Performed |
|---|---|---|---|---|---|---|
| **Supabase** | Backend & Database | Installed (`supabase` plugin v0.1.17) | Sign-in Pending | Disconnected | **NEEDS MY ACTION** | Plugin installed; MCP server `https://mcp.supabase.com/mcp` registered. Awaiting user sign-in via chat card. |
| **GitHub** | Source Control | Installed (`gh` v2.104.0 + Git) | Authentication Required | Local Repo Ready | **NEEDS MY ACTION** | Installed GitHub CLI via Winget; initialized local repository; verified `gh auth status` (login needed). |
| **Razorpay** | Payment Gateway | SDK / API Integration Ready | Authentication Required | Disconnected | **NEEDS MY ACTION** | Evaluated official MCP `mcp.razorpay.com/mcp`; enforced security rule to use server-side SDK/REST API in Test Mode without exposing Key Secret. |
| **Google Drive** | Private Storage | Available (Marketplace Plugin) | Authentication Required | Disconnected | **NEEDS MY ACTION** | Probed Antigravity official catalog for `gdrive` v0.0.11; defined private customer isolation architecture. |
| **Apps Script** | Delivery Webhook | Webhook Workflow Designed | Authentication Required | Disconnected | **NEEDS MY ACTION** | Designed secure payment-confirmed delivery pipeline; awaiting deployment ID and shared secret. |
| **Frontend Hosting** | Deployment | Available (Netlify Marketplace Plugin) | Authentication Required | Disconnected | **NEEDS MY ACTION** | Probed Antigravity partner catalog for `netlify` v1.9.0; ready for CLI / plugin connection. |
| **Google Developer Knowledge** | Platform Docs | Available (Marketplace Plugin) | Authentication Required | Disconnected | **NEEDS MY ACTION** | Verified `google-developer-knowledge` v1.0.3 in official catalog. |

---

## 3. Detailed Integration Breakdown & Action Items

### A. Supabase (PostgreSQL Backend & Auth)
* **Status**: `NEEDS MY ACTION`
* **Inspection**: Remote HTTP MCP server endpoint `https://mcp.supabase.com/mcp` is active and responsive. The official partner plugin `antigravity-plugins-partners/plugin/supabase` is available in the marketplace.
* **Security**: Read-only schema introspection initially. Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser/frontend code.
* **Action Required From You**:
  1. Install the official Supabase plugin from the card in chat.
  2. Complete the browser-based authorization to link your Supabase account.
  3. Select the specific Supabase project for the Exam Paper Store.

---

### B. GitHub (Source Control)
* **Status**: `NEEDS MY ACTION`
* **Inspection**: GitHub CLI (`gh` v2.104.0) has been installed on Windows at `C:\Program Files\GitHub CLI\gh.exe` and added to PATH. Git is initialized at `c:\Users\KIIT\Desktop\project 1`.
* **Security**: Comprehensive `.gitignore` is in place. No secrets, `.env` files, or customer data will be committed.
* **Action Required From You**:
  1. Open PowerShell or Command Prompt on your Windows laptop.
  2. Run the command:
     ```powershell
     gh auth login
     ```
  3. Select **GitHub.com** → **HTTPS** → **Yes** (Authenticate Git with your GitHub credentials) → **Login with a web browser**.
  4. Enter the one-time code shown in your terminal into the browser page to authorize.
  5. Provide your target GitHub repository name (e.g., `PriyanshuPal5050/exam-paper-store`).

---

### C. Razorpay (Payment Gateway)
* **Status**: `NEEDS MY ACTION`
* **Inspection**: Official Razorpay MCP server exists at `https://mcp.razorpay.com/mcp`. However, following your strict security guidelines, Razorpay will be integrated via its official server-side REST API/SDK with test credentials to prevent exposing `RAZORPAY_KEY_SECRET` in MCP configuration files or frontend code.
* **Security**:
  * Strictly restricted to **Test Mode** (`rzp_test_...`).
  * No live payments will be activated without your explicit written approval.
  * Server-side signature verification implemented using HMAC SHA256.
* **Action Required From You**:
  1. Log in to your [Razorpay Dashboard](https://dashboard.razorpay.com).
  2. Ensure the top-right toggle is set to **Test Mode**.
  3. Navigate to **Account & Settings** → **API Keys** → **Generate Test Key**.
  4. Paste the `Key Id` and `Key Secret` into your private `.env` file (copy from `.env.example`).
  5. Never share your secret in chat.

---

### D. Google Drive (Private PDF Storage)
* **Status**: `NEEDS MY ACTION`
* **Inspection**: Official `gdrive` Antigravity plugin is available.
* **Security & Isolation**:
  * Question paper PDFs MUST NEVER be publicly accessible or world-readable.
  * Files will be stored in a dedicated private Google Drive folder accessible only by the service account / app.
* **Action Required From You**:
  1. Create a dedicated Google Drive folder (e.g., `Exam_Papers_Vault`).
  2. Install the Google Drive plugin from the card in chat or provide a Google Service Account key for backend automation.
  3. Add the `GOOGLE_DRIVE_FOLDER_ID` to `.env`.

---

### E. Google Apps Script (PDF Delivery Workflow)
* **Status**: `NEEDS MY ACTION`
* **Inspection**: The delivery architecture uses an Apps Script Web App that receives verified webhook payloads from the backend upon successful Razorpay payment capture.
* **Security**:
  * Uses a shared secret header (`X-Delivery-Token`) to verify requests originated from your backend.
  * Each customer receives isolated access to only their purchased paper via an expiring download link or direct email delivery.
* **Action Required From You**:
  1. Open [script.google.com](https://script.google.com) and create a new project.
  2. Paste the provided delivery script (generated in Phase 1).
  3. Click **Deploy** → **New deployment** → Type: **Web app** → Access: **Anyone with the link**.
  4. Copy the Web App URL and paste it as `GOOGLE_APPS_SCRIPT_WEBHOOK_URL` in `.env`.

---

### F. Frontend Hosting (Netlify)
* **Status**: `NEEDS MY ACTION`
* **Inspection**: Official Netlify Antigravity partner plugin is available (`antigravity-plugins-partners/plugin/netlify` v1.9.0).
* **Security**: Client build variables will only include public variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RAZORPAY_KEY_ID`). All backend secrets remain on the server.
* **Action Required From You**:
  1. Install the Netlify plugin from the card in chat if you plan to deploy to Netlify.
  2. Authorize Netlify to link your hosting account.

---

### G. Google Developer Knowledge (Platform Docs)
* **Status**: `NEEDS MY ACTION`
* **Inspection**: Available as `antigravity-plugins-official/plugin/google-developer-knowledge` (v1.0.3).
* **Action Required From You**:
  1. Install the plugin from the card in chat to enable in-editor search for Google Cloud, Apps Script, and Google API documentation.

