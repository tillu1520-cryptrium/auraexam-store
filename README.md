# AuraExam — Premium Examination Preparation E-Commerce Platform

A production-oriented, secure digital educational product platform engineered with an **Apple-inspired Liquid Glass design language**. The platform sells curated, subject-wise 10-set examination preparation bundles with automated Google Drive PDF delivery, Razorpay payment processing, and a 75% concept-matching refund policy.

---

## 1. High-Level Architecture

* **Frontend**: Vanilla ES6+ & Liquid Glass CSS (Hosted exclusively on **Vercel**).
* **Database & Auth**: **Supabase PostgreSQL** with strict Row Level Security (RLS) and restricted catalog views.
* **Backend Services**: **Supabase Edge Functions** (Deno runtime) for cryptographic payment validation, order creation, administrative APIs, and webhook processing.
* **Payment Gateway**: **Razorpay Standard Checkout** with server-side HMAC SHA256 signature verification and webhook idempotency.
* **Storage & Delivery**: **Google Drive API & Google Apps Script** delivering private PDF access directly to verified customer Google accounts.

---

## 2. Product Catalogue Structure

| Subject | Price | Bundle Contents |
|---|---:|---|
| **Physics** | ₹150 (15,000 paise) | **1 Complete PDF** containing Sets 1 through 10 + Bonus Formula Compendium |
| **Basic Electrical Engineering** | ₹150 (15,000 paise) | **1 Complete PDF** containing Sets 1 through 10 + Circuit Quick-Reference |
| **Mathematics** | ₹100 (10,000 paise) | **1 Complete PDF** containing Sets 1 through 10 + Calculus Formula Card |

> [!IMPORTANT]
> **Single Bundle Delivery**: Each subject is delivered as **ONE complete PDF** containing 10 individual question-paper sets. They are not sold as 10 separate products.

---

## 3. Windows 11 Developer Setup Instructions

### Prerequisites
* Windows 11 (22H2 or higher)
* Node.js v20+ and npm v10+ (Verified on Node v24.19.0)
* Git and GitHub CLI (`gh.exe`)
* Vercel CLI (`vercel` v65.16.0)

### Quick Start
1. **Clone & Install Dependencies**:
   ```powershell
   git clone <repository-url>
   cd "project 1"
   npm install
   ```
2. **Execute Automated Test Suite**:
   ```powershell
   npm test
   ```
3. **Execute Production Build Validation**:
   ```powershell
   npm run build
   ```
4. **Launch Local Storefront**:
   ```powershell
   npm start
   ```
   Open `http://localhost:3000` (or the terminal port) in your browser.

---

## 4. Vercel Frontend Deployment Workflow

The platform uses **Vercel** as its exclusive hosting provider:

1. **Authenticate Vercel CLI**:
   ```powershell
   vercel login
   ```
2. **Link the Repository**:
   ```powershell
   vercel link
   ```
3. **Generate a Preview Deployment**:
   ```powershell
   vercel
   ```
4. **Promote to Production** (Requires owner sign-off):
   ```powershell
   vercel --prod
   ```

Refer to [`VERCEL_SETUP.md`](file:///c:/Users/KIIT/Desktop/project%201/VERCEL_SETUP.md) for environment variables and GitHub Actions setup.

---

## 5. Backend & Database Deployment

1. **Postgres Database**: Open Supabase SQL Editor and execute [`supabase/schema.sql`](file:///c:/Users/KIIT/Desktop/project%201/supabase/schema.sql).
2. **Deploy Edge Functions**:
   ```bash
   supabase functions deploy create-order
   supabase functions deploy verify-payment
   supabase functions deploy razorpay-webhook --no-verify-jwt
   supabase functions deploy admin-api
   supabase functions deploy submit-refund
   ```
3. **Set Secrets in Supabase Dashboard**:
   * `RAZORPAY_KEY_ID`: `rzp_test_...`
   * `RAZORPAY_KEY_SECRET`: Private Razorpay Secret
   * `RAZORPAY_WEBHOOK_SECRET`: Webhook Secret
   * `SUPABASE_URL`: Supabase Project URL
   * `SUPABASE_SERVICE_ROLE_KEY`: Service role key
   * `GOOGLE_APPS_SCRIPT_WEBHOOK_URL`: Apps Script Web App URL

---

## 6. Google Drive & Apps Script Delivery Pipeline

1. Upload the 3 complete subject PDFs to a private folder in Google Drive.
2. In Supabase `products` table, populate `drive_file_id` with each file's Drive ID.
3. Open [script.google.com](https://script.google.com) and paste [`apps-script/DeliveryWorker.gs`](file:///c:/Users/KIIT/Desktop/project%201/apps-script/DeliveryWorker.gs).
4. Configure Script Properties (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `APPS_SCRIPT_SECRET_TOKEN`).
5. Run `installDeliveryTrigger()` once to enable 5-minute automated delivery checks.
6. Deploy as Web App (`Who has access: Anyone`) and set the URL as `GOOGLE_APPS_SCRIPT_WEBHOOK_URL`.

---

## 7. 75% Money-Back Policy & Concept Matching

* If **zero** questions from a purchased 10-set bundle match the exam, a **75% refund** of that subject's purchase price is awarded.
* **Concept-Matching Clause**: Variations in numerical values, wording, or figures still count as a match if the underlying concept or solution technique is substantially identical.
* If 1 or more questions match, no refund is granted.
* Claims are filed at `/refund` (`refund.html`) and reviewed via the Admin Portal (`admin.html`).

---

## 8. Automated Test Suite Summary

Run all 21 automated unit and integration tests covering pricing, cryptographic signatures, delivery isolation, and build integrity:
```powershell
npm test
```
See [`tests/`](file:///c:/Users/KIIT/Desktop/project%201/tests/) for complete test implementations.
