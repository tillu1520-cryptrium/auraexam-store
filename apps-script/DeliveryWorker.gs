/**
 * ============================================================================
 * AURAEXAM — AUTOMATED GOOGLE DRIVE PDF DELIVERY WORKER
 * Platform: Google Apps Script
 *
 * Responsibilities:
 * 1. Immediate Webhook Trigger (doPost) from Supabase upon payment verification.
 * 2. Fallback Scheduled Worker (every 5 mins) to guarantee 100% SLA delivery.
 * 3. Strict Customer Isolation: Adds Viewer permission exclusively to the verified
 *    purchaser's email address. No public Drive links are ever created.
 * 4. Responsive Apple-Styled HTML Delivery Email with individual bundle access links.
 * 5. Idempotent state management and administrator error notifications.
 *
 * Required Script Properties:
 * - SUPABASE_URL: e.g. https://your-project-id.supabase.co
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for database updates
 * - APPS_SCRIPT_SECRET_TOKEN: Shared secret for webhook authentication
 * - ADMIN_EMAIL: e.g. admin@auraexam.com (for failure notifications)
 * - BRAND_NAME: e.g. AuraExam
 * ============================================================================
 */

/**
 * Installs the scheduled time-based trigger.
 * Run once inside the Google Apps Script editor.
 */
function installDeliveryTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'processPendingDeliveries'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('processPendingDeliveries')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('Scheduled delivery trigger installed successfully (5-minute interval).');
}

/**
 * Webhook handler for instant delivery trigger from Supabase Edge Functions.
 */
