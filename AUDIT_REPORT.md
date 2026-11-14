# Comprehensive Architecture & Code Audit Report (Milestone 1)

**Application**: Premium Exam Preparation E-Commerce Platform (Liquid Glass Edition)  
**Date**: 2026-11-14  
**Audit Lead**: Principal Full-Stack & Security Engineer  

---

## 1. Executive Summary

An in-depth security, functional, and architectural audit was performed on the `exam_prep_hybrid_starter.zip` code bundle. While the starter provides a foundational skeleton (Supabase Edge Functions for Razorpay, a database schema, and an initial web interface), substantial enhancements, security hardenings, and missing production components were identified.

---

## 2. Component-by-Component Findings

### A. Database Schema (`supabase/schema.sql`)
| Item | Severity | Finding & Impact | Recommended Fix |
|---|---|---|---|
| **Missing Admin RBAC** | **CRITICAL** | Zero admin authorization or role tables exist. Any authenticated Supabase user or admin has no policy to inspect orders or process refunds securely. | Implement `admin_users` table linked to Supabase Auth UUIDs, with role checks (`superadmin`, `reviewer`). |
| **Missing Bonus Resources Entity** | **HIGH** | Schema only has a single `bonus_folder_id` in `products`. Cannot assign complementary PDFs across multiple subjects or globally. | Create dedicated `bonus_resources` table and `order_item_bonus_deliveries` relation. |
| **Missing Refund Decision Logs** | **HIGH** | `refunds` table lacks reviewer ID, decision notes, timestamp of review, and granular calculation fields for the 75% policy. | Expand `refunds` with `reviewed_by`, `decision_notes`, `refund_ratio`, `upi_verification_status`. |
| **Missing Webhook Idempotency Table** | **HIGH** | Razorpay webhooks can fire multiple times. If processed concurrently, duplicate delivery entries or race conditions could occur. | Implement `webhook_events` table with unique constraint on `(gateway, event_id)` for guaranteed deduplication. |
| **Unindexed Foreign Keys** | **MEDIUM** | `order_items(order_id)` and `deliveries(customer_email)` are unindexed, which degrades query performance as orders scale. | Add explicit B-Tree indexes for all foreign keys. |
| **Lack of Automated Timestamp Triggers** | **LOW** | `updated_at` columns on `products` and `orders` do not update automatically on row modification. | Add `moddatetime` trigger or custom update function. |

---

### B. Backend Edge Functions (`supabase/functions/`)
| Function | Issue | Risk | Resolution |
|---|---|---|---|
| `create-order` | Loose validation on academic roll number; no customer deduplication (creates a new customer row for every repeat order). | Database bloat, invalid user inputs. | Normalize customer records by email; add strict roll number and phone number sanitization. |
| `verify-payment` | Delivery creation ignores bonus/complementary materials; returns generic errors that make user recovery difficult. | Missing deliverables; poor UX. | Automatically attach active bonus resources on payment verification; return explicit status codes. |
| `razorpay-webhook` | Ignores `payment.failed`, `order.paid`, and refund events (`refund.processed`). No idempotency logging table. | Lost transaction state; no automated record of failed payments. | Handle all gateway events; persist webhook payload to `webhook_events` before execution. |
| **Missing Admin Functions** | **CRITICAL** | No edge functions exist for administrative overview metrics, order search, refund decisions, or product updates. | Implement `admin-api` edge function protected by Supabase Auth JWT and admin role verification. |
| **Missing Customer Refund API** | **HIGH** | Customers have no endpoint to submit exam paper evidence, specify exam dates, and initiate 75% refund claims. | Implement `submit-refund` edge function with validation and evidence attachment. |

---

### C. Frontend Interface (`web/`)
| Area | Issue | Resolution |
|---|---|---|
| **Design Language** | Current design is minimal and generic with placeholder text ("YOUR BRAND"). Lacks true Apple-inspired Liquid Glass depth. | Re-engineer with Apple Liquid Glass aesthetic: multi-layered glass cards, specular highlights, dynamic glow ambient mesh, smooth physics-inspired micro-interactions. |
| **Brand Identity** | Generic placeholder logo and branding. | Design an original animated SVG brand mark ("AuraPrep / LuminaExam") with glowing orbital rings and smooth CSS animations. Strictly avoid KIIT or university names. |
| **Cart & Checkout UX** | Unable to remove individual items in summary; no modal confirmation with delivery tracker; no visual breakdown of the 10-set bundle contents. | Add full interactive item removal, real-time integer paise calculation, dynamic badge counters, and a post-payment receipt modal. |
| **Missing Admin Dashboard** | Completely absent. | Build a dedicated, secure administrator portal (`admin.html`) with revenue KPIs, order management, refund review workflows, and catalog controls. |
| **Missing Refund Portal** | Customers cannot file claims or view policy terms interactively. | Build an interactive refund request interface (`refund.html`) with file upload preview, order lookup, and eligibility terms calculator. |

---

### D. Google Drive Delivery Automation (`apps-script/DeliveryWorker.gs`)
| Issue | Severity | Resolution |
|---|---|---|
| **5-Minute Polling Delay** | **MEDIUM** | Delivery only triggers every 5 minutes. Customers expect immediate access post-purchase. | Add support for immediate HTTP webhook invocation from `verify-payment` to Apps Script, with the 5-minute cron serving as a fallback. |
| **Plain Text Email** | **LOW** | Emails look unbranded and unformatted. | Implement an Apple-styled responsive HTML email template with clear buttons, security instructions, and support links. |
| **Customer Isolation** | **CRITICAL** | Ensure files are shared via Drive Viewer permissions strictly to the verified buyer's email, preventing public link leaks. | Verify Drive file permission scopes and include clear guidance for non-Google email buyers. |

---

## 3. Implementation Plan by Milestone
1. **Milestone 2**: Complete database schema rewrite with admin tables, bonus resources, webhook idempotency, and strict RLS policies.
2. **Milestone 3**: Apple-inspired Liquid Glass storefront (`index.html`, `styles.css`, `app.js`).
3. **Milestone 4**: Robust Razorpay integration across Supabase Edge Functions with full event support.
4. **Milestone 5**: Enhanced Google Drive & Apps Script delivery with HTML emails and dual-trigger execution.
5. **Milestone 6**: High-security Admin Dashboard (`admin.html`, `admin.js`, `admin.css`).
6. **Milestone 7**: Dedicated Customer Refund Portal (`refund.html`, `refund.js`) with 75% rule automation.
7. **Milestone 8**: Automated Vitest test suite testing pricing, validation, signatures, idempotency, and refund math.
8. **Milestone 9**: Vercel deployment configuration, documentation, and production launch checklist.

