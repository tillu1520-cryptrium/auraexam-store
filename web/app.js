// ============================================================================
// AURAEXAM — CLIENT STOREFRONT & CHECKOUT CONTROLLER
// Handles dynamic catalogue fetching, client validation, Razorpay checkout,
// and verified delivery receipt modals.
// ============================================================================

(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const isSupabaseConfigured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("your-project-id");
  const client = isSupabaseConfigured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  // Selected subjects state
  const selectedSubjects = new Set();

  // Default product catalogue metadata (Prices in Rupees)
  const catalogue = {
    physics: { name: 'Physics', price: 150, description: '10 Complete Sets Bundle (Mechanics, Optics, Modern Physics)' },
    bee: { name: 'Basic Electrical Engineering', price: 150, description: '10 Complete Sets Bundle (AC/DC Circuits, Machines, Transformers)' },
    mathematics: { name: 'Mathematics', price: 100, description: '10 Complete Sets Bundle (Calculus, Linear Algebra, Complex Analysis)' }
  };

  // DOM Elements
  const cartBadge = document.getElementById('cartCountBadge');
  const summaryList = document.getElementById('summaryItemsList');
  const grandTotalEl = document.getElementById('grandTotalDisplay');
  const selectedCountText = document.getElementById('selectedCountText');
  const statusToast = document.getElementById('statusToast');
  const orderForm = document.getElementById('orderForm');
  const payBtn = document.getElementById('payButton');
  const receiptModal = document.getElementById('receiptModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');

  // Format currency helper
  function formatINR(amountRupees) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amountRupees);
  }

  // Show status toast notification
  function showToast(message, isError = false) {
    if (!statusToast) return;
    statusToast.textContent = message;
    statusToast.className = 'status-toast ' + (isError ? 'error' : 'success');
  }

  function hideToast() {
    if (!statusToast) return;
    statusToast.className = 'status-toast';
    statusToast.textContent = '';
  }

  // Render Order Summary
  function updateSummary() {
    if (cartBadge) cartBadge.textContent = selectedSubjects.size;
    if (selectedCountText) selectedCountText.textContent = `${selectedSubjects.size} subject${selectedSubjects.size === 1 ? '' : 's'}`;

    if (!summaryList) return;

    if (selectedSubjects.size === 0) {
      summaryList.innerHTML = `
        <p style="color: var(--text-muted); font-size: 0.9rem; text-align: center; margin-top: 30px;">
          No subjects selected. Click "Add to Cart" on any subject above.
        </p>
      `;
      if (grandTotalEl) grandTotalEl.textContent = formatINR(0);
      return;
    }

    let totalRupees = 0;
    let html = '';

    selectedSubjects.forEach(slug => {
      const prod = catalogue[slug];
      if (prod) {
        totalRupees += prod.price;
        html += `
          <div class="summary-item-row">
            <div class="item-info">
              <button type="button" class="btn-remove-item" data-remove="${slug}" title="Remove ${prod.name}">✕</button>
              <div>
                <strong style="font-size: 0.92rem; display: block;">${prod.name}</strong>
                <small style="color: var(--text-muted); font-size: 0.75rem;">10 sets in 1 PDF bundle</small>
              </div>
            </div>
            <strong>${formatINR(prod.price)}</strong>
          </div>
        `;
      }
    });

    summaryList.innerHTML = html;
    if (grandTotalEl) grandTotalEl.textContent = formatINR(totalRupees);

    // Bind remove buttons inside summary
    summaryList.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const slugToRemove = btn.dataset.remove;
        toggleProductSelection(slugToRemove);
      });
    });
  }

  // Toggle selection
  function toggleProductSelection(slug) {
    const cardBtn = document.querySelector(`.btn-select[data-slug="${slug}"]`);
    if (selectedSubjects.has(slug)) {
      selectedSubjects.delete(slug);
      if (cardBtn) {
        cardBtn.classList.remove('selected');
        cardBtn.innerHTML = 'Add to Cart <span>＋</span>';
      }
    } else {
      selectedSubjects.add(slug);
      if (cardBtn) {
        cardBtn.classList.add('selected');
        cardBtn.innerHTML = 'Added <span>✓</span>';
      }
    }
    updateSummary();
  }

  // Bind catalogue add buttons
  function bindCatalogueButtons() {
    document.querySelectorAll('.btn-select').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleProductSelection(btn.dataset.slug);
      });
    });
  }

  // Load dynamic catalogue from Supabase view
  async function fetchLiveCatalogue() {
    if (!client) {
      bindCatalogueButtons();
      return;
    }

    try {
      const { data, error } = await client
        .from('public_products')
        .select('slug, name, description, price_paise')
        .order('display_order');

      if (error || !data || data.length === 0) {
        bindCatalogueButtons();
        return;
      }

      data.forEach(p => {
        catalogue[p.slug] = {
          name: p.name,
          price: Number(p.price_paise) / 100,
          description: p.description
        };
      });

      bindCatalogueButtons();
    } catch (err) {
      console.warn('Could not fetch remote catalogue; using static catalogue defaults.', err);
      bindCatalogueButtons();
    }
  }

  // Handle Order Form Submission & Checkout
  if (orderForm) {
    orderForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideToast();

      if (selectedSubjects.size === 0) {
        showToast('Please select at least one subject bundle before checkout.', true);
        const productsSection = document.getElementById('products');
        if (productsSection) productsSection.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      const formData = new FormData(orderForm);
      const fullName = String(formData.get('fullName') || '').trim();
      const rollNumber = String(formData.get('rollNumber') || '').trim();
      const email = String(formData.get('email') || '').trim().toLowerCase();
      const mobile = String(formData.get('mobile') || '').replace(/\s+/g, '');
      const refundUpiId = String(formData.get('refundUpiId') || '').trim();
      const termsAccepted = formData.get('terms') === 'on';

      // Comprehensive client validation
      if (fullName.length < 2 || fullName.length > 120) {
        showToast('Please enter your valid full name (2–120 characters).', true);
        return;
      }
      if (!rollNumber || rollNumber.length > 60) {
        showToast('Please enter your academic roll / registration number.', true);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Please enter a valid email address for PDF delivery.', true);
        return;
      }
      if (!/^[6-9]\d{9}$/.test(mobile)) {
        showToast('Please enter a valid 10-digit Indian mobile number.', true);
        return;
      }
      if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(refundUpiId)) {
        showToast('Please enter a valid UPI ID (e.g. name@bank) for potential 75% refunds.', true);
        return;
      }
      if (!termsAccepted) {
        showToast('You must accept the refund policy terms to proceed.', true);
        return;
      }

      if (!client) {
        showToast('Backend environment configuration pending. Please configure Supabase URL and publishable key in config.js.', true);
        return;
      }

      payBtn.disabled = true;
      payBtn.innerHTML = 'Connecting to Payment Gateway… <span class="spinner"></span>';

      try {
        const orderPayload = {
          fullName,
          rollNumber,
          email,
          mobile,
          refundUpiId,
          products: Array.from(selectedSubjects)
        };

        // 1. Invoke Supabase Edge Function to securely calculate amount and create Razorpay order
        const { data: orderData, error: orderError } = await client.functions.invoke('create-order', {
          body: orderPayload
        });

        if (orderError || !orderData?.razorpayOrderId) {
          throw new Error(orderData?.error || orderError?.message || 'Failed to initiate secure order.');
        }

        // 2. Launch Razorpay Standard Checkout modal
        const rzpOptions = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: cfg.BRAND_NAME || 'AuraExam',
          description: `Exam Prep Bundle (${selectedSubjects.size} Subject${selectedSubjects.size === 1 ? '' : 's'})`,
          order_id: orderData.razorpayOrderId,
          prefill: {
            name: fullName,
            email: email,
            contact: mobile
          },
          notes: {
            internal_order_number: orderData.orderNumber
          },
          theme: {
            color: '#2B7FFF'
          },
          handler: async function (response) {
            showToast('Payment received! Verifying transaction with gateway…');

            try {
              // 3. Server-side payment verification
              const { data: verifyData, error: verifyError } = await client.functions.invoke('verify-payment', {
                body: {
                  orderId: orderData.orderId,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature
                }
              });

              if (verifyError || !verifyData?.verified) {
                throw new Error(verifyData?.error || verifyError?.message || 'Payment verification failed. Please contact support with order ref: ' + orderData.orderNumber);
              }

              // Show Success Modal
              if (receiptModal) {
                document.getElementById('modalOrderNum').textContent = orderData.orderNumber;
                document.getElementById('modalEmail').textContent = email;
                document.getElementById('modalBundles').textContent = Array.from(selectedSubjects).map(s => catalogue[s]?.name || s).join(', ');
                
                const linksContainer = document.getElementById('modalLinksContainer');
                if (linksContainer) {
                  if (Array.isArray(verifyData?.downloads) && verifyData.downloads.length > 0) {
                    linksContainer.innerHTML = '<div style="font-size:0.85rem; font-weight:700; color:var(--accent-cyan); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Instant Access Links:</div>' +
                      verifyData.downloads.map(d => `
                        <a href="${d.url}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="width:100%; justify-content:space-between; padding:12px 18px; font-size:0.92rem;">
                          <span>📥 Download ${escapeHtml(d.name)}</span>
                          <span>↗</span>
                        </a>
                      `).join('');
                  } else {
                    linksContainer.innerHTML = '<div style="font-size:0.85rem; color:var(--text-muted); background:rgba(255,255,255,0.04); padding:10px 14px; border-radius:10px;">Private Google Drive access has been shared to <strong>' + escapeHtml(email) + '</strong>. Check your inbox!</div>';
                  }
                }

                receiptModal.classList.add('active');
              }

              // Reset form & selections
              orderForm.reset();
              selectedSubjects.clear();
              document.querySelectorAll('.btn-select').forEach(b => {
                b.classList.remove('selected');
                b.innerHTML = 'Add to Cart <span>＋</span>';
              });
              updateSummary();
            } catch (vErr) {
              showToast(vErr.message || 'Verification could not be completed automatically. Please check your email.', true);
            }
          },
          modal: {
            ondismiss: function () {
              showToast(`Payment checkout closed. If money was debited, your order reference is ${orderData.orderNumber}.`, false);
            }
          }
        };

        const rzp = new window.Razorpay(rzpOptions);
        rzp.on('payment.failed', function (resp) {
          showToast(`Payment failed: ${resp.error?.description || 'Transaction declined by bank'}.`, true);
        });
        rzp.open();

      } catch (err) {
        showToast(err.message || 'An unexpected error occurred. Please try again.', true);
      } finally {
        payBtn.disabled = false;
        payBtn.innerHTML = 'Pay with Razorpay <span>→</span>';
      }
    });
  }

  // Modal dismiss
  if (modalCloseBtn && receiptModal) {
    modalCloseBtn.addEventListener('click', () => {
      receiptModal.classList.remove('active');
    });
  }

  // Update current year in footer
  const yearEl = document.getElementById('currentYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Initial Boot
  fetchLiveCatalogue();
  updateSummary();

})();