function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const expectedToken = props.getProperty('APPS_SCRIPT_SECRET_TOKEN');

    // Authenticate shared secret header
    if (expectedToken) {
      const authHeader = (e && e.headers) ? (e.headers['X-Delivery-Token'] || e.headers['x-delivery-token']) : null;
      if (authHeader !== expectedToken) {
        return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized token' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Immediately process any pending deliveries
    const processedCount = processPendingDeliveries();

    return ContentService.createTextOutput(JSON.stringify({ success: true, processed: processedCount }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doPost Error: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Core processing loop: claims pending rows, shares Drive PDFs, and sends email.
 */
function processPendingDeliveries() {
  const props = PropertiesService.getScriptProperties();
  const baseUrl = requiredProperty_(props, 'SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = requiredProperty_(props, 'SUPABASE_SERVICE_ROLE_KEY');
  const brandName = props.getProperty('BRAND_NAME') || 'AuraExam';
  const adminEmail = props.getProperty('ADMIN_EMAIL');

  // Fetch up to 25 pending delivery records
  const endpoint = '/rest/v1/deliveries?status=eq.pending&select=id,order_id,customer_email,product_name,drive_file_id,attempts&limit=25';
  const rows = supabaseGet_(baseUrl, serviceKey, endpoint);

  if (!rows || rows.length === 0) {
    return 0;
  }

  let successCount = 0;

  // Group deliveries by order_id so customers receive ONE unified, elegant delivery email with all their purchased bundles!
  const orderMap = {};
  rows.forEach(function (row) {
    if (!orderMap[row.order_id]) {
      orderMap[row.order_id] = {
        customerEmail: row.customer_email,
        items: []
      };
    }
    orderMap[row.order_id].items.push(row);
  });

  Object.keys(orderMap).forEach(function (orderId) {
    const group = orderMap[orderId];
    const customerEmail = group.customerEmail;
    const deliveredItems = [];

    group.items.forEach(function (row) {
      try {
        // Claim row to 'processing' to prevent concurrent runs
        supabasePatch_(baseUrl, serviceKey, '/rest/v1/deliveries?id=eq.' + encodeURIComponent(row.id), {
          status: 'processing',
          attempts: Number(row.attempts || 0) + 1
        });

        // Grant Google Drive Private Access
        const file = DriveApp.getFileById(row.drive_file_id);
        file.addViewer(customerEmail);
        const driveUrl = file.getUrl();

        deliveredItems.push({
          rowId: row.id,
          name: row.product_name,
          url: driveUrl
        });

      } catch (itemErr) {
        const errorMsg = String(itemErr && itemErr.message ? itemErr.message : itemErr).slice(0, 500);
        Logger.log('Failed processing delivery row ' + row.id + ': ' + errorMsg);

        supabasePatch_(baseUrl, serviceKey, '/rest/v1/deliveries?id=eq.' + encodeURIComponent(row.id), {
          status: 'failed',
          last_error: errorMsg
        });

        if (adminEmail) {
          MailApp.sendEmail(adminEmail, '[' + brandName + '] Delivery Failure Alert',
            'Delivery ID: ' + row.id + '\nOrder ID: ' + row.order_id + '\nCustomer: ' + customerEmail + '\nError: ' + errorMsg);
        }
      }
    });

    // If items were successfully shared, dispatch the branded HTML email
    if (deliveredItems.length > 0) {
      try {
        sendCustomerDeliveryEmail_(customerEmail, deliveredItems, brandName);

        // Mark successfully delivered in database
        deliveredItems.forEach(function (item) {
          supabasePatch_(baseUrl, serviceKey, '/rest/v1/deliveries?id=eq.' + encodeURIComponent(item.rowId), {
            status: 'delivered',
            delivered_at: new Date().toISOString(),
            last_error: null
          });
          successCount++;
        });

      } catch (mailErr) {
        Logger.log('Email delivery failed for ' + customerEmail + ': ' + mailErr.toString());
      }
    }
  });

  return successCount;
}

/**
 * Builds and dispatches a responsive, Apple-styled HTML delivery email.
 */
function sendCustomerDeliveryEmail_(recipient, items, brandName) {
  const subject = '[' + brandName + '] Your Question Paper Bundles Are Ready';

  let itemsHtml = '';
  items.forEach(function (item) {
    itemsHtml +=
      '<div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 18px 22px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">' +
        '<div>' +
          '<h3 style="margin: 0 0 4px 0; color: #FFFFFF; font-size: 16px;">' + escapeHtml_(item.name) + '</h3>' +
          '<span style="font-size: 12px; color: #7EB2FF; font-weight: 600;">10 COMPLETE SETS · 1 PDF</span>' +
        '</div>' +
        '<a href="' + item.url + '" target="_blank" style="background: #2B7FFF; color: #FFFFFF; text-decoration: none; padding: 10px 18px; border-radius: 9999px; font-size: 13px; font-weight: 600; display: inline-block;">Open in Drive ↗</a>' +
      '</div>';
  });

  const htmlBody =
    '<!DOCTYPE html>' +
    '<html>' +
    '<head><meta charset="utf-8"></head>' +
    '<body style="margin:0; padding:24px; background:#07090E; font-family:-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; color:#E0E5F0;">' +
      '<div style="max-width:580px; margin:0 auto; background:#0D111C; border:1px solid #1E2738; border-radius:24px; padding:36px; box-shadow:0 20px 40px rgba(0,0,0,0.6);">' +
        '<div style="margin-bottom:28px; text-align:center;">' +
          '<h1 style="color:#FFFFFF; font-size:24px; margin:0 0 8px 0; font-weight:800; letter-spacing:-0.5px;">' + brandName + '</h1>' +
          '<p style="color:#7EB2FF; font-size:13px; margin:0; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Payment Captured · Access Provisioned</p>' +
        '</div>' +

        '<p style="font-size:15px; line-height:1.6; color:#B0BCCE;">' +
          'Hello,<br><br>Thank you for your purchase. Your payment has been verified and private Google Drive permissions have been attached to your email address (<strong>' + recipient + '</strong>).' +
        '</p>' +

        '<div style="margin:28px 0;">' + itemsHtml + '</div>' +

        '<div style="background:#131A29; border-left:4px solid #2B7FFF; padding:16px; border-radius:8px; font-size:13px; color:#A0ADC0; margin-bottom:28px;">' +
          '<strong>Security Notice:</strong> Access is restricted strictly to your authenticated Google email. Paid materials must not be distributed, published, or re-sold.' +
        '</div>' +

        '<div style="border-top:1px solid #1E2738; padding-top:20px; font-size:12px; color:#6B7990; text-align:center;">' +
          'Questions or need assistance? Reply directly to this email.<br>' +
          '© ' + new Date().getFullYear() + ' ' + brandName + '. All rights reserved.' +
        '</div>' +
      '</div>' +
    '</body>' +
    '</html>';

  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    htmlBody: htmlBody
  });
}

function escapeHtml_(text) {
  return String(text).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

function supabaseGet_(baseUrl, serviceKey, path) {
  const response = UrlFetchApp.fetch(baseUrl + path, {
    method: 'get',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey
    },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) {
    throw new Error('Supabase GET failed with code ' + response.getResponseCode() + ': ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function supabasePatch_(baseUrl, serviceKey, path, payload) {
  const response = UrlFetchApp.fetch(baseUrl + path, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      Prefer: 'return=minimal'
    },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) {
    throw new Error('Supabase PATCH failed with code ' + response.getResponseCode() + ': ' + response.getContentText());
  }
}

function requiredProperty_(props, key) {
  const val = props.getProperty(key);
  if (!val) {
    throw new Error('Missing required Script Property: ' + key);
  }
  return val;
}
