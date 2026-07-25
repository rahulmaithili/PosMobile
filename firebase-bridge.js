/**
 * Firebase Bridge for Mobile Shop POS
 * Intercepts google.script.run calls and translates them to Firebase Firestore & Storage.
 * Enables the frontend to run on Netlify and backend to run on Firebase.
 */

(function() {
  // ==========================================
  // 1. Static Configuration & Constants
  // ==========================================
  const SETTINGS_DEFAULTS = {
    shop_name:'Rameez Phone Hub', shop_tagline:'Sales · Repairs · Accessories',
    shop_address:'123 Market Street, Downtown', shop_city:'', shop_country:'',
    shop_phone:'+1 555 0100', shop_email:'hello@phoneshop.demo', shop_website:'', tax_id:'', shop_logo: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiGXxCe0WNNedmFqSWeF761f7Kshhc-NP5ChRQKz9fr97cO8VaarvD0KlCwqHojJVBWv-RAxfOqMI5rD4H78KnARyOc6QgwL1nRRFWf5xNQ1d9F9HfAoLPPGlTyP0GwNl4n-INMEsWLQ4Y7zJtz5bOdAnc2ePH9-uCRgshlo6BsS6gJEz6fhrxL-5U5O3sX/s160/channels4_profile.jpg',
    currency:'₹', currency_code:'INR', currency_position:'before', currency_decimals:'2',
    vat_default:'21', enable_vat:'1', low_stock_default:'5',
    invoice_prefix:'INV-', repair_prefix:'RPR-', used_prefix:'UP-',
    date_format:'YYYY-MM-DD', timezone:'GMT+5:30', receipt_size:'80mm',
    receipt_footer:'Thank you for shopping with us!', show_logo_on_receipt:'1',
    invoice_terms:'Goods sold are not returnable after 7 days. Warranty as per manufacturer.',
    contract_terms:'The seller confirms lawful ownership of the device and that it is not stolen or blocked. Sold as-is. ID verified at purchase.',
    loyalty_enabled:'1', loyalty_earn_per:'10', loyalty_point_value:'0.10',
    return_prefix:'RET-', return_reasons:'Defective/Faulty,Wrong item,Customer changed mind,Not as described,Warranty claim,Other',
    void_window_hours:'24', expense_categories:'rent,salaries,utilities,marketing,parts,misc',
    wa_template:'Hi {name}, your device "{device}" is repaired and ready for pickup. Balance due: {currency}{remaining}. Thank you - {shop}',
    installment_reminder_email:'0'
  };

  const RBAC_PAGES = [
    { key:'dashboard',   label:'Dashboard',       group:'General' },
    { key:'pos',         label:'POS / Sales',     group:'Operations' },
    { key:'repairs',     label:'Repairs',         group:'Operations' },
    { key:'used_phones', label:'Buy Used Phone',  group:'Operations' },
    { key:'imei_lookup', label:'IMEI Lookup',     group:'Operations' },
    { key:'customers',   label:'Customers',       group:'Operations' },
    { key:'products',    label:'Products',        group:'Inventory' },
    { key:'inventory',   label:'Inventory',       group:'Inventory' },
    { key:'suppliers',   label:'Suppliers',       group:'Inventory' },
    { key:'expenses',    label:'Expenses',        group:'Finance' },
    { key:'cash_drawer', label:'Cash Drawer',     group:'Finance' },
    { key:'installments',label:'Installments / EMI', group:'Finance' },
    { key:'reports',     label:'Reports',         group:'Finance' },
    { key:'users',       label:'Users / Staff',   group:'System' },
    { key:'settings',    label:'Settings',        group:'System' },
    { key:'logs',        label:'Activity Logs',   group:'System' }
  ];

  const RBAC_ROLE_DEFS = [
    { key:'owner',    label:'Owner',    color:'#6a1b9a', is_super:1, hidden_signup:1 },
    { key:'manager',  label:'Manager',  color:'#0074D9', is_super:0, hidden_signup:1 },
    { key:'employee', label:'Employee', color:'#2e7d32', is_super:0, hidden_signup:0 }
  ];

  function rbacDefaultPerms(roleKey) {
    const perms = {};
    const set = (k,v,a,e,d) => { perms[k] = { v:v?1:0, a:a?1:0, e:e?1:0, d:d?1:0 }; };
    RBAC_PAGES.forEach(p => set(p.key,0,0,0,0));
    if (roleKey === 'owner') { RBAC_PAGES.forEach(p => set(p.key,1,1,1,1)); return perms; }
    if (roleKey === 'manager') {
      set('dashboard',1,0,0,0); set('pos',1,1,1,0); set('repairs',1,1,1,0); set('used_phones',1,1,1,0);
      set('imei_lookup',1,0,0,0); set('customers',1,1,1,0); set('products',1,1,1,1); set('inventory',1,1,0,0);
      set('suppliers',1,1,1,0); set('expenses',1,1,1,0); set('cash_drawer',1,1,1,0); set('installments',1,1,1,0);
      set('users',1,1,1,0); set('reports',1,0,0,0); set('settings',1,0,0,0);
      return perms;
    }
    set('dashboard',1,0,0,0); set('pos',1,1,0,0); set('repairs',1,1,1,0); set('used_phones',1,1,0,0);
    set('imei_lookup',1,0,0,0); set('customers',1,1,1,0); set('products',1,0,0,0); set('cash_drawer',1,1,1,0);
    set('installments',1,1,0,0);
    return perms;
  }

  // ==========================================
  // 2. Firebase Initialization & Wizard UI
  // ==========================================
  let db, storage;
  let isInitialized = false;

  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCfy0CuI_zusyzMxGsWuErE1H1G30Iw5Ec",
    authDomain: "mobilepos-31955.firebaseapp.com",
    databaseURL: "https://mobilepos-31955-default-rtdb.firebaseio.com",
    projectId: "mobilepos-31955",
    storageBucket: "mobilepos-31955.firebasestorage.app",
    messagingSenderId: "617327800531",
    appId: "1:617327800531:web:6f061b3aeb57ac19a1a426"
  };

  function loadFirebaseConfig() {
    try {
      const configStr = localStorage.getItem('firebaseConfig');
      if (configStr) {
        return JSON.parse(configStr);
      }
    } catch(e) {
      console.error("Failed to parse firebaseConfig from localStorage:", e);
    }
    return DEFAULT_FIREBASE_CONFIG;
  }

  function initializeFirebase(config) {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(config);
    }
    db = firebase.firestore();
    try {
      storage = firebase.storage();
    } catch (e) {
      console.warn("Firebase Storage failed to initialize:", e);
      storage = null;
    }
    isInitialized = true;
  }

  // Check and show setup wizard if not configured or not seeded
  window.addEventListener('DOMContentLoaded', async () => {
    const config = loadFirebaseConfig();
    if (config && config.apiKey && !config.apiKey.startsWith("AIzaSy...")) {
      try {
        initializeFirebase(config);
        // Check if database is seeded by querying system counters document
        const doc = await db.collection('system').doc('counters').get();
        if (!doc.exists) {
          showSetupWizard(true); // ready to seed mode
        }
      } catch (e) {
        console.error("Firebase init failed, showing full setup wizard:", e);
        showSetupWizard(false); // full setup mode
      }
    } else {
      showSetupWizard(false);
    }
  });

  function showSetupWizard(readyToSeed = false) {
    const overlay = document.createElement('div');
    overlay.id = 'firebase-setup-overlay';
    overlay.innerHTML = `
      <style>
        #firebase-setup-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 21, 41, 0.96); z-index: 999999;
          display: flex; justify-content: center; align-items: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #fff; padding: 20px;
        }
        .setup-card {
          background: #001529; border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px; width: 100%; max-width: 550px;
          padding: 30px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }
        .setup-title {
          font-size: 24px; font-weight: bold; margin-bottom: 10px;
          color: #0074D9; text-align: center;
        }
        .setup-subtitle {
          font-size: 14px; color: #a0aec0; margin-bottom: 25px;
          text-align: center; line-height: 1.4;
        }
        .form-group {
          margin-bottom: 15px;
        }
        .form-group label {
          display: block; font-size: 12px; text-transform: uppercase;
          letter-spacing: 0.5px; color: #cbd5e0; margin-bottom: 5px;
        }
        .form-group input {
          width: 100%; padding: 10px; border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05); color: #fff;
          font-size: 14px; box-sizing: border-box;
        }
        .form-group input:focus {
          border-color: #0074D9; outline: none; background: rgba(255, 255, 255, 0.1);
        }
        .setup-btn {
          width: 100%; padding: 12px; border-radius: 6px; border: none;
          background: #0074D9; color: #fff; font-size: 16px; font-weight: bold;
          cursor: pointer; transition: background 0.2s; margin-top: 15px;
        }
        .setup-btn:hover { background: #0056b3; }
        .setup-btn:disabled { background: #4a5568; cursor: not-allowed; }
        .setup-status {
          margin-top: 15px; padding: 10px; border-radius: 6px;
          font-size: 14px; text-align: center; display: none;
        }
        .status-success { background: rgba(48, 180, 80, 0.2); color: #2ecc71; border: 1px solid #2ecc71; }
        .status-error { background: rgba(231, 76, 60, 0.2); color: #e74c3c; border: 1px solid #e74c3c; }
        .help-link {
          display: block; text-align: center; margin-top: 15px;
          font-size: 12px; color: #0074D9; text-decoration: none;
        }
        .help-link:hover { text-decoration: underline; }
      </style>
      <div class="setup-card">
        <div class="setup-title">Firebase Setup Wizard</div>
        <div class="setup-subtitle" id="setup-subtitle-text">
          ${readyToSeed 
            ? 'Firebase is successfully connected to your project! <br/>Click below to initialize and seed your Firestore database.' 
            : 'Connect your Mobile Shop POS system to Firebase.<br/>Paste your Firebase Web App configuration below.'}
        </div>
        
        <form id="firebase-config-form" style="${readyToSeed ? 'display:none;' : ''}">
          <div class="form-group">
            <label>API Key</label>
            <input type="text" id="apiKey" required placeholder="AIzaSy...">
          </div>
          <div class="form-group">
            <label>Auth Domain</label>
            <input type="text" id="authDomain" required placeholder="your-project.firebaseapp.com">
          </div>
          <div class="form-group">
            <label>Project ID</label>
            <input type="text" id="projectId" required placeholder="your-project">
          </div>
          <div class="form-group">
            <label>Storage Bucket</label>
            <input type="text" id="storageBucket" required placeholder="your-project.appspot.com">
          </div>
          <div class="form-group">
            <label>Messaging Sender ID</label>
            <input type="text" id="messagingSenderId" required placeholder="1234567890">
          </div>
          <div class="form-group">
            <label>App ID</label>
            <input type="text" id="appId" required placeholder="1:12345:web:abcd">
          </div>
          <button type="submit" class="setup-btn" id="submit-config-btn">Connect & Save</button>
        </form>
        <button class="setup-btn" id="seed-db-btn" style="${readyToSeed ? 'display:block;' : 'display:none;'} background:#2e7d32;">Initialize & Seed Database</button>
        <div class="setup-status" id="setup-status-box"></div>
        <a href="https://console.firebase.google.com/" target="_blank" class="help-link">Open Firebase Console</a>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = document.getElementById('firebase-config-form');
    const statusBox = document.getElementById('setup-status-box');
    const submitBtn = document.getElementById('submit-config-btn');
    const seedBtn = document.getElementById('seed-db-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      statusBox.style.display = 'none';

      const config = {
        apiKey: document.getElementById('apiKey').value.trim(),
        authDomain: document.getElementById('authDomain').value.trim(),
        projectId: document.getElementById('projectId').value.trim(),
        storageBucket: document.getElementById('storageBucket').value.trim(),
        messagingSenderId: document.getElementById('messagingSenderId').value.trim(),
        appId: document.getElementById('appId').value.trim()
      };

      try {
        if (firebase.apps.length > 0) {
          await firebase.app().delete();
        }
        firebase.initializeApp(config);
        const testDb = firebase.firestore();
        
        statusBox.className = 'setup-status status-success';
        statusBox.textContent = 'Firebase connected! Ready to seed database.';
        statusBox.style.display = 'block';
        
        localStorage.setItem('firebaseConfig', JSON.stringify(config));
        
        form.style.display = 'none';
        seedBtn.style.display = 'block';
        db = testDb;
        storage = firebase.storage();
        isInitialized = true;
      } catch (err) {
        console.error(err);
        statusBox.className = 'setup-status status-error';
        statusBox.textContent = 'Connection failed: ' + err.message;
        statusBox.style.display = 'block';
        submitBtn.disabled = false;
      }
    });

    seedBtn.addEventListener('click', async () => {
      seedBtn.disabled = true;
      statusBox.className = 'setup-status';
      statusBox.style.backgroundColor = 'rgba(255, 165, 0, 0.2)';
      statusBox.style.color = 'orange';
      statusBox.style.border = '1px solid orange';
      statusBox.textContent = 'Seeding database. Please wait...';
      statusBox.style.display = 'block';

      try {
        await seedFirebaseDatabase();
        statusBox.className = 'setup-status status-success';
        statusBox.innerHTML = 'Database Seeded successfully!<br/>Default admin login: <strong>owner / owner123</strong><br/>Reloading app in 3 seconds...';
        setTimeout(() => {
          window.location.reload();
        }, 3500);
      } catch (err) {
        console.error(err);
        statusBox.className = 'setup-status status-error';
        statusBox.textContent = 'Seeding failed: ' + err.message;
        seedBtn.disabled = false;
      }
    });
  }

  // ==========================================
  // 3. Database Seeding Logic
  // ==========================================
  async function seedFirebaseDatabase() {
    const batch = db.batch();

    // 1. Counters
    const countersRef = db.collection('system').doc('counters');
    batch.set(countersRef, {
      users: 5, suppliers: 4, products: 12, customers: 0,
      inventory_movements: 12, sales: 0, repairs: 0, used_phones: 0,
      activity_logs: 0, expenses: 0, returns: 0, payments: 0,
      cash_drawer: 0, installments: 0
    });

    // 2. Settings
    const settingsRef = db.collection('system').doc('settings');
    batch.set(settingsRef, Object.assign({}, SETTINGS_DEFAULTS, { timezone: 'GMT+5:30' }));

    // 3. Roles
    const roles = [
      { key: 'owner', label: 'Owner', color: '#6a1b9a', sort: 0, is_super: 1, hidden_signup: 1 },
      { key: 'manager', label: 'Manager', color: '#0074D9', sort: 1, is_super: 0, hidden_signup: 1 },
      { key: 'employee', label: 'Employee', color: '#2e7d32', sort: 2, is_super: 0, hidden_signup: 0 }
    ];
    roles.forEach(r => {
      const ref = db.collection('roles').doc(r.key);
      batch.set(ref, {
        key: r.key, label: r.label, color: r.color, sort_order: r.sort,
        is_super: r.is_super, hidden_signup: r.hidden_signup,
        perms: rbacDefaultPerms(r.key)
      });
    });

    // 4. Users
    const nowIso = new Date().toISOString();
    const demoUsers = [
      { id: 1, user: 'owner', email: 'owner@demo.com', pwd: 'owner123', role: 'owner', status: 'active' },
      { id: 2, user: 'manager', email: 'manager@demo.com', pwd: 'manager123', role: 'manager', status: 'active' },
      { id: 3, user: 'emp1', email: 'emp1@demo.com', pwd: 'emp123', role: 'employee', status: 'active' },
      { id: 4, user: 'emp2', email: 'emp2@demo.com', pwd: 'emp123', role: 'employee', status: 'active' },
      { id: 5, user: 'emp3', email: 'emp3@demo.com', pwd: 'emp123', role: 'employee', status: 'inactive' }
    ];
    demoUsers.forEach(u => {
      const ref = db.collection('users').doc(String(u.id));
      batch.set(ref, {
        id: u.id, username: u.user, email: u.email, password: u.pwd, role: u.role, status: u.status,
        profile_image: SETTINGS_DEFAULTS.shop_logo, theme_mode: 'light', custom_colors: '',
        created_at: nowIso, created_by: 'System', updated_at: nowIso, updated_by: 'System', is_deleted: 0
      });
    });

    // 5. Suppliers
    const suppliers = [
      { id: 1, name: 'Supplier 1', phone: '0423000001', email: 'supplier1@demo.com', address: 'House 4, Street 1, Demo City', company: 'Supplier 1', contact_person: 'Contact 1', payment_terms: 'Net-30', category: 'phones & parts', status: 'active', notes: 'Net-30 terms', opening_balance: 0, created: nowIso, updated: nowIso, deleted: 0 },
      { id: 2, name: 'Supplier 2', phone: '0423000002', email: 'supplier2@demo.com', address: 'House 88, Street 2, Demo City', company: 'Supplier 2', contact_person: 'Contact 2', payment_terms: 'Net-30', category: 'accessories', status: 'active', notes: 'Fast shipping', opening_balance: 0, created: nowIso, updated: nowIso, deleted: 0 },
      { id: 3, name: 'Supplier 3', phone: '0423000003', email: 'supplier3@demo.com', address: 'House 12, Street 3, Demo City', company: 'Supplier 3', contact_person: 'Contact 3', payment_terms: 'Net-30', category: 'repair parts', status: 'active', notes: 'OEM parts', opening_balance: 0, created: nowIso, updated: nowIso, deleted: 0 },
      { id: 4, name: 'Supplier 4', phone: '0423000004', email: 'supplier4@demo.com', address: 'House 5, Street 4, Demo City', company: 'Supplier 4', contact_person: 'Contact 4', payment_terms: 'Net-30', category: 'phones & parts', status: 'active', notes: '', opening_balance: 0, created: nowIso, updated: nowIso, deleted: 0 }
    ];
    suppliers.forEach(s => {
      batch.set(db.collection('suppliers').doc(String(s.id)), s);
    });

    // 6. Products
    const P = (id, sup, name, cat, bc, pur, sale, stock, low) => ({
      id, supplier_id: sup, name, sku: bc, category: cat, barcode: bc, brand: name.split(' ')[0], model: '', color: '', storage: '', ram: '', condition: 'new', purchase_price: pur, sale_price: sale, mrp: Math.round(sale * 1.15 * 100) / 100, vat_rate: 21, tax_inclusive: 0, discount_max: 10, stock_qty: stock, low_stock_alert: low || 5, reorder_qty: (low || 5) * 2, unit: 'pcs', shelf_location: '', supplier_sku: '', weight: '', warranty_months: cat === 'phone' ? 12 : 0, description: '', image_url: '', status: 'active', created: nowIso, updated: nowIso, deleted: 0, images: []
    });
    const products = [
      P(1, 1, 'Smartphone Model 1 128GB', 'phone', 'PH-SM1-128', 520, 699, 8, 3),
      P(2, 1, 'Smartphone Model 2', 'phone', 'PH-SM2', 430, 599, 5, 3),
      P(3, 1, 'Smartphone Model 3', 'phone', 'PH-SM3', 400, 549, 4, 2),
      P(4, 1, 'Smartphone Model 4', 'phone', 'PH-SM4', 150, 229, 12, 4),
      P(5, 2, 'Fast Charger 25W', 'accessory', 'AC-CHG25', 6, 19.99, 40, 10),
      P(6, 2, 'Screen Protector', 'accessory', 'AC-TGP', 1.2, 9.99, 60, 15),
      P(7, 2, 'Phone Case', 'accessory', 'AC-CASE', 2, 14.99, 35, 10),
      P(8, 2, 'Wireless Earbuds', 'accessory', 'AC-EARB', 18, 49.99, 18, 6),
      P(9, 2, 'Power Bank 10000mAh', 'accessory', 'AC-PB10', 11, 29.99, 3, 6),
      P(10, 3, 'Model 1 Screen Assembly', 'repair_part', 'RP-SM1SCR', 65, 129, 7, 3),
      P(11, 3, 'Model 2 Battery', 'repair_part', 'RP-SM2BAT', 14, 39, 9, 4),
      P(12, 3, 'Charging Port Flex', 'repair_part', 'RP-CPFLEX', 4, 19, 2, 5)
    ];
    products.forEach(p => {
      batch.set(db.collection('products').doc(String(p.id)), p);
    });

    // 7. Opening inventory movements
    products.forEach((p, index) => {
      const movementId = index + 1;
      batch.set(db.collection('inventory_movements').doc(String(movementId)), {
        id: movementId, product_id: p.id, user_id: 1, movement_type: 'purchase', qty_change: p.stock_qty, note: 'Opening stock', created: nowIso, updated: nowIso
      });
    });

    await batch.commit();
  }

  // ==========================================
  // 4. Atomic ID Generator Helper
  // ==========================================
  async function getNextId(collectionName) {
    const counterRef = db.collection('system').doc('counters');
    return db.runTransaction(async (transaction) => {
      const sfDoc = await transaction.get(counterRef);
      if (!sfDoc.exists) {
        throw new Error("Counters document does not exist! Run Database seed first.");
      }
      const val = sfDoc.data()[collectionName] || 0;
      const nextVal = val + 1;
      transaction.update(counterRef, { [collectionName]: nextVal });
      return nextVal;
    });
  }

  // ==========================================
  // 5. Auth & Access Gates Helpers
  // ==========================================
  const SESSION_TTL_MS = 12 * 3600 * 1000; // 12 Hours

  async function getSession(token) {
    if (!token) return null;
    const doc = await db.collection('sessions').doc(token).get();
    if (!doc.exists) return null;
    const s = doc.data();
    if (s.expiresAt < Date.now()) {
      await db.collection('sessions').doc(token).delete();
      return null;
    }
    return s;
  }

  async function resolveUserFromToken(token) {
    const s = await getSession(token);
    if (!s) return null;
    const doc = await db.collection('users').doc(String(s.uid)).get();
    return doc.exists ? doc.data() : null;
  }

  async function hasPermission(role, page, perm) {
    if (role === 'owner') return true;
    const doc = await db.collection('roles').doc(role).get();
    if (!doc.exists) return false;
    const r = doc.data();
    return !!(r && r.perms && r.perms[page] && r.perms[page][perm || 'v']);
  }

  async function gate(token, page, perm) {
    const s = await getSession(token);
    if (!s) return 0;
    const isAllowed = await hasPermission(s.role, page, perm);
    return isAllowed ? s.uid : 0;
  }

  // ==========================================
  // 6. Generic Bridge Helpers
  // ==========================================
  function ok(msg, extra = {}) {
    return Object.assign({ success: true, message: msg || '' }, extra);
  }
  function err(msg) {
    return { success: false, message: msg || 'Something went wrong' };
  }
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }
  function padNo(n) {
    const s = String(n);
    return s.length >= 4 ? s : ('0000' + s).slice(-4);
  }
  function ymd(d) {
    const pad = num => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  // Fallback upload (stores image as base64 inline if Storage fails or rules block it)
  async function uploadAsset(base64Data, filename, subfolder) {
    try {
      const parts = base64Data.split(',');
      const mime = parts[0].match(/:(.*?);/)[1];
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while(n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const fileId = `${Date.now()}_${filename}`;
      const fileRef = storage.ref().child(`uploads/${subfolder}/${fileId}`);
      await fileRef.put(blob);
      const downloadUrl = await fileRef.getDownloadURL();
      return ok('', { fileId: fileRef.fullPath, fileUrl: downloadUrl, fileName: filename });
    } catch(e) {
      console.warn("Storage upload failed, falling back to base64 inline:", e);
      return ok('', { fileId: "inline_" + Date.now(), fileUrl: base64Data, fileName: filename });
    }
  }

  async function resolveUserNames() {
    const users = {};
    const snapshot = await db.collection('users').get();
    snapshot.forEach(doc => {
      const u = doc.data();
      users[u.id] = u.username;
    });
    return users;
  }

  async function resolveCustomerNames() {
    const custs = {};
    const snapshot = await db.collection('customers').get();
    snapshot.forEach(doc => {
      const c = doc.data();
      custs[c.id] = c.name;
    });
    return custs;
  }

  async function logActivity(userId, actionType, refTable, refId, desc) {
    try {
      const id = await getNextId('activity_logs');
      await db.collection('activity_logs').doc(String(id)).set({
        id, user_id: userId || 0, action_type: actionType, reference_table: refTable || '',
        reference_id: String(refId) || '', description: desc || '', ip_address: '',
        created: new Date().toISOString()
      });
    } catch (e) {
      console.error('Log error:', e);
    }
  }

  // ==========================================
  // 7. Bridge Functions Map
  // ==========================================
  const bridge = {
    // ---- Auth ----
    authenticateUser: async (username, password) => {
      try {
        const snapshot = await db.collection('users').where('username', '==', username).get();
        if (snapshot.empty) return err('Invalid username or password');
        
        let userDoc = null;
        snapshot.forEach(doc => { userDoc = doc.data(); });
        
        if (Number(userDoc.is_deleted) === 1) return err('Invalid username or password');
        if (String(password) !== String(userDoc.password)) {
          await logActivity(userDoc.id, 'login', 'users', userDoc.id, 'Login failed — bad password');
          return err('Invalid username or password');
        }
        if (userDoc.status !== 'active') {
          await logActivity(userDoc.id, 'login', 'users', userDoc.id, 'Login failed — inactive');
          return err('Account is inactive. Contact the owner.');
        }

        const token = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await db.collection('sessions').doc(token).set({
          uid: userDoc.id,
          role: userDoc.role,
          expiresAt: Date.now() + SESSION_TTL_MS
        });

        const perms = await rbacDefaultPerms(userDoc.role);
        const docRole = await db.collection('roles').doc(userDoc.role).get();
        const roleData = docRole.exists ? docRole.data() : { perms };

        await logActivity(userDoc.id, 'login', 'users', userDoc.id, 'Login success');
        return ok('', {
          token: token,
          user: {
            id: userDoc.id, username: userDoc.username, email: userDoc.email, role: userDoc.role,
            profileImage: userDoc.profile_image || '', themeMode: userDoc.theme_mode || 'light', customColors: userDoc.custom_colors || '',
            permissions: roleData.perms || perms, canEditRbac: (userDoc.role === 'owner')
          }
        });
      } catch (e) {
        return err('Error: ' + e.message);
      }
    },

    logout: async (token) => {
      if (token) {
        await db.collection('sessions').doc(token).delete();
      }
      return ok('Signed out');
    },

    getMyPermissions: async (token) => {
      const s = await getSession(token);
      if (!s) return err('Not signed in');
      const doc = await db.collection('roles').doc(s.role).get();
      const perms = doc.exists ? doc.data().perms : rbacDefaultPerms(s.role);
      return ok('', { perms, canEdit: (s.role === 'owner'), role: s.role });
    },

    getRbacMatrix: async (token) => {
      const s = await getSession(token);
      if (!s || s.role !== 'owner') return err('Access denied');
      const rolesSnapshot = await db.collection('roles').get();
      const roles = [];
      const perms = {};
      rolesSnapshot.forEach(doc => {
        const r = doc.data();
        roles.push({ key: r.key, label: r.label, color: r.color, is_super: r.is_super });
        perms[r.key] = r.perms;
      });
      return ok('', { pages: RBAC_PAGES, roles, perms });
    },

    toggleRbac: async (roleKey, pageKey, perm, value, token) => {
      const uid = await gate(token, 'settings', 'e');
      if (!uid) return err('Access denied');
      if (['v','a','e','d'].indexOf(perm) === -1) return err('Bad permission');
      
      const roleRef = db.collection('roles').doc(roleKey);
      const roleDoc = await roleRef.get();
      if (!roleDoc.exists) return err('Role not found');
      
      const role = roleDoc.data();
      if (Number(role.is_super) === 1) return err('Owner permissions are locked');
      
      const p = role.perms || {};
      if (!p[pageKey]) p[pageKey] = { v:0, a:0, e:0, d:0 };
      p[pageKey][perm] = value ? 1 : 0;
      if (perm === 'v' && !value) { p[pageKey].a = 0; p[pageKey].e = 0; p[pageKey].d = 0; }
      if (perm !== 'v' && value) p[pageKey].v = 1;
      
      await roleRef.update({ perms: p });
      await logActivity(uid, 'role_update', 'roles', roleKey, `${roleKey} · ${pageKey} · ${perm}=${value ? 1 : 0}`);
      return ok('Saved');
    },

    // ---- Settings ----
    getShopSettings: async (token) => {
      const doc = await db.collection('system').doc('settings').get();
      const settings = doc.exists ? doc.data() : SETTINGS_DEFAULTS;
      return ok('', { data: Object.assign({}, SETTINGS_DEFAULTS, settings) });
    },

    saveShopSettings: async (data, token) => {
      const uid = await gate(token, 'settings', 'e');
      if (!uid) return err('Access denied');
      
      const settingsRef = db.collection('system').doc('settings');
      const clean = {};
      const touched = [];
      
      Object.keys(data).forEach(k => {
        if (SETTINGS_DEFAULTS.hasOwnProperty(k)) {
          let v = data[k];
          // setting coercion logic
          if (k === 'currency_decimals') {
            let d = parseInt(v); v = String(isNaN(d) ? 2 : Math.min(3, Math.max(0, d)));
          } else if (k === 'vat_default' || k === 'loyalty_point_value') {
            v = String(Math.max(0, Number(v) || 0));
          } else if (k === 'loyalty_earn_per') {
            let p = Number(v) || 0; v = String(p > 0 ? p : 1);
          } else if (k === 'low_stock_default') {
            v = String(Math.max(0, parseInt(v) || 0));
          } else if (['enable_vat', 'show_logo_on_receipt', 'loyalty_enabled', 'installment_reminder_email'].indexOf(k) !== -1) {
            v = (v === '1' || v === 1) ? '1' : '0';
          }
          clean[k] = v;
          touched.push(k);
        }
      });

      await settingsRef.update(clean);
      await logActivity(uid, 'settings_update', 'settings', '', 'Updated settings: ' + touched.join(', '));
      return ok('Settings saved');
    },

    // ---- Users ----
    getUsers: async (token) => {
      const uid = await gate(token, 'users', 'v');
      if (!uid) return err('Access denied');
      const snapshot = await db.collection('users').get();
      const data = [];
      snapshot.forEach(doc => {
        const u = doc.data();
        if (Number(u.is_deleted) === 1) return;
        data.push({
          id: u.id, username: u.username, email: u.email, role: u.role, status: u.status,
          profileImage: u.profile_image, created_at: u.created_at, created_by: u.created_by,
          updated_at: u.updated_at, updated_by: u.updated_by
        });
      });
      return ok('', { data });
    },

    addUser: async (data, token) => {
      const uid = await gate(token, 'users', 'a');
      if (!uid) return err('Access denied');
      if (!data.username || !data.email || !data.password) return err('Username, email & password required');
      
      const duplicateSnap = await db.collection('users').where('username', '==', data.username).get();
      let hasActiveUser = false;
      duplicateSnap.forEach(d => { if (Number(d.data().is_deleted) !== 1) hasActiveUser = true; });
      if (hasActiveUser) return err('Username already exists');

      // role assignment guard
      if (data.role === 'owner' && (await resolveUserFromToken(token)).role !== 'owner') {
        return err('Only an owner can assign owner role');
      }

      const id = await getNextId('users');
      const nowIso = new Date().toISOString();
      await db.collection('users').doc(String(id)).set({
        id, username: data.username, email: data.email, password: data.password,
        role: data.role || 'employee', status: data.status || 'active',
        profile_image: SETTINGS_DEFAULTS.shop_logo, theme_mode: 'light', custom_colors: '',
        created_at: nowIso, created_by: String(uid), updated_at: nowIso, updated_by: String(uid), is_deleted: 0
      });
      await logActivity(uid, 'user_add', 'users', id, 'Added user: ' + data.username);
      return ok('User added', { id });
    },

    updateUser: async (id, data, token) => {
      const uid = await gate(token, 'users', 'e');
      if (!uid) return err('Access denied');

      const userRef = db.collection('users').doc(String(id));
      const userDoc = await userRef.get();
      if (!userDoc.exists) return err('User not found');
      
      const tgt = userDoc.data();
      if (tgt.role === 'owner' && (await resolveUserFromToken(token)).role !== 'owner') {
        return err('Only an owner can edit an owner account');
      }

      const updateData = {
        email: data.email,
        updated_at: new Date().toISOString(),
        updated_by: String(uid)
      };
      if (data.password && String(data.password).trim() !== '') updateData.password = data.password;
      if (data.role) updateData.role = data.role;
      if (data.status) updateData.status = data.status;

      await userRef.update(updateData);
      await logActivity(uid, 'user_edit', 'users', id, 'Updated user: ' + tgt.username);
      return ok('User updated');
    },

    deleteUser: async (id, token) => {
      const uid = await gate(token, 'users', 'd');
      if (!uid) return err('Access denied');
      if (Number(id) === Number(uid)) return err('You cannot delete your own account');

      const userRef = db.collection('users').doc(String(id));
      const userDoc = await userRef.get();
      if (!userDoc.exists) return err('User not found');

      await userRef.update({
        is_deleted: 1,
        status: 'inactive',
        updated_at: new Date().toISOString(),
        updated_by: String(uid)
      });
      await logActivity(uid, 'deletion', 'users', id, 'Deleted user: ' + userDoc.data().username);
      return ok('User deleted');
    },

    updateMyAccount: async (token, form) => {
      const user = await resolveUserFromToken(token);
      if (!user) return err('Not signed in');
      
      if (String(form.CurrentPassword) !== String(user.password)) return err('Current password is incorrect');
      
      const updateData = {
        email: form.Email,
        updated_at: new Date().toISOString(),
        updated_by: String(user.id)
      };
      if (form.NewPassword && String(form.NewPassword).trim() !== '') {
        updateData.password = form.NewPassword;
      }
      
      await db.collection('users').doc(String(user.id)).update(updateData);
      await logActivity(user.id, 'account_update', 'users', user.id, 'Updated own profile');
      return ok('Account updated');
    },

    getUserSettings: async (token) => {
      const user = await resolveUserFromToken(token);
      if (!user) return err('Not signed in');
      return ok('', { settings: { profileImage: user.profile_image || '', themeMode: user.theme_mode || 'light', customColors: user.custom_colors || '' } });
    },

    updateUserSettings: async (token, settings) => {
      const user = await resolveUserFromToken(token);
      if (!user) return err('Not signed in');

      const updateData = { updated_at: new Date().toISOString() };
      if (settings.profileImage !== undefined) updateData.profile_image = settings.profileImage;
      if (settings.themeMode !== undefined) updateData.theme_mode = settings.themeMode;
      if (settings.customColors !== undefined) updateData.custom_colors = settings.customColors;

      await db.collection('users').doc(String(user.id)).update(updateData);
      return ok('Settings updated');
    },

    // ---- File Uploads ----
    uploadProfileImage: async (base64Data, filename, token) => {
      const user = await resolveUserFromToken(token);
      if (!user) return err('Not signed in');
      return uploadAsset(base64Data, filename, `profile_${user.id}`);
    },

    uploadShopLogo: async (base64Data, filename, token) => {
      const uid = await gate(token, 'settings', 'e');
      if (!uid) return err('Access denied');
      return uploadAsset(base64Data, filename, 'shop_logo');
    },

    uploadProductImage: async (base64Data, filename, token) => {
      const user = await resolveUserFromToken(token);
      if (!user || !(await hasPermission(user.role, 'products', 'a') || await hasPermission(user.role, 'products', 'e'))) {
        return err('Access denied');
      }
      return uploadAsset(base64Data, filename, 'products');
    },

    uploadUsedIdImage: async (base64Data, filename, token) => {
      const user = await resolveUserFromToken(token);
      if (!user || !(await hasPermission(user.role, 'used_phones', 'a') || await hasPermission(user.role, 'used_phones', 'e'))) {
        return err('Access denied');
      }
      return uploadAsset(base64Data, filename, 'used_ids');
    },

    // ---- Suppliers ----
    getSuppliers: async (token) => {
      const uid = await gate(token, 'suppliers', 'v');
      if (!uid) return err('Access denied');
      const snapshot = await db.collection('suppliers').get();
      const data = [];
      snapshot.forEach(doc => {
        const s = doc.data();
        if (s.deleted) return;
        data.push(s);
      });
      data.sort((a, b) => b.id - a.id);
      return ok('', { data });
    },

    addSupplier: async (d, token) => {
      const uid = await gate(token, 'suppliers', 'a');
      if (!uid) return err('Access denied');
      if (!d.name) return err('Supplier name required');

      const id = await getNextId('suppliers');
      const nowIso = new Date().toISOString();
      const record = {
        id, name: String(d.name).trim(), company: d.company || '', contact_person: d.contact_person || '',
        phone: d.phone || '', email: d.email || '', website: d.website || '',
        address: d.address || '', city: d.city || '', country: d.country || '', tax_id: d.tax_id || '',
        payment_terms: d.payment_terms || '', bank_name: d.bank_name || '', bank_account: d.bank_account || '',
        opening_balance: round2(d.opening_balance), category: d.category || '', status: d.status || 'active', notes: d.notes || '',
        created: nowIso, updated: nowIso, deleted: 0
      };

      await db.collection('suppliers').doc(String(id)).set(record);
      await logActivity(uid, 'supplier_add', 'suppliers', id, 'Added supplier: ' + record.name);
      return ok('Supplier added', { id });
    },

    updateSupplier: async (id, d, token) => {
      const uid = await gate(token, 'suppliers', 'e');
      if (!uid) return err('Access denied');

      const supRef = db.collection('suppliers').doc(String(id));
      const doc = await supRef.get();
      if (!doc.exists || doc.data().deleted) return err('Supplier not found');

      const updateData = {
        name: String(d.name).trim(), company: d.company || '', contact_person: d.contact_person || '',
        phone: d.phone || '', email: d.email || '', website: d.website || '',
        address: d.address || '', city: d.city || '', country: d.country || '', tax_id: d.tax_id || '',
        payment_terms: d.payment_terms || '', bank_name: d.bank_name || '', bank_account: d.bank_account || '',
        opening_balance: round2(d.opening_balance), category: d.category || '', status: d.status || 'active', notes: d.notes || '',
        updated: new Date().toISOString()
      };

      await supRef.update(updateData);
      await logActivity(uid, 'supplier_edit', 'suppliers', id, 'Updated supplier: ' + d.name);
      return ok('Supplier updated');
    },

    deleteSupplier: async (id, token) => {
      const uid = await gate(token, 'suppliers', 'd');
      if (!uid) return err('Access denied');

      // Check if products use supplier
      const productsSnap = await db.collection('products').where('supplier_id', '==', Number(id)).get();
      let inUse = false;
      productsSnap.forEach(d => { if (!d.data().deleted) inUse = true; });
      if (inUse) return err('Supplier has products — reassign or remove them first');

      await db.collection('suppliers').doc(String(id)).update({ deleted: 1, updated: new Date().toISOString() });
      await logActivity(uid, 'deletion', 'suppliers', id, 'Deleted supplier');
      return ok('Supplier deleted');
    },

    // ---- Products ----
    getProducts: async (token) => {
      const uid = await gate(token, 'products', 'v');
      if (!uid) return err('Access denied');

      const productsSnap = await db.collection('products').get();
      const suppliersSnap = await db.collection('suppliers').get();
      const sup = {};
      suppliersSnap.forEach(d => { sup[d.data().id] = d.data().name; });

      const data = [];
      const shopSettingsDoc = await db.collection('system').doc('settings').get();
      const shopSettings = shopSettingsDoc.exists ? shopSettingsDoc.data() : SETTINGS_DEFAULTS;

      productsSnap.forEach(doc => {
        const p = doc.data();
        if (p.deleted) return;
        p.supplier_name = sup[p.supplier_id] || '—';
        p.low = Number(p.stock_qty) <= Number(p.low_stock_alert || shopSettings.low_stock_default || 5);
        data.push(p);
      });
      
      data.sort((a, b) => b.id - a.id);
      return ok('', { data });
    },

    getProductDetail: async (productId, token) => {
      const uid = await gate(token, 'products', 'v');
      if (!uid) return err('Access denied');
      
      const prodDoc = await db.collection('products').doc(String(productId)).get();
      if (!prodDoc.exists || prodDoc.data().deleted) return err('Product not found');
      const product = prodDoc.data();
      
      const users = await resolveUserNames();

      const movesSnap = await db.collection('inventory_movements')
        .where('product_id', '==', Number(productId))
        .get();
      const moves = [];
      movesSnap.forEach(doc => {
        const m = doc.data();
        m.user_name = users[m.user_id] || '—';
        moves.push(m);
      });
      moves.sort((a, b) => b.id - a.id);
      const slicedMoves = moves.slice(0, 100);

      const salesSnap = await db.collection('sales').get();
      let sold = [];
      salesSnap.forEach(doc => {
        const s = doc.data();
        if (s.deleted) return;
        (s.items || []).forEach(l => {
          if (Number(l.product_id) === Number(productId)) {
            sold.push({
              invoice_no: s.invoice_no,
              created: s.created,
              qty: Number(l.qty),
              unit_price: round2(l.unit_price),
              currency: s.currency || '₹',
              currency_code: s.currency_code || 'INR',
              currency_position: s.currency_position || 'before',
              currency_decimals: s.currency_decimals != null ? s.currency_decimals : 2
            });
          }
        });
      });
      sold.sort((a, b) => new Date(b.created) - new Date(a.created));
      const slicedSold = sold.slice(0, 100);
      const soldQty = sold.reduce((sum, item) => sum + Number(item.qty), 0);

      return ok('', {
        data: {
          product,
          moves: slicedMoves,
          sold: slicedSold,
          soldQty
        }
      });
    },

    addProduct: async (d, token) => {
      const uid = await gate(token, 'products', 'a');
      if (!uid) return err('Access denied');
      if (!d.name || !d.supplier_id) return err('Name & supplier required');

      if (d.barcode) {
        const dupSnap = await db.collection('products').where('barcode', '==', d.barcode).get();
        let hasDup = false;
        dupSnap.forEach(doc => { if (!doc.data().deleted) hasDup = true; });
        if (hasDup) return err('Barcode already exists');
      }

      const id = await getNextId('products');
      const settingsDoc = await db.collection('system').doc('settings').get();
      const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;
      const qty = parseInt(d.stock_qty) || 0;
      const nowIso = new Date().toISOString();

      const imgs = (Array.isArray(d.images) ? d.images : (d.image_url ? [d.image_url] : []))
        .map(s => String(s || '').trim()).filter(Boolean);

      const record = {
        id, supplier_id: Number(d.supplier_id) || 0, name: String(d.name).trim(), sku: d.sku || '',
        category: d.category || 'phone', barcode: d.barcode || '', brand: d.brand || '', model: d.model || '',
        color: d.color || '', storage: d.storage || '', ram: d.ram || '', condition: d.condition || 'new',
        purchase_price: round2(d.purchase_price), sale_price: round2(d.sale_price), mrp: round2(d.mrp),
        vat_rate: (d.vat_rate != null && d.vat_rate !== '') ? round2(d.vat_rate) : round2(cfg.vat_default || 21),
        tax_inclusive: d.tax_inclusive ? 1 : 0, discount_max: round2(d.discount_max),
        low_stock_alert: parseInt(d.low_stock_alert) || parseInt(cfg.low_stock_default || 5),
        reorder_qty: parseInt(d.reorder_qty) || 0, unit: d.unit || 'pcs',
        shelf_location: d.shelf_location || '', supplier_sku: d.supplier_sku || '', weight: d.weight || '',
        warranty_months: parseInt(d.warranty_months) || 0, description: d.description || '',
        images: imgs, image_url: imgs[0] || '', status: d.status || 'active',
        stock_qty: qty, created: nowIso, updated: nowIso, deleted: 0
      };

      await db.collection('products').doc(String(id)).set(record);
      
      if (qty > 0) {
        const movementId = await getNextId('inventory_movements');
        await db.collection('inventory_movements').doc(String(movementId)).set({
          id: movementId, product_id: id, user_id: uid, movement_type: 'purchase', qty_change: qty, note: 'Opening stock', created: nowIso, updated: nowIso
        });
      }
      
      await logActivity(uid, 'product_add', 'products', id, 'Added product: ' + record.name);
      return ok('Product added', { id });
    },

    updateProduct: async (id, d, token) => {
      const uid = await gate(token, 'products', 'e');
      if (!uid) return err('Access denied');

      const productRef = db.collection('products').doc(String(id));
      const doc = await productRef.get();
      if (!doc.exists || doc.data().deleted) return err('Product not found');

      if (d.barcode) {
        const dupSnap = await db.collection('products').where('barcode', '==', d.barcode).get();
        let hasDup = false;
        dupSnap.forEach(dDoc => { if (!dDoc.data().deleted && dDoc.data().id !== Number(id)) hasDup = true; });
        if (hasDup) return err('Barcode already exists');
      }

      const settingsDoc = await db.collection('system').doc('settings').get();
      const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;

      const imgs = (Array.isArray(d.images) ? d.images : (d.image_url ? [d.image_url] : []))
        .map(s => String(s || '').trim()).filter(Boolean);

      const updateData = {
        supplier_id: Number(d.supplier_id) || 0, name: String(d.name).trim(), sku: d.sku || '',
        category: d.category || 'phone', barcode: d.barcode || '', brand: d.brand || '', model: d.model || '',
        color: d.color || '', storage: d.storage || '', ram: d.ram || '', condition: d.condition || 'new',
        purchase_price: round2(d.purchase_price), sale_price: round2(d.sale_price), mrp: round2(d.mrp),
        vat_rate: (d.vat_rate != null && d.vat_rate !== '') ? round2(d.vat_rate) : round2(cfg.vat_default || 21),
        tax_inclusive: d.tax_inclusive ? 1 : 0, discount_max: round2(d.discount_max),
        low_stock_alert: parseInt(d.low_stock_alert) || parseInt(cfg.low_stock_default || 5),
        reorder_qty: parseInt(d.reorder_qty) || 0, unit: d.unit || 'pcs',
        shelf_location: d.shelf_location || '', supplier_sku: d.supplier_sku || '', weight: d.weight || '',
        warranty_months: parseInt(d.warranty_months) || 0, description: d.description || '',
        images: imgs, image_url: imgs[0] || '', status: d.status || 'active',
        updated: new Date().toISOString()
      };

      await productRef.update(updateData);
      await logActivity(uid, 'product_edit', 'products', id, 'Updated product: ' + d.name);
      return ok('Product updated');
    },

    deleteProduct: async (id, token) => {
      const uid = await gate(token, 'products', 'd');
      if (!uid) return err('Access denied');
      await db.collection('products').doc(String(id)).update({ deleted: 1, updated: new Date().toISOString() });
      await logActivity(uid, 'deletion', 'products', id, 'Deleted product');
      return ok('Product deleted');
    },

    adjustStock: async (id, qtyChange, note, token) => {
      const uid = await gate(token, 'inventory', 'a');
      if (!uid) return err('Access denied');

      const productRef = db.collection('products').doc(String(id));
      const delta = parseInt(qtyChange) || 0;
      if (!delta) return err('Quantity change required');

      return db.runTransaction(async (transaction) => {
        const doc = await transaction.get(productRef);
        if (!doc.exists || doc.data().deleted) throw new Error('Product not found');
        
        const currentStock = Number(doc.data().stock_qty) || 0;
        const newStock = currentStock + delta;
        if (newStock < 0) throw new Error('Adjustment would make stock negative');

        transaction.update(productRef, { stock_qty: newStock });
        
        const movementId = await getNextId('inventory_movements');
        const nowIso = new Date().toISOString();
        const movementRef = db.collection('inventory_movements').doc(String(movementId));
        
        transaction.set(movementRef, {
          id: movementId, product_id: Number(id), user_id: uid, movement_type: 'adjustment', qty_change: delta, note: note || '', created: nowIso, updated: nowIso
        });

        return ok('Stock adjusted');
      }).then(async (res) => {
        const prod = (await productRef.get()).data();
        await logActivity(uid, 'inventory_adjustment', 'products', id, `Stock ${delta > 0 ? '+' : ''}${delta} (${prod.name})`);
        return res;
      }).catch(err => {
        return { success: false, message: err.message };
      });
    },

    // ---- Customers ----
    getCustomers: async (token) => {
      const uid = await gate(token, 'customers', 'v');
      if (!uid) return err('Access denied');

      const customersSnap = await db.collection('customers').get();
      const salesSnap = await db.collection('sales').get();
      const repairsSnap = await db.collection('repairs').get();
      
      const due = {};
      salesSnap.forEach(doc => {
        const s = doc.data();
        if (!s.deleted && s.customer_id) due[s.customer_id] = round2((due[s.customer_id] || 0) + Number(s.due_amount || 0));
      });
      repairsSnap.forEach(doc => {
        const r = doc.data();
        if (!r.deleted && r.customer_id) due[r.customer_id] = round2((due[r.customer_id] || 0) + Number(r.remaining_amount || 0));
      });

      const data = [];
      customersSnap.forEach(doc => {
        const c = doc.data();
        if (c.deleted) return;
        c.outstanding = round2(due[c.id] || 0);
        data.push(c);
      });
      
      data.sort((a, b) => b.id - a.id);
      return ok('', { data });
    },

    addCustomer: async (d, token) => {
      const uid = await gate(token, 'customers', 'a');
      if (!uid) return err('Access denied');
      if (!d.name || !d.phone) return err('Name & phone required');

      const id = await getNextId('customers');
      const nowIso = new Date().toISOString();
      const record = {
        id, name: String(d.name).trim(), phone: String(d.phone).trim(), email: d.email || '',
        company: d.company || '', address: d.address || '', city: d.city || '', country: d.country || '',
        tax_id: d.tax_id || '', customer_type: d.customer_type || 'retail',
        credit_limit: round2(d.credit_limit), loyalty_points: parseInt(d.loyalty_points) || 0, store_credit: 0,
        dob: d.dob || '', gender: d.gender || '', status: d.status || 'active', notes: d.notes || '',
        created: nowIso, updated: nowIso, deleted: 0
      };

      await db.collection('customers').doc(String(id)).set(record);
      await logActivity(uid, 'customer_add', 'customers', id, 'Added customer: ' + record.name);
      return ok('Customer added', { id, data: record });
    },

    updateCustomer: async (id, d, token) => {
      const uid = await gate(token, 'customers', 'e');
      if (!uid) return err('Access denied');

      const custRef = db.collection('customers').doc(String(id));
      const doc = await custRef.get();
      if (!doc.exists || doc.data().deleted) return err('Customer not found');

      const updateData = {
        name: String(d.name).trim(), phone: String(d.phone).trim(), email: d.email || '',
        company: d.company || '', address: d.address || '', city: d.city || '', country: d.country || '',
        tax_id: d.tax_id || '', customer_type: d.customer_type || 'retail',
        credit_limit: round2(d.credit_limit), loyalty_points: parseInt(d.loyalty_points) || 0,
        dob: d.dob || '', gender: d.gender || '', status: d.status || 'active', notes: d.notes || '',
        updated: new Date().toISOString()
      };

      await custRef.update(updateData);
      await logActivity(uid, 'customer_edit', 'customers', id, 'Updated customer: ' + d.name);
      return ok('Customer updated');
    },

    deleteCustomer: async (id, token) => {
      const uid = await gate(token, 'customers', 'd');
      if (!uid) return err('Access denied');
      await db.collection('customers').doc(String(id)).update({ deleted: 1, updated: new Date().toISOString() });
      await logActivity(uid, 'deletion', 'customers', id, 'Deleted customer');
      return ok('Customer deleted');
    },

    // ---- Inventory Movements ----
    getInventoryMovements: async (token, from, to) => {
      const uid = await gate(token, 'inventory', 'v');
      if (!uid) return err('Access denied');

      let query = db.collection('inventory_movements');
      const snapshot = await query.get();
      
      const productsSnap = await db.collection('products').get();
      const pm = {};
      productsSnap.forEach(d => { pm[d.data().id] = d.data().name; });
      const users = await resolveUserNames();

      const data = [];
      snapshot.forEach(doc => {
        const m = doc.data();
        const date = m.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        m.product_name = pm[m.product_id] || '—';
        m.user_name = users[m.user_id] || '—';
        data.push(m);
      });

      data.sort((a, b) => b.id - a.id);
      return ok('', { data });
    },

    getLowStockProducts: async (token) => {
      const uid = await gate(token, 'products', 'v');
      if (!uid) return err('Access denied');

      const productsSnap = await db.collection('products').get();
      const settingsDoc = await db.collection('system').doc('settings').get();
      const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;

      const data = [];
      productsSnap.forEach(doc => {
        const p = doc.data();
        if (p.deleted) return;
        if (Number(p.stock_qty) <= Number(p.low_stock_alert || cfg.low_stock_default || 5)) {
          data.push(p);
        }
      });
      return ok('', { data });
    },

    // ---- POS / Sales ----
    getSales: async (token, from, to) => {
      const uid = await gate(token, 'pos', 'v');
      if (!uid) return err('Access denied');

      const snapshot = await db.collection('sales').get();
      const cm = await resolveCustomerNames();
      const um = await resolveUserNames();

      const data = [];
      snapshot.forEach(doc => {
        const s = doc.data();
        if (s.deleted) return;
        const date = s.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        s.customer_name = s.customer_id ? (cm[s.customer_id] || '—') : 'Walk-in';
        s.cashier_name = um[s.user_id] || '—';
        data.push(s);
      });

      data.sort((a, b) => b.id - a.id);
      return ok('', { data });
    },

    getSale: async (id, token) => {
      const uid = await gate(token, 'pos', 'v');
      if (!uid) return err('Access denied');
      const doc = await db.collection('sales').doc(String(id)).get();
      if (!doc.exists) return err('Sale not found');
      return ok('', { data: doc.data() });
    },

    createSale: async (d, token) => {
      const uid = await gate(token, 'pos', 'a');
      if (!uid) return err('Access denied');
      const items = d.items || [];
      if (!items.length) return err('Add at least one item');

      return db.runTransaction(async (transaction) => {
        const settingsDoc = await transaction.get(db.collection('system').doc('settings'));
        const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;

        const pm = {};
        const productRefs = [];
        items.forEach(it => {
          const ref = db.collection('products').doc(String(it.product_id));
          productRefs.push(ref);
        });

        // Read all products atomically
        const prodDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));
        prodDocs.forEach(pdoc => {
          if (pdoc.exists) pm[pdoc.data().id] = pdoc.data();
        });

        const lines = [];
        let subtotal = 0;
        let vatTotal = 0;
        const need = {};
        const overrides = [];

        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const p = pm[it.product_id];
          if (!p || p.deleted) throw new Error('Product not found in cart');

          const qty = parseInt(it.qty) || 0;
          if (qty <= 0) throw new Error('Invalid qty for ' + p.name);

          need[p.id] = (need[p.id] || 0) + qty;
          if (Number(p.stock_qty) < need[p.id]) {
            throw new Error(`Not enough stock for ${p.name} (have ${p.stock_qty})`);
          }

          const list = round2(p.sale_price);
          let unit = (it.unit_price != null && it.unit_price !== '') ? round2(it.unit_price) : list;
          if (unit > list) unit = list;

          const floor = Number(p.discount_max) > 0 ? round2(list * (1 - Number(p.discount_max) / 100)) : 0;
          if (unit < floor) unit = floor;

          if (unit !== list) {
            overrides.push(`${p.name} ${unit}/${list}`);
          }

          const rate = (String(cfg.enable_vat) === '0') ? 0 : Number(p.vat_rate);
          const net = round2(unit * qty);
          const vat = round2(net * rate / 100);

          subtotal = round2(subtotal + net);
          vatTotal = round2(vatTotal + vat);

          lines.push({
            product_id: p.id, name: p.name, qty, unit_price: unit, unit_cost: round2(p.purchase_price),
            vat_rate: rate, vat_amount: vat, line_total: round2(net + vat)
          });
        }

        const gross = round2(subtotal + vatTotal);
        let discount = round2(d.discount);
        if (discount < 0) discount = 0;
        if (discount > gross) discount = gross;

        const total = round2(gross - discount);
        const vatPortion = gross > 0 ? round2(discount * vatTotal / gross) : 0;
        const vatNet = round2(vatTotal - vatPortion);

        const loyOn = String(cfg.loyalty_enabled == null ? '1' : cfg.loyalty_enabled) === '1';
        const earnPer = Number(cfg.loyalty_earn_per) || 0;
        const ptVal = Number(cfg.loyalty_point_value) || 0;

        let cust = null;
        if (d.customer_id) {
          const custDoc = await transaction.get(db.collection('customers').doc(String(d.customer_id)));
          if (custDoc.exists) cust = custDoc.data();
        }

        const reqPts = loyOn ? (parseInt(d.redeem_points) || 0) : 0;
        const reqCredit = round2(d.apply_store_credit);
        if ((reqPts > 0 || reqCredit > 0) && (!cust || cust.deleted)) {
          throw new Error('Select a customer to use points or store credit');
        }

        const ptBal = cust ? Number(cust.loyalty_points) || 0 : 0;
        const ptCap = ptVal > 0 ? Math.floor(total / ptVal) : 0;
        const redeemPts = Math.max(0, Math.min(reqPts, ptBal, ptCap));
        const redeemValue = round2(redeemPts * ptVal);
        const dueAfterPts = round2(total - redeemValue);

        const creditBal = cust ? Number(cust.store_credit) || 0 : 0;
        const creditApplied = round2(Math.min(reqCredit, creditBal, dueAfterPts));
        const dueAfterCredit = round2(dueAfterPts - creditApplied);

        const cashPaid = (d.amount_paid != null && d.amount_paid !== '') ? round2(d.amount_paid) : dueAfterCredit;
        const changeGiven = round2(Math.max(0, cashPaid - dueAfterCredit));
        const cashApplied = round2(cashPaid - changeGiven);
        const amountPaid = round2(redeemValue + creditApplied + cashApplied);
        const dueAmount = round2(Math.max(0, total - amountPaid));
        const payStatus = dueAmount <= 0 ? 'paid' : (amountPaid <= 0 ? 'unpaid' : 'partial');

        const earned = (cust && loyOn && earnPer > 0) ? Math.floor(round2(total - redeemValue) / earnPer) : 0;

        const saleId = await getNextId('sales');
        const invoice_no = (cfg.invoice_prefix || 'INV-') + padNo(saleId);
        const nowIso = new Date().toISOString();

        const saleRecord = {
          id: saleId, user_id: uid, customer_id: d.customer_id || null, subtotal,
          vat_amount: vatNet, vat_gross: vatTotal, net_amount: round2(total - vatNet),
          discount, total, amount_paid: amountPaid, change_given: changeGiven,
          due_amount: dueAmount, payment_status: payStatus, invoice_no,
          payment_method: d.payment_method || 'cash', notes: d.notes || '', receipt_printed: 0,
          points_earned: earned, points_redeemed: redeemPts, redeem_value: redeemValue, store_credit_applied: creditApplied,
          returned_total: 0, returned_vat: 0, returned_cogs_restocked: 0, return_status: 'none', items: lines,
          currency: d.currency || cfg.currency || '₹',
          currency_code: d.currency_code || cfg.currency_code || 'INR',
          currency_position: d.currency_position || cfg.currency_position || 'before',
          currency_decimals: d.currency_decimals != null ? d.currency_decimals : (cfg.currency_decimals != null ? cfg.currency_decimals : 2),
          created: nowIso, updated: nowIso, deleted: 0
        };

        // Write sale
        transaction.set(db.collection('sales').doc(String(saleId)), saleRecord);

        // Update Customer Loyalty and Credit
        if (cust) {
          transaction.update(db.collection('customers').doc(String(cust.id)), {
            loyalty_points: Math.max(0, ptBal - redeemPts + earned),
            store_credit: round2(creditBal - creditApplied),
            updated: nowIso
          });
        }

        // Decrement Product stock levels & write inventory movement
        for (const pid of Object.keys(need)) {
          const p = pm[pid];
          const newStock = Number(p.stock_qty) - need[pid];
          transaction.update(db.collection('products').doc(String(pid)), { stock_qty: newStock });

          const movementId = await getNextId('inventory_movements');
          transaction.set(db.collection('inventory_movements').doc(String(movementId)), {
            id: movementId, product_id: Number(pid), user_id: uid, movement_type: 'sale', qty_change: -need[pid], note: 'Sale #' + saleId, created: nowIso, updated: nowIso
          });
        }

        // Installment Creation
        if (d.create_installment_plan && dueAmount > 0 && cust) {
          const numInst = parseInt(d.installment_months) || 3;
          const instAmount = round2(dueAmount / numInst);
          let acc = 0;
          for (let k = 1; k <= numInst; k++) {
            const instId = await getNextId('installments');
            const amt = (k === numInst) ? round2(dueAmount - acc) : instAmount;
            acc = round2(acc + amt);
            
            // Add month calculator
            const due_date = ymd(new Date(Date.now() + k * 30 * 864e5));
            transaction.set(db.collection('installments').doc(String(instId)), {
              id: instId, sale_id: saleId, customer_id: cust.id, amount: amt, paid_amount: 0,
              due_date, status: 'pending', paid_date: '', created: nowIso, updated: nowIso, deleted: 0
            });
          }
        }

        return ok('Sale completed', { id: saleId, data: saleRecord });
      }).then(async (res) => {
        const cfgDoc = await db.collection('system').doc('settings').get();
        const cfg = cfgDoc.exists ? cfgDoc.data() : SETTINGS_DEFAULTS;
        const totalFmt = res.data.total;
        
        await logActivity(uid, 'sale', 'sales', res.id, `Sale ${totalFmt} (${lines.length} lines)`);
        return res;
      }).catch(err => {
        return { success: false, message: err.message };
      });
    },

    deleteSale: async (id, token) => {
      const uid = await gate(token, 'pos', 'd');
      if (!uid) return err('Access denied');

      const saleRef = db.collection('sales').doc(String(id));

      return db.runTransaction(async (transaction) => {
        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists || saleDoc.data().deleted) throw new Error('Sale not found');
        const s = saleDoc.data();

        if (s.return_status && s.return_status !== 'none') throw new Error('This sale has returns — void is blocked.');

        const settingsDoc = await transaction.get(db.collection('system').doc('settings'));
        const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;
        const vh = parseInt(cfg.void_window_hours || '24') || 24;
        
        if ((Date.now() - new Date(s.created).getTime()) / 36e5 > vh) {
          throw new Error('Void is only for same-day cancellation.');
        }

        // Return stock
        const productRefs = s.items.map(l => db.collection('products').doc(String(l.product_id)));
        const prodDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));
        const pm = {};
        prodDocs.forEach(d => { if (d.exists) pm[d.data().id] = d.data(); });

        for (const l of s.items) {
          const p = pm[l.product_id];
          if (p) {
            transaction.update(db.collection('products').doc(String(p.id)), { stock_qty: Number(p.stock_qty) + l.qty });
            
            const movementId = await getNextId('inventory_movements');
            transaction.set(db.collection('inventory_movements').doc(String(movementId)), {
              id: movementId, product_id: p.id, user_id: uid, movement_type: 'return', qty_change: l.qty, note: 'Void sale #' + id, created: new Date().toISOString(), updated: new Date().toISOString()
            });
          }
        }

        // Reverse loyalty + store credit
        if (s.customer_id) {
          const custRef = db.collection('customers').doc(String(s.customer_id));
          const custDoc = await transaction.get(custRef);
          if (custDoc.exists) {
            const c = custDoc.data();
            transaction.update(custRef, {
              loyalty_points: Math.max(0, (Number(c.loyalty_points) || 0) - Number(s.points_earned || 0) + Number(s.points_redeemed || 0)),
              store_credit: round2((Number(c.store_credit) || 0) + Number(s.store_credit_applied || 0)),
              updated: new Date().toISOString()
            });
          }
        }

        transaction.update(saleRef, { deleted: 1, updated: new Date().toISOString() });
        return ok('Sale voided & stock restored');
      }).then(async (res) => {
        await logActivity(uid, 'deletion', 'sales', id, 'Voided sale #' + id);
        return res;
      }).catch(err => {
        return { success: false, message: err.message };
      });
    },

    markReceiptPrinted: async (id, token) => {
      const uid = await gate(token, 'pos', 'v');
      if (!uid) return err('Access denied');
      await db.collection('sales').doc(String(id)).update({ receipt_printed: 1, updated: new Date().toISOString() });
      await logActivity(uid, 'print', 'sales', id, 'Printed receipt/invoice for sale #' + id);
      return ok('Marked');
    },

    // ---- Returns / Refunds ----
    getReturns: async (token, from, to) => {
      const uid = await gate(token, 'pos', 'v');
      if (!uid) return err('Access denied');

      const snapshot = await db.collection('returns').get();
      const cm = await resolveCustomerNames();
      const um = await resolveUserNames();

      const data = [];
      snapshot.forEach(doc => {
        const r = doc.data();
        if (r.deleted) return;
        const date = r.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        r.customer_name = r.customer_id ? (cm[r.customer_id] || '—') : 'Walk-in';
        r.staff_name = um[r.user_id] || '—';
        data.push(r);
      });

      data.sort((a, b) => b.id - a.id);
      return ok('', { data });
    },

    createReturn: async (saleId, payload, token) => {
      const uid = await gate(token, 'pos', 'e');
      if (!uid) return err('Access denied');

      payload = payload || {};
      const items = payload.items || [];
      const method = payload.refund_method || 'cash';
      const restock = payload.restock ? 1 : 0;
      
      if (!items.length) return err('Select at least one item to return');
      if (['cash','card','bank_transfer','store_credit'].indexOf(method) === -1) return err('Invalid refund method');

      const saleRef = db.collection('sales').doc(String(saleId));

      return db.runTransaction(async (transaction) => {
        const settingsDoc = await transaction.get(db.collection('system').doc('settings'));
        const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;

        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists) throw new Error('Sale not found');
        
        const sale = saleDoc.data();
        if (sale.deleted) throw new Error('This sale was voided — returns do not apply');
        if (sale.return_status === 'full') throw new Error('Sale already fully returned');
        if (method === 'store_credit' && !sale.customer_id) throw new Error('Store credit needs a customer on the sale');

        const lineOf = {};
        (sale.items || []).forEach(l => { lineOf[l.product_id] = l; });

        const gross = round2(Number(sale.subtotal) + Number(sale.vat_gross));
        const D = Number(sale.discount) || 0;
        let rSub = 0;
        let rVatGross = 0;
        let returnedCogs = 0;
        const rLines = [];
        const touched = {};

        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const L = lineOf[it.product_id];
          if (!L) throw new Error('Item not in this sale');

          const q = parseInt(it.qty) || 0;
          if (q <= 0) continue;

          const remaining = Number(L.qty) - Number(L.returned_qty || 0);
          if (q > remaining) throw new Error(`Cannot return ${q} of ${L.name} — only ${remaining} left`);

          const net = round2(L.unit_price * q);
          const vat = round2(net * Number(L.vat_rate) / 100);
          const cogs = round2(Number(L.unit_cost) * q);

          rSub = round2(rSub + net);
          rVatGross = round2(rVatGross + vat);
          returnedCogs = round2(returnedCogs + cogs);

          rLines.push({
            product_id: L.product_id, name: L.name, qty: q, unit_price: L.unit_price, unit_cost: Number(L.unit_cost),
            vat_rate: Number(L.vat_rate), _net: net, _vat: vat, _gross: round2(net + vat)
          });
          touched[L.product_id] = q;
        }

        if (!rLines.length) throw new Error('Nothing to return');

        const rGross = round2(rSub + rVatGross);
        const discountShare = gross > 0 ? round2(D * rGross / gross) : 0;
        const refundVatPortion = rGross > 0 ? round2(discountShare * rVatGross / rGross) : 0;
        let refundVat = round2(rVatGross - refundVatPortion);
        let refundTotal = round2(rGross - discountShare);

        const fully = (sale.items || []).every(l => {
          return Number(l.returned_qty || 0) + (touched[l.product_id] || 0) >= Number(l.qty);
        });

        if (fully) {
          refundTotal = round2(Number(sale.total) - Number(sale.returned_total || 0));
          refundVat = round2(Number(sale.vat_amount) - Number(sale.returned_vat || 0));
        }

        const refundSub = round2(refundTotal - refundVat);
        let acc = 0;
        rLines.forEach((l, idx) => {
          l.refund_total = (idx === rLines.length - 1) ? round2(refundTotal - acc) : round2(refundTotal * l._gross / rGross);
          acc = round2(acc + l.refund_total);
          l.refund_vat = round2(l._vat * (refundVat / (rVatGross || 1)));
          l.refund_net = round2(l.refund_total - l.refund_vat);
          l.restocked = restock;
          delete l._net; delete l._vat; delete l._gross;
        });

        const due = Number(sale.due_amount) || 0;
        const dueApplied = round2(Math.min(refundTotal, due));
        const cashOut = round2(refundTotal - dueApplied);
        const newDue = round2(due - dueApplied);
        const newPaid = Number(sale.amount_paid) || 0;
        const payStatus = newDue <= 0 ? 'paid' : (newPaid <= 0 ? 'unpaid' : 'partial');

        const nowIso = new Date().toISOString();

        // Restock products
        if (restock) {
          for (const pid of Object.keys(touched)) {
            const pRef = db.collection('products').doc(String(pid));
            const pDoc = await transaction.get(pRef);
            if (pDoc.exists) {
              const p = pDoc.data();
              transaction.update(pRef, { stock_qty: Number(p.stock_qty) + touched[pid] });
              
              const movementId = await getNextId('inventory_movements');
              transaction.set(db.collection('inventory_movements').doc(String(movementId)), {
                id: movementId, product_id: Number(pid), user_id: uid, movement_type: 'return', qty_change: touched[pid], note: 'Return on sale #' + saleId, created: nowIso, updated: nowIso
              });
            }
          }
        }

        const returnId = await getNextId('returns');
        const return_no = (cfg.return_prefix || 'RET-') + padNo(returnId);
        
        const returnRecord = {
          id: returnId, sale_id: saleId, invoice_no: sale.invoice_no, customer_id: sale.customer_id || null, user_id: uid,
          reason: String(payload.reason || ''), refund_method: method, restock, items: rLines,
          refund_subtotal: refundSub, refund_vat: refundVat, refund_total: refundTotal, returned_cogs: returnedCogs,
          discount_share: discountShare, due_applied: dueApplied, cash_refunded: cashOut, return_no,
          created: nowIso, updated: nowIso, deleted: 0
        };

        transaction.set(db.collection('returns').doc(String(returnId)), returnRecord);

        // Store credit update
        if (method === 'store_credit' && sale.customer_id) {
          const custRef = db.collection('customers').doc(String(sale.customer_id));
          const custDoc = await transaction.get(custRef);
          if (custDoc.exists) {
            transaction.update(custRef, {
              store_credit: round2(Number(custDoc.data().store_credit || 0) + cashOut),
              updated: nowIso
            });
          }
        }

        // Update items in original sale
        const newItems = (sale.items || []).map(l => {
          const add = touched[l.product_id] || 0;
          return add ? Object.assign({}, l, { returned_qty: Number(l.returned_qty || 0) + add }) : l;
        });
        const fullyReturned = newItems.every(l => Number(l.returned_qty || 0) >= Number(l.qty));
        const anyReturned = newItems.some(l => Number(l.returned_qty || 0) > 0);

        transaction.update(saleRef, {
          items: newItems,
          returned_total: round2(Number(sale.returned_total || 0) + refundTotal),
          returned_vat: round2(Number(sale.returned_vat || 0) + refundVat),
          returned_cogs_restocked: round2(Number(sale.returned_cogs_restocked || 0) + (restock ? returnedCogs : 0)),
          return_status: fullyReturned ? 'full' : (anyReturned ? 'partial' : 'none'),
          due_amount: newDue, payment_status: payStatus,
          updated: nowIso
        });

        return { id: returnId, data: returnRecord, refund_total: refundTotal, cash_refunded: cashOut };
      }).then(async (res) => {
        await logActivity(uid, 'return', 'returns', res.id, `Refund ${res.cash_refunded} on sale #${saleId}`);
        return ok('Refund processed', res);
      }).catch(err => {
        return { success: false, message: err.message };
      });
    },

    // ---- Payments ----
    recordSalePayment: async (saleId, amount, method, token) => {
      const uid = await gate(token, 'pos', 'e');
      if (!uid) return err('Access denied');

      const saleRef = db.collection('sales').doc(String(saleId));

      return db.runTransaction(async (transaction) => {
        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists || saleDoc.data().deleted) throw new Error('Sale not found');
        
        const s = saleDoc.data();
        const due = round2(s.due_amount);
        if (due <= 0) throw new Error('Already settled');

        let amt = round2(amount);
        if (!(amt > 0)) throw new Error('Enter a valid amount');
        amt = round2(Math.min(amt, due));

        if (method === 'store_credit') {
          if (!s.customer_id) throw new Error('No customer on this sale for store credit');
          const custRef = db.collection('customers').doc(String(s.customer_id));
          const custDoc = await transaction.get(custRef);
          if (!custDoc.exists) throw new Error('Customer not found');
          
          const c = custDoc.data();
          const cap = round2(Math.min(amt, Number(c.store_credit || 0)));
          if (cap <= 0) throw new Error('No store credit available');
          amt = cap;
          transaction.update(custRef, { store_credit: round2((Number(c.store_credit) || 0) - amt), updated: new Date().toISOString() });
        }

        const newPaid = round2(Number(s.amount_paid) + amt);
        const newDue = round2(Math.max(0, Number(s.total) - newPaid));
        
        transaction.update(saleRef, {
          amount_paid: newPaid, due_amount: newDue, payment_status: newDue <= 0 ? 'paid' : (newPaid <= 0 ? 'unpaid' : 'partial'), updated: new Date().toISOString()
        });

        const paymentId = await getNextId('payments');
        const nowIso = new Date().toISOString();
        transaction.set(db.collection('payments').doc(String(paymentId)), {
          id: paymentId, customer_id: s.customer_id || null, ref_type: 'sale', ref_id: s.id, amount: amt, method, note: '', user_id: uid, created: nowIso, updated: nowIso, deleted: 0
        });

        // Reconcile installments
        const instSnap = await transaction.get(db.collection('installments').where('sale_id', '==', Number(saleId)).where('status', '==', 'pending'));
        const pend = [];
        instSnap.forEach(d => { if (!d.data().deleted) pend.push(d.data()); });
        pend.sort((a, b) => a.due_date.localeCompare(b.due_date));

        let gap = amt;
        for (const r of pend) {
          if (gap <= 0) break;
          const room = round2(Number(r.amount) - Number(r.paid_amount || 0));
          const apply = round2(Math.min(room, gap));
          if (apply <= 0) continue;
          gap = round2(gap - apply);
          const newInstPaid = round2(Number(r.paid_amount || 0) + apply);
          const status = newInstPaid >= round2(r.amount) ? 'paid' : 'pending';
          transaction.update(db.collection('installments').doc(String(r.id)), {
            paid_amount: newInstPaid, status, paid_date: status === 'paid' ? ymd(new Date()) : (r.paid_date || ''), updated: nowIso
          });
        }

        return { due: newDue, amt };
      }).then(async (res) => {
        await logActivity(uid, 'payment', 'payments', saleId, `Sale #${saleId} payment ${res.amt} (${method})`);
        return ok('Payment recorded', { due: res.due });
      }).catch(err => {
        return { success: false, message: err.message };
      });
    },

    recordRepairPayment: async (repairId, amount, method, token) => {
      const uid = await gate(token, 'repairs', 'e');
      if (!uid) return err('Access denied');

      const repairRef = db.collection('repairs').doc(String(repairId));

      return db.runTransaction(async (transaction) => {
        const repairDoc = await transaction.get(repairRef);
        if (!repairDoc.exists || repairDoc.data().deleted) throw new Error('Repair not found');
        
        const r = repairDoc.data();
        const remaining = round2(r.remaining_amount);
        if (remaining <= 0) throw new Error('Already settled');

        let amt = round2(amount);
        if (!(amt > 0)) throw new Error('Enter a valid amount');
        amt = round2(Math.min(amt, remaining));

        if (method === 'store_credit') {
          if (!r.customer_id) throw new Error('No customer on this repair for store credit');
          const custRef = db.collection('customers').doc(String(r.customer_id));
          const custDoc = await transaction.get(custRef);
          if (!custDoc.exists) throw new Error('Customer not found');
          
          const c = custDoc.data();
          const cap = round2(Math.min(amt, Number(c.store_credit || 0)));
          if (cap <= 0) throw new Error('No store credit available');
          amt = cap;
          transaction.update(custRef, { store_credit: round2((Number(c.store_credit) || 0) - amt), updated: new Date().toISOString() });
        }

        const newPaid = round2(Number(r.paid_amount) + amt);
        const newRemaining = round2(Math.max(0, Number(r.total_cost) - newPaid));
        
        transaction.update(repairRef, { paid_amount: newPaid, remaining_amount: newRemaining, updated: new Date().toISOString() });

        const paymentId = await getNextId('payments');
        const nowIso = new Date().toISOString();
        transaction.set(db.collection('payments').doc(String(paymentId)), {
          id: paymentId, customer_id: r.customer_id || null, ref_type: 'repair', ref_id: repairId, amount: amt, method, note: '', user_id: uid, created: nowIso, updated: nowIso, deleted: 0
        });

        return { remaining: newRemaining, amt };
      }).then(async (res) => {
        await logActivity(uid, 'payment', 'payments', repairId, `Repair #${repairId} payment ${res.amt} (${method})`);
        return ok('Payment recorded', { remaining: res.remaining });
      }).catch(err => {
        return { success: false, message: err.message };
      });
    },

    getCustomerLedger: async (customerId, token) => {
      const uid = await gate(token, 'customers', 'v');
      if (!uid) return err('Access denied');

      const cDoc = await db.collection('customers').doc(String(customerId)).get();
      if (!cDoc.exists || cDoc.data().deleted) return err('Customer not found');
      const c = cDoc.data();

      const salesSnap = await db.collection('sales').where('customer_id', '==', Number(customerId)).get();
      const repairsSnap = await db.collection('repairs').where('customer_id', '==', Number(customerId)).get();
      const paymentsSnap = await db.collection('payments').where('customer_id', '==', Number(customerId)).get();
      const um = await resolveUserNames();

      const unpaidSales = [];
      salesSnap.forEach(d => {
        const s = d.data();
        if (!s.deleted && Number(s.due_amount) > 0) {
          unpaidSales.push({ id: s.id, invoice_no: s.invoice_no, total: round2(s.total), amount_paid: round2(s.amount_paid), due_amount: round2(s.due_amount), payment_status: s.payment_status, created: s.created });
        }
      });

      const unpaidRepairs = [];
      repairsSnap.forEach(d => {
        const r = d.data();
        if (!r.deleted && Number(r.remaining_amount) > 0) {
          unpaidRepairs.push({ id: r.id, ticket_no: r.ticket_no, device_name: r.device_name, total_cost: round2(r.total_cost), paid_amount: round2(r.paid_amount), remaining_amount: round2(r.remaining_amount), status: r.status });
        }
      });

      const payments = [];
      paymentsSnap.forEach(d => {
        const p = d.data();
        if (!p.deleted) {
          p.user_name = um[p.user_id] || '—';
          payments.push(p);
        }
      });
      payments.sort((a, b) => b.id - a.id);

      const outstanding = round2(unpaidSales.reduce((a, s) => a + Number(s.due_amount), 0) + unpaidRepairs.reduce((a, r) => a + Number(r.remaining_amount), 0));
      return ok('', { data: {
        customer: { id: c.id, name: c.name, phone: c.phone, loyalty_points: Number(c.loyalty_points) || 0, store_credit: round2(c.store_credit), credit_limit: round2(c.credit_limit) },
        outstanding, unpaidSales, unpaidRepairs, payments
      } });
    },

    adjustStoreCredit: async (customerId, delta, reason, token) => {
      const uid = await gate(token, 'customers', 'e');
      if (!uid) return err('Access denied');

      const custRef = db.collection('customers').doc(String(customerId));
      const custDoc = await custRef.get();
      if (!custDoc.exists || custDoc.data().deleted) return err('Customer not found');

      const dl = round2(delta);
      if (!dl) return err('Enter a non-zero amount');

      const c = custDoc.data();
      let bal = round2(Number(c.store_credit || 0) + dl);
      if (bal < 0) bal = 0;

      await custRef.update({ store_credit: bal, updated: new Date().toISOString() });
      await logActivity(uid, 'store_credit_adjust', 'customers', customerId, `Store credit ${dl > 0 ? '+' : ''}${dl} (${reason || ''})`);
      return ok('Store credit updated', { store_credit: bal });
    },

    getCustomer360: async (customerId, token) => {
      const uid = await gate(token, 'customers', 'v');
      if (!uid) return err('Access denied');

      const cDoc = await db.collection('customers').doc(String(customerId)).get();
      if (!cDoc.exists || cDoc.data().deleted) return err('Customer not found');
      const c = cDoc.data();

      const um = await resolveUserNames();

      // Fetch sales
      const salesSnap = await db.collection('sales').where('customer_id', '==', Number(customerId)).get();
      const sales = [];
      salesSnap.forEach(d => {
        const s = d.data();
        if (s.deleted) return;
        sales.push({
          id: s.id, invoice_no: s.invoice_no, created: s.created,
          total: round2(s.total), amount_paid: round2(s.amount_paid), due_amount: round2(s.due_amount),
          payment_status: s.payment_status, payment_method: s.payment_method, return_status: s.return_status, items: (s.items || []),
          currency: s.currency || '₹',
          currency_code: s.currency_code || 'INR',
          currency_position: s.currency_position || 'before',
          currency_decimals: s.currency_decimals != null ? s.currency_decimals : 2
        });
      });
      sales.sort((a, b) => b.id - a.id);

      // Fetch repairs
      const repairsSnap = await db.collection('repairs').where('customer_id', '==', Number(customerId)).get();
      const repairs = [];
      repairsSnap.forEach(d => {
        const r = d.data();
        if (r.deleted) return;
        repairs.push({
          id: r.id, ticket_no: r.ticket_no, device_name: r.device_name,
          created: r.created, total_cost: round2(r.total_cost), paid_amount: round2(r.paid_amount),
          remaining_amount: round2(r.remaining_amount), status: r.status, tech_name: um[r.assigned_user_id] || '-'
        });
      });
      repairs.sort((a, b) => b.id - a.id);

      // Fetch used phones
      const usedSnap = await db.collection('used_phones').where('customer_id', '==', Number(customerId)).get();
      const used = [];
      usedSnap.forEach(d => {
        const u = d.data();
        if (u.deleted) return;
        used.push({
          id: u.id, device_name: u.device_name, imei: u.imei, created: u.created,
          purchase_price: round2(u.purchase_price), status: u.status
        });
      });
      used.sort((a, b) => b.id - a.id);

      // Fetch payments
      const paymentsSnap = await db.collection('payments').where('customer_id', '==', Number(customerId)).get();
      const payments = [];
      paymentsSnap.forEach(d => {
        const p = d.data();
        if (p.deleted) return;
        p.user_name = um[p.user_id] || '-';
        payments.push(p);
      });
      payments.sort((a, b) => b.id - a.id);

      const totalInvoiced = round2(sales.reduce((sum, s) => sum + Number(s.total), 0));
      const totalPaid = round2(
        sales.reduce((sum, s) => sum + Number(s.amount_paid), 0) +
        repairs.reduce((sum, r) => sum + Number(r.paid_amount), 0)
      );
      const outstanding = round2(
        sales.reduce((sum, s) => sum + Number(s.due_amount), 0) +
        repairs.reduce((sum, r) => sum + Number(r.remaining_amount), 0)
      );

      const dates = [c.created]
        .concat(sales.map(s => s.created))
        .concat(repairs.map(r => r.created))
        .concat(used.map(u => u.created))
        .filter(Boolean);
      dates.sort();
      const lastActivity = dates.pop() || c.created;

      return ok('', { data: {
        customer: {
          id: c.id, name: c.name, phone: c.phone, email: c.email, company: c.company,
          city: c.city, country: c.country, address: c.address, customer_type: c.customer_type,
          credit_limit: round2(c.credit_limit), loyalty_points: Number(c.loyalty_points) || 0,
          store_credit: round2(c.store_credit), status: c.status, created: c.created, notes: c.notes
        },
        sales, repairs, used, payments,
        kpi: { totalInvoiced, totalPaid, outstanding, orders: sales.length, repairs: repairs.length, used: used.length, lastActivity }
      } });
    },

    // ---- Activity Logs ----
    getLogs: async (token) => {
      const uid = await gate(token, 'logs', 'v');
      if (!uid) return err('Access denied');

      const snapshot = await db.collection('activity_logs').get();
      const users = await resolveUserNames();
      
      const data = [];
      snapshot.forEach(doc => {
        const l = doc.data();
        l.user_name = users[l.user_id] || 'System';
        data.push(l);
      });
      data.sort((a, b) => b.id - a.id);
      return ok('', { data });
    },

    clearLogs: async (token) => {
      const uid = await gate(token, 'logs', 'd');
      if (!uid) return err('Access denied');

      const snapshot = await db.collection('activity_logs').get();
      const batch = db.batch();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      await logActivity(uid, 'clear_logs', 'activity_logs', '', 'Cleared all activity logs');
      return ok('Logs cleared');
    },

    getUserActivity: async (targetId, token) => {
      const uid = await gate(token, 'users', 'v');
      if (!uid) return err('Access denied');

      const snapshot = await db.collection('activity_logs').where('user_id', '==', Number(targetId)).get();
      const data = [];
      snapshot.forEach(doc => {
        data.push(doc.data());
      });
      data.sort((a, b) => b.id - a.id);
      return ok('', { data: data.slice(0, 50) });
    },

    // ---- Expenses ----
    getExpenses: async (token, from, to) => {
      const uid = await gate(token, 'expenses', 'v');
      if (!uid) return err('Access denied');

      const snapshot = await db.collection('expenses').get();
      const users = await resolveUserNames();

      const data = [];
      snapshot.forEach(doc => {
        const e = doc.data();
        if (e.deleted) return;
        const date = e.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        e.staff_name = users[e.user_id] || '—';
        data.push(e);
      });
      data.sort((a, b) => b.id - a.id);
      return ok('', { data });
    },

    addExpense: async (d, token) => {
      const uid = await gate(token, 'expenses', 'a');
      if (!uid) return err('Access denied');
      if (!d.amount || !d.category) return err('Amount & category required');

      const id = await getNextId('expenses');
      const record = {
        id, amount: round2(d.amount), category: d.category, note: d.note || '',
        user_id: uid, created: new Date().toISOString(), updated: new Date().toISOString(), deleted: 0
      };

      await db.collection('expenses').doc(String(id)).set(record);
      await logActivity(uid, 'expense_add', 'expenses', id, `Added expense: ${record.amount} (${record.category})`);
      return ok('Expense added', { id });
    },

    updateExpense: async (id, d, token) => {
      const uid = await gate(token, 'expenses', 'e');
      if (!uid) return err('Access denied');

      const expRef = db.collection('expenses').doc(String(id));
      const doc = await expRef.get();
      if (!doc.exists || doc.data().deleted) return err('Expense not found');

      const updateData = {
        amount: round2(d.amount),
        category: d.category,
        note: d.note || '',
        updated: new Date().toISOString()
      };

      await expRef.update(updateData);
      await logActivity(uid, 'expense_edit', 'expenses', id, `Updated expense: ${d.amount} (${d.category})`);
      return ok('Expense updated');
    },

    deleteExpense: async (id, token) => {
      const uid = await gate(token, 'expenses', 'd');
      if (!uid) return err('Access denied');
      await db.collection('expenses').doc(String(id)).update({ deleted: 1, updated: new Date().toISOString() });
      await logActivity(uid, 'deletion', 'expenses', id, 'Deleted expense');
      return ok('Expense deleted');
    },

    // ---- Repairs ----
    getRepairs: async (token, from, to) => {
      const uid = await gate(token, 'repairs', 'v');
      if (!uid) return err('Access denied');

      const snapshot = await db.collection('repairs').get();
      const cm = await resolveCustomerNames();
      const um = await resolveUserNames();

      const data = [];
      snapshot.forEach(doc => {
        const r = doc.data();
        if (r.deleted) return;
        const date = r.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        r.customer_name = r.customer_id ? (cm[r.customer_id] || '—') : 'Walk-in';
        r.technician_name = um[r.technician_id] || '—';
        data.push(r);
      });

      data.sort((a, b) => b.id - a.id);
      return ok('', { data });
    },

    createRepair: async (d, token) => {
      const uid = await gate(token, 'repairs', 'a');
      if (!uid) return err('Access denied');
      if (!d.device_name || !d.customer_id) return err('Device & customer required');

      const id = await getNextId('repairs');
      const settingsDoc = await db.collection('system').doc('settings').get();
      const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;
      
      const ticket_no = (cfg.repair_prefix || 'RPR-') + padNo(id);
      const total = round2(d.total_cost);
      const paid = round2(d.amount_paid);
      const remaining = round2(Math.max(0, total - paid));
      
      const nowIso = new Date().toISOString();
      const record = {
        id, ticket_no, customer_id: Number(d.customer_id), device_name: d.device_name,
        serial_no: d.serial_no || '', problem_description: d.problem_description || '',
        status: d.status || 'in_repair', estimate_cost: round2(d.estimate_cost),
        parts_cost: round2(d.parts_cost), total_cost: total, paid_amount: paid, remaining_amount: remaining,
        technician_id: Number(d.technician_id) || uid, notes: d.notes || '',
        whatsapp_sent: 0, receipt_printed: 0,
        created: nowIso, updated: nowIso, deleted: 0
      };

      await db.collection('repairs').doc(String(id)).set(record);
      
      if (paid > 0) {
        const paymentId = await getNextId('payments');
        await db.collection('payments').doc(String(paymentId)).set({
          id: paymentId, customer_id: record.customer_id, ref_type: 'repair', ref_id: id, amount: paid, method: 'cash', note: 'Initial deposit', user_id: uid, created: nowIso, updated: nowIso, deleted: 0
        });
      }

      await logActivity(uid, 'repair_add', 'repairs', id, `Created repair job ${ticket_no} (${d.device_name})`);
      return ok('Repair created', { id, ticket_no });
    },

    updateRepair: async (id, d, token) => {
      const uid = await gate(token, 'repairs', 'e');
      if (!uid) return err('Access denied');

      const repRef = db.collection('repairs').doc(String(id));
      const doc = await repRef.get();
      if (!doc.exists || doc.data().deleted) return err('Repair not found');

      const current = doc.data();
      const total = round2(d.total_cost);
      
      // Keep track of new payments separately, just reconcile remaining amount
      const remaining = round2(Math.max(0, total - Number(current.paid_amount)));

      const updateData = {
        device_name: d.device_name,
        serial_no: d.serial_no || '',
        problem_description: d.problem_description || '',
        status: d.status || 'in_repair',
        estimate_cost: round2(d.estimate_cost),
        parts_cost: round2(d.parts_cost),
        total_cost: total,
        remaining_amount: remaining,
        technician_id: Number(d.technician_id) || uid,
        notes: d.notes || '',
        updated: new Date().toISOString()
      };

      await repRef.update(updateData);
      await logActivity(uid, 'repair_edit', 'repairs', id, `Updated repair job ${current.ticket_no}`);
      return ok('Repair updated');
    },

    deleteRepair: async (id, token) => {
      const uid = await gate(token, 'repairs', 'd');
      if (!uid) return err('Access denied');
      await db.collection('repairs').doc(String(id)).update({ deleted: 1, updated: new Date().toISOString() });
      await logActivity(uid, 'deletion', 'repairs', id, 'Deleted repair job');
      return ok('Repair deleted');
    },

    markRepairWhatsapp: async (id, token) => {
      const uid = await gate(token, 'repairs', 'v');
      if (!uid) return err('Access denied');
      await db.collection('repairs').doc(String(id)).update({ whatsapp_sent: 1, updated: new Date().toISOString() });
      return ok('Marked sent');
    },

    markRepairReceipt: async (id, token) => {
      const uid = await gate(token, 'repairs', 'v');
      if (!uid) return err('Access denied');
      await db.collection('repairs').doc(String(id)).update({ receipt_printed: 1, updated: new Date().toISOString() });
      await logActivity(uid, 'print', 'repairs', id, 'Printed job ticket #' + id);
      return ok('Marked');
    },

    getRepairWaLink: async (id, token) => {
      const uid = await gate(token, 'repairs', 'v');
      if (!uid) return err('Access denied');

      const repDoc = await db.collection('repairs').doc(String(id)).get();
      if (!repDoc.exists) return err('Repair not found');
      
      const r = repDoc.data();
      const custDoc = await db.collection('customers').doc(String(r.customer_id)).get();
      if (!custDoc.exists) return err('Customer not found');

      const cfgDoc = await db.collection('system').doc('settings').get();
      const cfg = cfgDoc.exists ? cfgDoc.data() : SETTINGS_DEFAULTS;

      const c = custDoc.data();
      let msg = cfg.wa_template || '';
      msg = msg.replace('{name}', c.name)
               .replace('{device}', r.device_name)
               .replace('{currency}', cfg.currency || '€')
               .replace('{remaining}', r.remaining_amount)
               .replace('{shop}', cfg.shop_name);

      const link = `https://api.whatsapp.com/send?phone=${c.phone.replace(/[^0-9]/g, '')}&text=${encodeURIComponent(msg)}`;
      return ok('', { link });
    },

    getRepairTrackLink: async (id, token) => {
      const uid = await gate(token, 'repairs', 'v');
      if (!uid) return err('Access denied');

      const settingsDoc = await db.collection('system').doc('settings').get();
      const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;

      // Netlify deployment URL acts as host
      const host = window.location.origin + window.location.pathname;
      const link = `${host}?track=${id}&t=pub_tok_${id}`;
      return ok('', { link });
    },

    getRepairPublicStatus: async (id, token) => {
      // Direct public read, bypass auth gate
      const doc = await db.collection('repairs').doc(String(id)).get();
      if (!doc.exists || doc.data().deleted) return err('Not found');
      const r = doc.data();

      const settingsDoc = await db.collection('system').doc('settings').get();
      const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;

      return ok('', {
        ticket_no: r.ticket_no,
        device_name: r.device_name,
        status: r.status,
        total_cost: r.total_cost,
        remaining_amount: r.remaining_amount,
        created: r.created,
        shop: {
          name: cfg.shop_name,
          phone: cfg.shop_phone,
          tagline: cfg.shop_tagline,
          logo: cfg.shop_logo
        }
      });
    },

    // ---- Buy Used Phones ----
    getUsedPhones: async (token, from, to) => {
      const uid = await gate(token, 'used_phones', 'v');
      if (!uid) return err('Access denied');

      const snapshot = await db.collection('used_phones').get();
      const um = await resolveUserNames();

      const data = [];
      snapshot.forEach(doc => {
        const u = doc.data();
        if (u.deleted) return;
        const date = u.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        u.staff_name = um[u.user_id] || '—';
        data.push(u);
      });

      data.sort((a, b) => b.id - a.id);
      return ok('', { data });
    },

    addUsedPhone: async (d, token) => {
      const uid = await gate(token, 'used_phones', 'a');
      if (!uid) return err('Access denied');
      if (!d.imei || !d.purchase_price) return err('IMEI & price required');

      // Check IMEI duplicate
      const dupSnap = await db.collection('used_phones').where('imei', '==', d.imei).get();
      let hasDup = false;
      dupSnap.forEach(doc => { if (!doc.data().deleted) hasDup = true; });
      if (hasDup) return err('IMEI already exists');

      const id = await getNextId('used_phones');
      const settingsDoc = await db.collection('system').doc('settings').get();
      const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;
      
      const record = {
        id, imei: d.imei, brand: d.brand || '', model: d.model || '', storage: d.storage || '',
        ram: d.ram || '', screen_grade: d.screen_grade || 'A', battery_grade: d.battery_grade || 'A',
        body_grade: d.body_grade || 'A', seller_name: d.seller_name || '', seller_phone: d.seller_phone || '',
        seller_id_type: d.seller_id_type || 'CNIC', seller_id_no: d.seller_id_no || '', seller_id_image: d.seller_id_image || '',
        purchase_price: round2(d.purchase_price), suggested_resale: round2(d.suggested_resale),
        deviation_note: d.deviation_note || '', notes: d.notes || '', contract_printed: 0,
        user_id: uid, created: new Date().toISOString(), updated: new Date().toISOString(), deleted: 0
      };

      await db.collection('used_phones').doc(String(id)).set(record);
      await logActivity(uid, 'used_phone_purchase', 'used_phones', id, `Purchased used phone ${d.brand} ${d.model} (IMEI: ${d.imei})`);
      return ok('Phone registered', { id });
    },

    updateUsedPhone: async (id, d, token) => {
      const uid = await gate(token, 'used_phones', 'e');
      if (!uid) return err('Access denied');

      const phoneRef = db.collection('used_phones').doc(String(id));
      const doc = await phoneRef.get();
      if (!doc.exists || doc.data().deleted) return err('Record not found');

      // Check IMEI duplicate
      const dupSnap = await db.collection('used_phones').where('imei', '==', d.imei).get();
      let hasDup = false;
      dupSnap.forEach(doc => { if (!doc.data().deleted && doc.data().id !== Number(id)) hasDup = true; });
      if (hasDup) return err('IMEI already exists');

      const updateData = {
        imei: d.imei, brand: d.brand || '', model: d.model || '', storage: d.storage || '',
        ram: d.ram || '', screen_grade: d.screen_grade || 'A', battery_grade: d.battery_grade || 'A',
        body_grade: d.body_grade || 'A', seller_name: d.seller_name || '', seller_phone: d.seller_phone || '',
        seller_id_type: d.seller_id_type || 'CNIC', seller_id_no: d.seller_id_no || '', seller_id_image: d.seller_id_image || '',
        purchase_price: round2(d.purchase_price), suggested_resale: round2(d.suggested_resale),
        deviation_note: d.deviation_note || '', notes: d.notes || '',
        updated: new Date().toISOString()
      };

      await phoneRef.update(updateData);
      await logActivity(uid, 'used_phone_edit', 'used_phones', id, `Updated used phone IMEI: ${d.imei}`);
      return ok('Phone updated');
    },

    deleteUsedPhone: async (id, token) => {
      const uid = await gate(token, 'used_phones', 'd');
      if (!uid) return err('Access denied');
      await db.collection('used_phones').doc(String(id)).update({ deleted: 1, updated: new Date().toISOString() });
      await logActivity(uid, 'deletion', 'used_phones', id, 'Deleted used phone purchase');
      return ok('Record deleted');
    },

    markUsedPhoneContract: async (id, token) => {
      const uid = await gate(token, 'used_phones', 'v');
      if (!uid) return err('Access denied');
      await db.collection('used_phones').doc(String(id)).update({ contract_printed: 1, updated: new Date().toISOString() });
      await logActivity(uid, 'print', 'used_phones', id, 'Printed purchase contract #' + id);
      return ok('Marked');
    },

    getImeiHistory: async (imei, token) => {
      const uid = await gate(token, 'imei_lookup', 'v');
      if (!uid) return err('Access denied');

      const salesSnap = await db.collection('sales').get();
      const repairsSnap = await db.collection('repairs').get();
      const usedSnap = await db.collection('used_phones').where('imei', '==', imei).get();

      const hits = [];

      // 1. Used phone purchase
      usedSnap.forEach(d => {
        const u = d.data();
        if (!u.deleted) {
          hits.push({ date: u.created, type: 'Used Purchase', ref: '#' + u.id, detail: `Bought from ${u.seller_name} for €${u.purchase_price}` });
        }
      });

      // 2. POS Sales
      salesSnap.forEach(d => {
        const s = d.data();
        if (s.deleted) return;
        (s.items || []).forEach(item => {
          // simple regex check inside item notes or description for IMEI matching
          if (s.notes.indexOf(imei) !== -1 || item.name.indexOf(imei) !== -1) {
            hits.push({ date: s.created, type: 'Sale', ref: s.invoice_no, detail: `Sold to Customer for €${s.total}` });
          }
        });
      });

      // 3. Repairs
      repairsSnap.forEach(d => {
        const r = d.data();
        if (r.deleted) return;
        if (r.serial_no === imei) {
          hits.push({ date: r.created, type: 'Repair', ref: r.ticket_no, detail: `${r.device_name} — status: ${r.status}, cost: €${r.total_cost}` });
        }
      });

      hits.sort((a, b) => b.date.localeCompare(a.date));
      return ok('', { data: hits });
    },

    // ---- Cash Drawer / Shift ----
    getCashDrawerStatus: async (token) => {
      const uid = await gate(token, 'cash_drawer', 'v');
      if (!uid) return err('Access denied');

      const cdSnap = await db.collection('cash_drawer').where('status', '==', 'open').get();
      let openShift = null;
      cdSnap.forEach(d => { if (!d.data().deleted) openShift = d.data(); });
      
      if (!openShift) return ok('', { data: null });

      // Compute expected cash in drawer
      const since = openShift.created;
      
      const salesSnap = await db.collection('sales').where('created', '>=', since).get();
      const repairsSnap = await db.collection('repairs').where('created', '>=', since).get();
      const paymentsSnap = await db.collection('payments').where('created', '>=', since).get();
      const expensesSnap = await db.collection('expenses').where('created', '>=', since).get();
      const returnsSnap = await db.collection('returns').where('created', '>=', since).get();

      let cashIn = 0;
      let cashOut = 0;

      // Sale cash payments
      salesSnap.forEach(d => {
        const s = d.data();
        if (s.deleted) return;
        if (s.payment_method === 'cash') {
          // cash_applied is total - store_credit - points - unpaid
          const ptsVal = s.redeem_value || 0;
          const storeCreditVal = s.store_credit_applied || 0;
          const due = s.due_amount || 0;
          cashIn += (s.total - ptsVal - storeCreditVal - due);
        }
      });

      // Repair cash payments
      repairsSnap.forEach(d => {
        const r = d.data();
        if (r.deleted) return;
        // initial cash deposits
        if (r.paid_amount > 0) {
          cashIn += r.paid_amount;
        }
      });

      // Subsequent ledger payments
      paymentsSnap.forEach(d => {
        const p = d.data();
        if (p.deleted && p.method === 'cash') return;
        if (p.method === 'cash') cashIn += p.amount;
      });

      // Expenses
      expensesSnap.forEach(d => {
        const e = d.data();
        if (!e.deleted) cashOut += e.amount;
      });

      // Returns refunded in cash
      returnsSnap.forEach(d => {
        const r = d.data();
        if (!r.deleted && r.refund_method === 'cash') cashOut += r.cash_refunded;
      });

      const float = Number(openShift.opening_float);
      const expected = round2(float + cashIn - cashOut);

      const um = await resolveUserNames();
      openShift.staff_name = um[openShift.user_id] || '—';
      openShift.expected_cash = expected;

      return ok('', { data: openShift });
    },

    openTill: async (openingFloat, token) => {
      const uid = await gate(token, 'cash_drawer', 'a');
      if (!uid) return err('Access denied');

      const cdSnap = await db.collection('cash_drawer').where('status', '==', 'open').get();
      let hasOpen = false;
      cdSnap.forEach(d => { if (!d.data().deleted) hasOpen = true; });
      if (hasOpen) return err('A shift is already open. Close it first.');

      const id = await getNextId('cash_drawer');
      const nowIso = new Date().toISOString();
      const record = {
        id, user_id: uid, opening_float: round2(openingFloat), expected_cash: round2(openingFloat),
        actual_cash: 0, status: 'open', notes: '', closed_at: '',
        created: nowIso, updated: nowIso, deleted: 0
      };

      await db.collection('cash_drawer').doc(String(id)).set(record);
      await logActivity(uid, 'drawer_open', 'cash_drawer', id, `Opened cash drawer with float: €${openingFloat}`);
      return ok('Drawer opened');
    },

    closeTill: async (id, countedCash, notes, token) => {
      const uid = await gate(token, 'cash_drawer', 'e');
      if (!uid) return err('Access denied');

      const drawerRef = db.collection('cash_drawer').doc(String(id));
      const doc = await drawerRef.get();
      if (!doc.exists || doc.data().status !== 'open') return err('Shift not found or already closed');

      // Recalculate expected cash
      const statusRes = await bridge.getCashDrawerStatus(token);
      const expected = statusRes.data.expected_cash;

      const counted = round2(countedCash);
      const diff = round2(counted - expected);
      const nowIso = new Date().toISOString();

      await drawerRef.update({
        actual_cash: counted,
        expected_cash: expected,
        status: 'closed',
        notes: notes || '',
        closed_at: nowIso,
        updated: nowIso
      });

      await logActivity(uid, 'drawer_close', 'cash_drawer', id, `Closed shift. Counted: €${counted}, Expected: €${expected} (Diff: €${diff > 0 ? '+' : ''}${diff})`);
      return ok('Drawer closed successfully', { expected, actual: counted, difference: diff });
    },

    // ---- Installments ----
    getInstallments: async (token) => {
      const uid = await gate(token, 'installments', 'v');
      if (!uid) return err('Access denied');

      const snapshot = await db.collection('installments').get();
      const cm = await resolveCustomerNames();
      const salesSnap = await db.collection('sales').get();
      const saleMap = {};
      salesSnap.forEach(d => { saleMap[d.data().id] = d.data().invoice_no; });

      const data = [];
      snapshot.forEach(doc => {
        const r = doc.data();
        if (r.deleted) return;
        r.customer_name = cm[r.customer_id] || '—';
        r.invoice_no = saleMap[r.sale_id] || ('#' + r.sale_id);
        r.remaining_amount = round2(r.amount - r.paid_amount);
        data.push(r);
      });
      data.sort((a, b) => a.due_date.localeCompare(b.due_date));
      return ok('', { data });
    },

    getSalesForInstallment: async (token) => {
      const uid = await gate(token, 'installments', 'a');
      if (!uid) return err('Access denied');

      const salesSnap = await db.collection('sales').get();
      const cm = await resolveCustomerNames();
      
      const data = [];
      salesSnap.forEach(doc => {
        const s = doc.data();
        // sales that are unpaid or partial AND do not already have installments
        if (!s.deleted && Number(s.due_amount) > 0) {
          s.customer_name = cm[s.customer_id] || '—';
          data.push(s);
        }
      });
      return ok('', { data });
    },

    createInstallmentPlan: async (saleId, downPayment, numInstallments, method, token) => {
      const uid = await gate(token, 'installments', 'a');
      if (!uid) return err('Access denied');

      const saleRef = db.collection('sales').doc(String(saleId));

      return db.runTransaction(async (transaction) => {
        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists || saleDoc.data().deleted) throw new Error('Sale not found');
        const s = saleDoc.data();

        // check if installments already exist
        const instSnap = await transaction.get(db.collection('installments').where('sale_id', '==', Number(saleId)));
        let hasPlan = false;
        instSnap.forEach(d => { if (!d.data().deleted) hasPlan = true; });
        if (hasPlan) throw new Error('Installment plan already exists for this sale');

        let dp = round2(downPayment);
        if (dp > Number(s.due_amount)) throw new Error('Down payment cannot exceed due amount');

        const nowIso = new Date().toISOString();

        // Apply down payment if > 0
        if (dp > 0) {
          const newPaid = round2(Number(s.amount_paid) + dp);
          const newDue = round2(s.total - newPaid);
          transaction.update(saleRef, {
            amount_paid: newPaid, due_amount: newDue, payment_status: newDue <= 0 ? 'paid' : (newPaid <= 0 ? 'unpaid' : 'partial'), updated: nowIso
          });

          const paymentId = await getNextId('payments');
          transaction.set(db.collection('payments').doc(String(paymentId)), {
            id: paymentId, customer_id: s.customer_id, ref_type: 'sale', ref_id: s.id, amount: dp, method, note: 'Downpayment', user_id: uid, created: nowIso, updated: nowIso, deleted: 0
          });
          
          s.due_amount = newDue;
        }

        const due = round2(s.due_amount);
        if (due > 0) {
          const numInst = parseInt(numInstallments) || 3;
          const instAmount = round2(due / numInst);
          let acc = 0;
          for (let k = 1; k <= numInst; k++) {
            const instId = await getNextId('installments');
            const amt = (k === numInst) ? round2(due - acc) : instAmount;
            acc = round2(acc + amt);
            const due_date = ymd(new Date(Date.now() + k * 30 * 864e5));
            transaction.set(db.collection('installments').doc(String(instId)), {
              id: instId, sale_id: Number(saleId), customer_id: s.customer_id, amount: amt, paid_amount: 0,
              due_date, status: 'pending', paid_date: '', created: nowIso, updated: nowIso, deleted: 0
            });
          }
        }
        return ok('Plan created');
      }).then(async (res) => {
        await logActivity(uid, 'installment_plan_add', 'installments', saleId, `Created plan for sale #${saleId}`);
        return res;
      }).catch(err => {
        return { success: false, message: err.message };
      });
    },

    recordInstallmentPayment: async (installmentId, amount, method, token) => {
      const uid = await gate(token, 'installments', 'e');
      if (!uid) return err('Access denied');

      const instRef = db.collection('installments').doc(String(installmentId));

      return db.runTransaction(async (transaction) => {
        const instDoc = await transaction.get(instRef);
        if (!instDoc.exists || instDoc.data().deleted) throw new Error('Installment row not found');
        const inst = instDoc.data();
        if (inst.status === 'paid') throw new Error('Installment already settled');

        const saleRef = db.collection('sales').doc(String(inst.sale_id));
        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists) throw new Error('Original sale not found');
        const s = saleDoc.data();

        let amt = round2(amount);
        const room = round2(inst.amount - inst.paid_amount);
        amt = round2(Math.min(amt, room));

        if (amt <= 0) throw new Error('Enter a valid amount');

        const nowIso = new Date().toISOString();

        // 1. Record on installment row
        const newInstPaid = round2(Number(inst.paid_amount) + amt);
        const isPaid = newInstPaid >= round2(inst.amount);
        transaction.update(instRef, {
          paid_amount: newInstPaid,
          status: isPaid ? 'paid' : 'pending',
          paid_date: isPaid ? ymd(new Date()) : '',
          updated: nowIso
        });

        // 2. Record on POS Sale
        const newPaid = round2(Number(s.amount_paid) + amt);
        const newDue = round2(Math.max(0, Number(s.total) - newPaid));
        transaction.update(saleRef, {
          amount_paid: newPaid, due_amount: newDue, payment_status: newDue <= 0 ? 'paid' : (newPaid <= 0 ? 'unpaid' : 'partial'), updated: nowIso
        });

        // 3. Insert payment ledger log
        const paymentId = await getNextId('payments');
        transaction.set(db.collection('payments').doc(String(paymentId)), {
          id: paymentId, customer_id: inst.customer_id, ref_type: 'sale', ref_id: s.id, amount: amt, method, note: `Installment #${installmentId}`, user_id: uid, created: nowIso, updated: nowIso, deleted: 0
        });

        return { invoice_no: s.invoice_no, amt };
      }).then(async (res) => {
        await logActivity(uid, 'payment', 'payments', installmentId, `Installment #${installmentId} payment ${res.amt} (${method})`);
        return ok('Payment recorded successfully');
      }).catch(err => {
        return { success: false, message: err.message };
      });
    },

    // ---- Reports & Dashboard ----
    getDashboardStats: async (token) => {
      const uid = await gate(token, 'dashboard', 'v');
      if (!uid) return err('Access denied');

      const today = ymd(new Date());

      // Read Sales
      const salesSnap = await db.collection('sales').get();
      const todaySales = [];
      const salesList = [];
      salesSnap.forEach(d => {
        const s = d.data();
        if (s.deleted) return;
        salesList.push(s);
        if (s.created.slice(0, 10) === today) todaySales.push(s);
      });

      const todayRevenue = todaySales.reduce((a, s) => a + Number(s.total), 0);

      // Read Repairs
      const repairsSnap = await db.collection('repairs').get();
      const repairs = [];
      repairsSnap.forEach(d => { if (!d.data().deleted) repairs.push(d.data()); });

      // Read Products
      const productsSnap = await db.collection('products').get();
      const products = [];
      productsSnap.forEach(d => { if (!d.data().deleted) products.push(d.data()); });

      const settingsDoc = await db.collection('system').doc('settings').get();
      const cfg = settingsDoc.exists ? settingsDoc.data() : SETTINGS_DEFAULTS;

      const lowStock = products.filter(p => Number(p.stock_qty) <= Number(p.low_stock_alert || cfg.low_stock_default || 5));

      // 7-day revenue trend
      const trend = [];
      for (let k = 6; k >= 0; k--) {
        const day = ymd(new Date(Date.now() - k * 86400000));
        const daySales = salesList.filter(s => s.created.slice(0, 10) === day);
        const rev = daySales.reduce((a, s) => a + Number(s.total), 0);
        trend.push({ day, total: round2(rev), count: daySales.length });
      }

      // Last 30-day payment mix + top sellers
      const since = ymd(new Date(Date.now() - 29 * 86400000));
      const payMix = { cash: 0, card: 0, bank_transfer: 0 };
      const prodAgg = {};

      salesList.forEach(s => {
        const date = s.created.slice(0, 10);
        if (date < since) return;
        payMix[s.payment_method] = round2((payMix[s.payment_method] || 0) + Number(s.total));
        (s.items || []).forEach(l => {
          if (!prodAgg[l.product_id]) prodAgg[l.product_id] = { name: l.name, qty: 0 };
          prodAgg[l.product_id].qty += (Number(l.qty) || 0);
        });
      });

      const topProducts = Object.keys(prodAgg).map(k => prodAgg[k])
        .sort((a, b) => b.qty - a.qty).slice(0, 6);

      // Stock units per category + inventory value
      const stockByCategory = {};
      let inventoryValue = 0;
      products.forEach(p => {
        const c = p.category || 'other';
        stockByCategory[c] = (stockByCategory[c] || 0) + (Number(p.stock_qty) || 0);
        inventoryValue = round2(inventoryValue + (Number(p.stock_qty) || 0) * (Number(p.purchase_price) || 0));
      });

      // Installments due today or overdue
      const custMapD = {};
      const custSnapshot = await db.collection('customers').get();
      custSnapshot.forEach(d => { custMapD[d.data().id] = d.data(); });

      const instSnapshot = await db.collection('installments').where('status', '==', 'pending').get();
      const installmentsDue = [];
      instSnapshot.forEach(doc => {
        const r = doc.data();
        if (r.deleted) return;
        if (r.due_date <= today) {
          const c = custMapD[r.customer_id] || {};
          installmentsDue.push({
            id: r.id, customer_name: c.name || '—', customer_phone: c.phone || '',
            invoice_no: '#' + r.sale_id, due_date: r.due_date, due: round2(r.amount - (r.paid_amount || 0))
          });
        }
      });
      installmentsDue.sort((a, b) => a.due_date.localeCompare(b.due_date));

      // Recent Activity
      const logsSnap = await db.collection('activity_logs').get();
      const logs = [];
      logsSnap.forEach(d => { logs.push(d.data()); });
      logs.sort((a, b) => b.id - a.id);
      const users = await resolveUserNames();
      const recentActivity = logs.slice(0, 8).map(l => ({
        action_type: l.action_type, description: l.description, created: l.created, user_name: users[l.user_id] || 'System'
      }));

      // Customer count
      const custCount = Object.keys(custMapD).filter(k => !custMapD[k].deleted).length;

      return ok('', { data: {
        todaySalesCount: todaySales.length,
        todayRevenue: round2(todayRevenue),
        repairsInProgress: repairs.filter(r => r.status === 'in_repair').length,
        repairsReady: repairs.filter(r => r.status === 'repaired').length,
        totalProducts: products.length,
        lowStockCount: lowStock.length,
        totalCustomers: custCount,
        outstandingRepairBalance: round2(repairs.reduce((a, r) => a + Number(r.remaining_amount || 0), 0)),
        inventoryValue,
        repairsByStatus: {
          in_repair: repairs.filter(r => r.status === 'in_repair').length,
          repaired: repairs.filter(r => r.status === 'repaired').length,
          delivered: repairs.filter(r => r.status === 'delivered').length
        },
        salesTrend: trend,
        paymentMix: payMix,
        topProducts,
        stockByCategory,
        lowStock: lowStock.slice(0, 10),
        installmentsDue: installmentsDue.slice(0, 10),
        recentSales: salesList.slice(-7).reverse(),
        recentActivity
      } });
    },

    getReportSummary: async (token, from, to) => {
      const uid = await gate(token, 'reports', 'v');
      if (!uid) return err('Access denied');

      const pm = {};
      const productsSnap = await db.collection('products').get();
      productsSnap.forEach(d => { pm[d.data().id] = d.data(); });

      // Gather Sales
      const salesSnap = await db.collection('sales').get();
      const sales = [];
      salesSnap.forEach(d => {
        const s = d.data();
        if (s.deleted) return;
        const date = s.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        sales.push(s);
      });

      // Gather Repairs
      const repairsSnap = await db.collection('repairs').get();
      const repairs = [];
      repairsSnap.forEach(d => {
        const r = d.data();
        if (r.deleted) return;
        const date = r.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        repairs.push(r);
      });

      // Gather Used Phones
      const usedSnap = await db.collection('used_phones').get();
      const used = [];
      usedSnap.forEach(d => {
        const u = d.data();
        if (u.deleted) return;
        const date = u.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        used.push(u);
      });

      let salesRevenue = 0;
      let salesVat = 0;
      let salesCogs = 0;
      let salesDiscount = 0;
      const byPay = {};
      const prodAgg = {};

      sales.forEach(s => {
        salesRevenue = round2(salesRevenue + Number(s.total));
        salesVat = round2(salesVat + Number(s.vat_amount));
        salesDiscount = round2(salesDiscount + Number(s.discount || 0));
        byPay[s.payment_method] = round2((byPay[s.payment_method] || 0) + Number(s.total));
        (s.items || []).forEach(l => {
          const cost = (l.unit_cost != null) ? Number(l.unit_cost) : (pm[l.product_id] ? Number(pm[l.product_id].purchase_price) : 0);
          salesCogs = round2(salesCogs + cost * l.qty);
          if (!prodAgg[l.product_id]) prodAgg[l.product_id] = { name: l.name, qty: 0, revenue: 0 };
          prodAgg[l.product_id].qty += l.qty;
          prodAgg[l.product_id].revenue = round2(prodAgg[l.product_id].revenue + (l.unit_price * l.qty));
        });
      });

      const topProducts = Object.keys(prodAgg).map(k => prodAgg[k]).sort((a, b) => b.qty - a.qty).slice(0, 10);
      const repairIncome = round2(repairs.reduce((a, r) => a + Number(r.paid_amount || 0), 0));
      const usedSpend = round2(used.reduce((a, u) => a + Number(u.purchase_price || 0), 0));

      // Returns netting
      const returnsSnap = await db.collection('returns').get();
      const rets = [];
      returnsSnap.forEach(d => {
        const r = d.data();
        if (r.deleted) return;
        const date = r.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        rets.push(r);
      });

      let refundsTotal = 0;
      let refundsVat = 0;
      let refundsCogsRestored = 0;
      const refundByMethod = {};
      const refundsCount = rets.length;

      rets.forEach(rt => {
        refundsTotal = round2(refundsTotal + Number(rt.refund_total));
        refundsVat = round2(refundsVat + Number(rt.refund_vat));
        refundsCogsRestored = round2(refundsCogsRestored + (rt.restock ? Number(rt.returned_cogs) : 0));
        refundByMethod[rt.refund_method] = round2((refundByMethod[rt.refund_method] || 0) + Number(rt.cash_refunded));
      });

      const salesRevenueNet = round2(salesRevenue - refundsTotal);
      const salesVatNet = round2(salesVat - refundsVat);
      const salesCogsNet = round2(salesCogs - refundsCogsRestored);
      const salesGrossProfit = round2(salesRevenueNet - salesVatNet - salesCogsNet);

      // Expenses
      const expensesSnap = await db.collection('expenses').get();
      let expensesTotal = 0;
      const expensesByCategory = {};
      expensesSnap.forEach(d => {
        const e = d.data();
        if (e.deleted) return;
        const date = e.created.slice(0, 10);
        if (from && date < from) return;
        if (to && date > to) return;
        expensesTotal = round2(expensesTotal + Number(e.amount || 0));
        expensesByCategory[e.category] = round2((expensesByCategory[e.category] || 0) + Number(e.amount || 0));
      });

      const repairPartsCost = round2(repairs.reduce((a, r) => a + Number(r.parts_cost || 0), 0));
      const repairProfit = round2(repairIncome - repairPartsCost);
      const netProfit = round2(salesGrossProfit + repairProfit - expensesTotal);

      return ok('', { data: {
        salesCount: sales.length, salesRevenue, salesVat, salesDiscount,
        salesNet: round2(salesRevenue - salesVat), grossProfit: salesGrossProfit,
        salesRevenueNet, salesVatNet, salesCogsNet, salesGrossProfitNet: salesGrossProfit,
        refundsTotal, refundsVat, refundsCogsRestored, refundsCount, refundByMethod,
        byPayment: byPay, topProducts,
        repairsCount: repairs.length, repairIncome, repairPartsCost, repairProfit,
        repairsByStatus: {
          in_repair: repairs.filter(r => r.status === 'in_repair').length,
          repaired: repairs.filter(r => r.status === 'repaired').length,
          delivered: repairs.filter(r => r.status === 'delivered').length
        },
        usedCount: used.length, usedSpend,
        expensesTotal, expensesByCategory, netProfit
      } });
    }
  };

  // Expose bridge globally
  window.firebaseBridge = bridge;

  // ==========================================
  // 8. Intercepting Apps Script run builder
  // ==========================================
  const makeRunner = (successCb, failureCb) => {
    return new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'withSuccessHandler') {
          return (newSuccess) => makeRunner(newSuccess, failureCb);
        }
        if (prop === 'withFailureHandler') {
          return (newFailure) => makeRunner(successCb, newFailure);
        }
        
        // Execute the function
        return (...args) => {
          if (typeof window.firebaseBridge[prop] === 'function') {
            window.firebaseBridge[prop](...args)
              .then(res => {
                if (successCb) successCb(res);
              })
              .catch(err => {
                console.error("Firebase Bridge Error in " + prop + ":", err);
                if (failureCb) failureCb(err);
              });
          } else {
            console.error(`Firebase Bridge function ${prop} not implemented`);
            if (failureCb) failureCb(new Error(`Function ${prop} not implemented`));
          }
        };
      }
    });
  };

  window.google = {
    script: {
      run: makeRunner()
    }
  };

})();
