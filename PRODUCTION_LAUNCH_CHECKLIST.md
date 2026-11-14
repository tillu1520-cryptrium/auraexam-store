# Production Launch & Security Checklist

**Platform**: AuraExam Digital E-Commerce Platform  
**Target Environments**: Vercel (Frontend), Supabase (Database & Functions), Razorpay (Payments), Google Drive / Apps Script (Delivery)  

---

## 1. Database & Security Verification

- [ ] **Run Migration Script**: Execute [`supabase/schema.sql`](file:///c:/Users/KIIT/Desktop/project%201/supabase/schema.sql) in Supabase SQL Editor.
- [ ] **Verify Row Level Security (RLS)**: Ensure RLS is active on all 11 tables (`products`, `customers`, `orders`, `order_items`, `payments`, `deliveries`, `refunds`, `bonus_resources`, `admin_users`, `webhook_events`, `audit_logs`).
- [ ] **Restricted Views Checked**: Confirm that browser queries to `public_products` return product metadata without exposing `drive_file_id`.
- [ ] **Admin Account Configured**: Insert authorized administrator email and auth UUID into `admin_users` table with role `superadmin`.

---

## 2. Supabase Edge Functions Deployment & Secrets

- [ ] **Deploy Functions via Supabase CLI**:
  ```bash
  supabase functions deploy create-order
  supabase functions deploy verify-payment
  supabase functions deploy razorpay-webhook --no-verify-jwt
  supabase functions deploy admin-api
  supabase functions deploy submit-refund
  ```
- [ ] **Configure Supabase Secrets** (`Project Settings → Edge Functions → Secrets`):
  - [ ] `RAZORPAY_KEY_ID`: `rzp_test_...` (or `rzp_live_...` upon approval)
  - [ ] `RAZORPAY_KEY_SECRET`: Private gateway secret
  - [ ] `RAZORPAY_WEBHOOK_SECRET`: Private webhook HMAC secret
  - [ ] `SUPABASE_URL`: Hosted project URL
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`: Private service-role key
  - [ ] `GOOGLE_APPS_SCRIPT_WEBHOOK_URL`: Apps Script web app URL
  - [ ] `APPS_SCRIPT_SECRET_TOKEN`: Shared secret token

---

## 3. Razorpay Payment Gateway Protocol

- [ ] **Test Mode Complete**: Validate orders for ₹100, ₹150, ₹250, ₹300, and ₹400 in Razorpay Test Mode using test UPI/card instruments.
- [ ] **Signature Verification**: Ensure HMAC SHA256 verification rejects forged signatures.
- [ ] **Webhook Endpoint Configured**: In Razorpay Dashboard → **Settings** → **Webhooks**, add:
  `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`
  - Subscribed events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`.
- [ ] **Live Activation Approval**: Explicit owner sign-off required prior to switching keys.

---

## 4. Google Drive & Apps Script Delivery Pipeline

- [ ] **Upload PDFs**: Store the 3 subject 10-set PDFs in a private Google Drive folder.
- [ ] **Assign Drive IDs**: In Supabase `products` table, populate `drive_file_id` for Physics, BEE, and Mathematics.
- [ ] **Deploy Apps Script**:
  - Open [script.google.com](https://script.google.com) and paste [`apps-script/DeliveryWorker.gs`](file:///c:/Users/KIIT/Desktop/project%201/apps-script/DeliveryWorker.gs).
  - Set Script Properties: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `APPS_SCRIPT_SECRET_TOKEN`, `BRAND_NAME`.
  - Run `installDeliveryTrigger()` to schedule the 5-minute cron.
  - Deploy as Web App (`Who has access: Anyone`).
- [ ] **Customer Isolation Verified**: Confirm sharing permission is added exclusively as Viewer to the purchasing email.

---

## 5. Vercel Frontend Deployment

- [ ] **Run Local Tests**: `npm test` (all 21 tests must pass).
- [ ] **Run Build Validation**: `npm run build` (all 9 files verified).
- [ ] **Configure Vercel Environment**: Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BRAND_NAME`, `VITE_SUPPORT_EMAIL`.
- [ ] **Deploy to Production**: `vercel --prod` (executed only after approval).
