# Vercel Deployment & Environment Configuration Guide

This document details the configuration for deploying the **AuraExam** frontend exclusively to **Vercel** across Development, Preview, and Production environments.

---

## 1. Vercel Architecture Overview

- **Hosting Type**: Static Single-Page Application (SPA) with Serverless Rewrites
- **Root Directory**: `web/` (configured via `outputDirectory` in `vercel.json`)
- **CLI Installed**: Vercel CLI `65.16.0` (native)
- **Configuration File**: [`vercel.json`](file:///c:/Users/KIIT/Desktop/project%201/vercel.json)
- **Exclusion Filter**: [`.vercelignore`](file:///c:/Users/KIIT/Desktop/project%201/.vercelignore)

---

## 2. Windows 11 Setup & Linking Instructions

To link and authenticate your local project with Vercel on Windows 11:

### Step 1: Login via Browser
Run the following in PowerShell:
```powershell
vercel login
```
Select your login provider (**Continue with GitHub**, **Continue with Google**, or **Continue with Email**). Authorize in the browser window that opens.

### Step 2: Link the Project
From the project root (`c:\Users\KIIT\Desktop\project 1`), execute:
```powershell
vercel link
```
* **Set up “c:\Users\KIIT\Desktop\project 1”?** `y`
* **Which scope do you want to link to?** Select your Vercel personal account or team.
* **Link to existing project?** `n` (or `y` if you have already created a project on the Vercel dashboard).
* **What’s your project’s name?** `auraexam-store`

---

## 3. Environment Variable Checklist

Configure these environment variables in your **Vercel Dashboard → Project Settings → Environment Variables**:

| Variable Name | Exposure | Development | Preview | Production | Description |
|---|---|:---:|:---:|:---:|---|
| `VITE_SUPABASE_URL` | Client (Public) | Local / Staging URL | Staging Project URL | Production Supabase URL | Supabase API endpoint (`https://xyz.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Client (Public) | Anon Key | Anon Key | Production Anon Key | Supabase publishable anonymous key |
| `VITE_BRAND_NAME` | Client (Public) | AuraExam Dev | AuraExam Preview | AuraExam | Display brand name |
| `VITE_SUPPORT_EMAIL` | Client (Public) | support-dev@auraexam.com | support-staging@auraexam.com | support@auraexam.com | Customer support contact |

> [!CAUTION]
> **Strict Security Separation**:
> - **NEVER** add `RAZORPAY_KEY_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_WEBHOOK_SECRET`, or `APPS_SCRIPT_SECRET_TOKEN` to Vercel frontend environment variables.
> - Server-side secrets belong strictly inside **Supabase Dashboard → Edge Functions → Secrets** and **Google Apps Script → Script Properties**.

---

## 4. Deployment Environments

### A. Development (Local)
Local testing with hot reload and automated test runners:
```powershell
# Run automated tests
npm test

# Test local static server
npm run build
npx serve web
```

### B. Preview Deployments
Every push to a non-production branch (e.g. `develop` or pull requests) triggers an isolated preview URL:
```powershell
# Generate manual preview via CLI
vercel
```

### C. Production Deployments
Promoted only after explicit owner approval:
```powershell
vercel --prod
```

---

## 5. Automated GitHub Actions CI/CD Pipeline

The project includes an enterprise GitHub Actions workflow at [`.github/workflows/deploy.yml`](file:///c:/Users/KIIT/Desktop/project%201/.github/workflows/deploy.yml):

1. **Automated Gate**: Runs `npm test` (all 21 platform unit and integration scenarios) and `npm run build`.
2. **Branch Isolation**:
   - Pushes to feature/development branches deploy to **Vercel Preview**.
   - Pushes to `main` / `master` deploy to **Vercel Production**.
3. **Required GitHub Repository Secrets**:
   - `VERCEL_TOKEN`: Generated from [Vercel Account Tokens](https://vercel.com/account/tokens).
   - `VERCEL_ORG_ID`: Found in `.vercel/project.json` after linking.
   - `VERCEL_PROJECT_ID`: Found in `.vercel/project.json` after linking.

