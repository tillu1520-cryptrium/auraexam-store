// ============================================================================
// AURAEXAM — ADMIN DASHBOARD CONTROLLER (web/admin.js)
// Handles Supabase Admin Authentication, KPI Overview, Order Management,
// Product Catalog CRUD, and 75% Refund Claim Review Workflows.
// ============================================================================

(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const isSupabaseConfigured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("your-project-id");
  const client = isSupabaseConfigured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  // DOM Elements
  const loginGate = document.getElementById('loginGate');
  const adminDashboard = document.getElementById('adminDashboard');
  const loginForm = document.getElementById('adminLoginForm');
  const loginToast = document.getElementById('loginStatusToast');
  const logoutBtn = document.getElementById('adminLogoutBtn');
  const userBadge = document.getElementById('adminUserBadge');
  const refreshStatsBtn = document.getElementById('refreshStatsBtn');

  // Modal Elements
  const productModal = document.getElementById('productModal');
  const productForm = document.getElementById('productForm');
  const openAddProductBtn = document.getElementById('openAddProductModalBtn');

  // Currency Formatter
  function money(paise) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format((paise || 0) / 100);
  }

  function showToast(msg, isError = false) {
    if (!loginToast) return;
    loginToast.textContent = msg;
    loginToast.className = 'status-toast ' + (isError ? 'error' : 'success');
  }

  // Check Authentication Status
  async function checkAuthSession() {
    if (!client) {
      // In local offline mode without remote Supabase, display demo dashboard
      console.warn("Supabase client not connected. Running in demo admin mode.");
      loginGate.style.display = 'none';
      adminDashboard.style.display = 'grid';
      loadMockDashboardData();
      return;
    }

    const { data: { session } } = await client.auth.getSession();
    if (session) {
      loginGate.style.display = 'none';
      adminDashboard.style.display = 'grid';
      if (userBadge) userBadge.textContent = `Logged in: ${session.user.email}`;
      loadLiveDashboardData();
    } else {
      loginGate.style.display = 'block';
      adminDashboard.style.display = 'none';
    }
  }

  // Admin Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('adminEmail').value.trim();
      const password = document.getElementById('adminPassword').value;

      if (!client) {
        showToast("Backend not configured. Entering demo inspection mode.", false);
        setTimeout(() => {
          loginGate.style.display = 'none';
          adminDashboard.style.display = 'grid';
          loadMockDashboardData();
        }, 600);
        return;
      }

      showToast("Verifying credentials…");
      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showToast("Access granted!", false);
        setTimeout(checkAuthSession, 400);
      } catch (err) {
        showToast(err.message || "Invalid administrator credentials.", true);
      }
    });
  }

  // Admin Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (client) await client.auth.signOut();
      loginGate.style.display = 'block';
      adminDashboard.style.display = 'none';
    });
  }

  // Tab Navigation
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');

      item.classList.add('active');
      const tabId = 'tab-' + item.dataset.tab;
      const targetPane = document.getElementById(tabId);
      if (targetPane) targetPane.style.display = 'block';
    });
  });

  // Mock Data Loader for Offline Preview / Local Verification
  function loadMockDashboardData() {
    document.getElementById('statRevenue').textContent = '₹58,400';
    document.getElementById('statOrders').textContent = '146';
    document.getElementById('statPaid').textContent = '142';
    document.getElementById('statDeliveries').textContent = '142';
    document.getElementById('statRefunds').textContent = '2';

    // Mock Recent Orders Table
    const recentOrdersBody = document.getElementById('recentOrdersBody');
    if (recentOrdersBody) {
      recentOrdersBody.innerHTML = `
        <tr>
          <td><strong>EP-173155-9B2F</strong></td>
          <td>priyanshu@example.com</td>
          <td>${money(40000)}</td>
          <td><span class="chip chip-success">Paid</span></td>
          <td><span class="chip chip-success">Delivered</span></td>
          <td>Today, 07:30 AM</td>
        </tr>
        <tr>
          <td><strong>EP-173154-A41C</strong></td>
          <td>student2@kiit.ac.in</td>
          <td>${money(15000)}</td>
          <td><span class="chip chip-success">Paid</span></td>
          <td><span class="chip chip-success">Delivered</span></td>
          <td>Yesterday, 09:15 PM</td>
        </tr>
        <tr>
          <td><strong>EP-173153-7E81</strong></td>
          <td>rahul.k@gmail.com</td>
          <td>${money(25000)}</td>
          <td><span class="chip chip-pending">Pending</span></td>
          <td><span class="chip chip-pending">Pending</span></td>
          <td>Yesterday, 06:40 PM</td>
        </tr>
      `;
    }

    // Mock Products
    renderAdminProducts([
      { id: '1', slug: 'physics', name: 'Physics', price_paise: 15000, drive_file_id: '1aBcDeFg_Physics_PDF', active: true },
      { id: '2', slug: 'bee', name: 'Basic Electrical Engineering', price_paise: 15000, drive_file_id: '2hIjKlMn_BEE_PDF', active: true },
      { id: '3', slug: 'mathematics', name: 'Mathematics', price_paise: 10000, drive_file_id: '3oPqRsTu_Math_PDF', active: true }
    ]);

    // Mock Refunds
    const refundsBody = document.getElementById('refundsTableBody');
    if (refundsBody) {
      refundsBody.innerHTML = `
        <tr>
          <td><strong>REF-001</strong></td>
          <td>Mathematics (10 Sets)</td>
          <td>2026-11-10</td>
          <td><strong>${money(7500)}</strong> (75%)</td>
          <td>student@okhdfcbank</td>
          <td><span class="chip chip-pending">Under Review</span></td>
          <td>
            <button class="btn btn-primary" style="padding: 6px 12px; font-size: 0.78rem;" onclick="alert('Evidence paper matches concept for Q3 & Q7. No refund eligible under concept-match clause.')">Review Evidence</button>
          </td>
        </tr>
      `;
    }
  }

  function renderAdminProducts(products) {
    const tbody = document.getElementById('adminProductsTableBody');
    if (!tbody) return;
    tbody.innerHTML = products.map(p => `
      <tr>
        <td><code>${p.slug}</code></td>
        <td><strong>${p.name}</strong></td>
        <td>${money(p.price_paise)}</td>
        <td><code>${p.drive_file_id || 'Not Assigned'}</code></td>
        <td><span class="chip ${p.active ? 'chip-success' : 'chip-failed'}">${p.active ? 'Active' : 'Disabled'}</span></td>
        <td>
          <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.78rem;" onclick="editProduct('${p.id}', '${p.slug}', '${p.name}', ${p.price_paise / 100}, '${p.drive_file_id || ''}')">Edit</button>
        </td>
      </tr>
    `).join('');
  }

  window.editProduct = function (id, slug, name, price, driveId) {
    document.getElementById('prodEditId').value = id;
    document.getElementById('prodSlug').value = slug;
    document.getElementById('prodName').value = name;
    document.getElementById('prodDesc').value = `10 Complete Sets bundle for ${name}`;
    document.getElementById('prodPrice').value = price;
    document.getElementById('prodDriveId').value = driveId;
    document.getElementById('productModalTitle').textContent = `Edit Subject: ${name}`;
    if (productModal) productModal.classList.add('active');
  };

  if (openAddProductBtn && productModal) {
    openAddProductBtn.addEventListener('click', () => {
      document.getElementById('productForm').reset();
      document.getElementById('prodEditId').value = '';
      document.getElementById('productModalTitle').textContent = 'Add New Subject';
      productModal.classList.add('active');
    });
  }

  // Product Save Form
  if (productForm) {
    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('prodEditId').value;
      const slug = document.getElementById('prodSlug').value.trim().toLowerCase();
      const name = document.getElementById('prodName').value.trim();
      const desc = document.getElementById('prodDesc').value.trim();
      const price = Math.round(Number(document.getElementById('prodPrice').value) * 100);
      const driveId = document.getElementById('prodDriveId').value.trim();

      if (client) {
        if (id) {
          await client.from('products').update({ slug, name, description: desc, price_paise: price, drive_file_id: driveId }).eq('id', id);
        } else {
          await client.from('products').insert({ slug, name, description: desc, price_paise: price, drive_file_id: driveId, active: true });
        }
        loadLiveDashboardData();
      } else {
        alert("Subject configuration saved successfully (Local Mock).");
      }
      productModal.classList.remove('active');
    });
  }

  async function loadLiveDashboardData() {
    if (!client) return;
    try {
      // 1. Orders and Revenue
      const { data: orders } = await client.from('orders').select('*').order('created_at', { ascending: false });
      if (orders) {
        const totalRev = orders.filter(o => o.status === 'paid').reduce((acc, o) => acc + (o.total_paise || 0), 0);
        document.getElementById('statRevenue').textContent = money(totalRev);
        document.getElementById('statOrders').textContent = orders.length;
        document.getElementById('statPaid').textContent = orders.filter(o => o.status === 'paid').length;
      }

      // 2. Deliveries
      const { count: delCount } = await client.from('deliveries').select('*', { count: 'exact', head: true }).eq('status', 'delivered');
      if (delCount !== null) document.getElementById('statDeliveries').textContent = delCount;

      // 3. Products
      const { data: prods } = await client.from('products').select('*').order('display_order');
      if (prods) renderAdminProducts(prods);

      // 4. Refunds
      const { data: refunds } = await client.from('refunds').select('*').order('created_at', { ascending: false });
      if (refunds) {
        document.getElementById('statRefunds').textContent = refunds.filter(r => r.status === 'requested' || r.status === 'under_review').length;
      }
    } catch (err) {
      console.error("Dashboard live fetch error:", err);
    }
  }

  if (refreshStatsBtn) {
    refreshStatsBtn.addEventListener('click', () => {
      if (client) loadLiveDashboardData();
      else loadMockDashboardData();
    });
  }

  // Initial Check
  checkAuthSession();

})();

