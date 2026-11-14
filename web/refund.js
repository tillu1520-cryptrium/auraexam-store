// ============================================================================
// AURAEXAM — CUSTOMER REFUND CLAIM CONTROLLER (web/refund.js)
// Handles submission of 75% concept-matching refund requests.
// ============================================================================

(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const isSupabaseConfigured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("your-project-id");
  const client = isSupabaseConfigured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  const form = document.getElementById('refundClaimForm');
  const toast = document.getElementById('claimToast');
  const submitBtn = document.getElementById('submitClaimBtn');

  function showToast(msg, isError = false) {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'status-toast ' + (isError ? 'error' : 'success');
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const orderNumber = document.getElementById('claimOrderNumber').value.trim();
      const email = document.getElementById('claimEmail').value.trim().toLowerCase();
      const subjectSlug = document.getElementById('claimSubject').value;
      const examDate = document.getElementById('claimExamDate').value;
      const refundUpiId = document.getElementById('claimUpi').value.trim();
      const evidenceUrl = document.getElementById('claimEvidenceUrl').value.trim();
      const reason = document.getElementById('claimReason').value.trim();

      if (!orderNumber || !email || !subjectSlug || !examDate || !refundUpiId || !evidenceUrl) {
        showToast('Please fill in all required fields.', true);
        return;
      }

      if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(refundUpiId)) {
        showToast('Please provide a valid destination UPI ID (name@bank).', true);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Submitting Claim for Review…';

      try {
        if (!client) {
          // Local offline simulation
          setTimeout(() => {
            showToast('Claim recorded successfully (Local Simulation Mode). Our team will review your evidence within 48 hours.', false);
            form.reset();
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Submit Claim for Verification <span>→</span>';
          }, 800);
          return;
        }

        // Invoke submit-refund edge function
        const { data, error } = await client.functions.invoke('submit-refund', {
          body: {
            orderNumber,
            email,
            subjectSlug,
            examDate,
            refundUpiId,
            evidenceUrl,
            reason
          }
        });

        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Failed to submit refund claim.');
        }

        showToast(`Claim successfully registered! Reference: ${data.claimId}. Eligible 75% refund: ₹${data.refundAmountRupees}. Administrator review will be conducted within 48 hours.`, false);
        form.reset();

      } catch (err) {
        showToast(err.message || 'Error submitting claim. Please check your order number and email.', true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Claim for Verification <span>→</span>';
      }
    });
  }

})();

