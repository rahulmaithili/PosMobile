/**
 * Developed by Mohammad Rameez Imdad (Rameez Scripts)
 * WhatsApp: https://wa.me/923224083545 (For Custom Projects)
 * YouTube: https://www.youtube.com/@rameezimdad (Subscribe for more!)
 */

// ============== Sheets ==============
var SHEETS = {
  USERS: 'Users', ROLES: 'Roles', SETTINGS: 'Settings',
  SUPPLIERS: 'Suppliers', PRODUCTS: 'Products', CUSTOMERS: 'Customers',
  INVENTORY: 'Inventory_Movements', SALES: 'Sales', REPAIRS: 'Repairs',
  USED_PHONES: 'Used_Phones', LOGS: 'Activity_Logs',
  EXPENSES: 'Expenses', RETURNS: 'Returns', PAYMENTS: 'Payments',
  CASH_DRAWER: 'Cash_Drawer', INSTALLMENTS: 'Installments'
};
var ASSETS_FOLDER_NAME = 'ASSETS';
var DEFAULT_LOGO = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiGXxCe0WNNedmFqSWeF761f7Kshhc-NP5ChRQKz9fr97cO8VaarvD0KlCwqHojJVBWv-RAxfOqMI5rD4H78KnARyOc6QgwL1nRRFWf5xNQ1d9F9HfAoLPPGlTyP0GwNl4n-INMEsWLQ4Y7zJtz5bOdAnc2ePH9-uCRgshlo6BsS6gJEz6fhrxL-5U5O3sX/s160/channels4_profile.jpg';

// Users stays classic row-per-record. cols: 0=id,1=username,2=email,3=pwd,4=role,5=status,6=img,7=theme,8=colors,9=created,10=createdBy,11=updated,12=updatedBy,13=del
var U = { ID:0, USER:1, EMAIL:2, PWD:3, ROLE:4, STATUS:5, IMG:6, THEME:7, COLORS:8, CREATED:9, CREATED_BY:10, UPDATED:11, UPDATED_BY:12, DEL:13 };

// ============== RBAC Config ==============
// Roles sheet cols: 0=role_key,1=label,2=color,3=sort,4=is_super,5=hidden_signup,6=permissions(JSON)
var ROLE_C = { KEY:0, LABEL:1, COLOR:2, SORT:3, SUPER:4, HIDDEN:5, PERMS:6 };

// pages the matrix governs (account=always-on, permissions=editor-only — excluded)
var RBAC_PAGES = [
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

// keys MATCH Users.role values (owner/manager/employee)
var RBAC_ROLE_DEFS = [
  { key:'owner',    label:'Owner',    color:'#6a1b9a', is_super:1, hidden_signup:1 },
  { key:'manager',  label:'Manager',  color:'#0074D9', is_super:0, hidden_signup:1 },
  { key:'employee', label:'Employee', color:'#2e7d32', is_super:0, hidden_signup:0 }
];
var RBAC_EDIT_ROLES = ['owner']; // who may open/edit the matrix

// starting grants — v=view a=add e=edit d=delete
function rbacDefaultPerms_(roleKey) {
  var perms = {};
  var set = function(k,v,a,e,d){ perms[k] = { v:v?1:0, a:a?1:0, e:e?1:0, d:d?1:0 }; };
  RBAC_PAGES.forEach(function(p){ set(p.key,0,0,0,0); }); // deny all

  if (roleKey === 'owner') { RBAC_PAGES.forEach(function(p){ set(p.key,1,1,1,1); }); return perms; }

  if (roleKey === 'manager') {
    set('dashboard',1,0,0,0);
    set('pos',1,1,1,0);
    set('repairs',1,1,1,0);
    set('used_phones',1,1,1,0);
    set('imei_lookup',1,0,0,0);
    set('customers',1,1,1,0);
    set('products',1,1,1,1);
    set('inventory',1,1,0,0);
    set('suppliers',1,1,1,0);
    set('expenses',1,1,1,0);
    set('cash_drawer',1,1,1,0);
    set('installments',1,1,1,0);
    set('users',1,1,1,0);
    set('reports',1,0,0,0);
    set('settings',1,0,0,0);
    return perms;
  }

  // employee
  set('dashboard',1,0,0,0);
  set('pos',1,1,0,0);
  set('repairs',1,1,1,0);
  set('used_phones',1,1,0,0);
  set('imei_lookup',1,0,0,0);
  set('customers',1,1,1,0);
  set('products',1,0,0,0); // read only
  set('cash_drawer',1,1,1,0); // open/close own shift
  set('installments',1,1,0,0); // view + create plan, no edit/delete
  return perms;
}

// ============== Web App Entry ==============
function doGet(e) {
  var tpl = HtmlService.createTemplateFromFile('index');
  // pass public-tracker link params in server side — iframe sandbox mode
  // doesn't reliably forward the exec URL's query string to window.location
  var p = (e && e.parameter) || {};
  tpl.trackId = p.track || '';
  tpl.trackToken = p.t || '';
  return tpl.evaluate()
    .setTitle('Phone Shop POS')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============== Core Helpers ==============
function getSheet(name){ return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
function getCurrentTimestamp(){ return new Date().toISOString(); }
function round2(n){ return Math.round((Number(n)||0) * 100) / 100; }
function padNo_(n){ var s = String(n); return s.length >= 4 ? s : ('0000' + s).slice(-4); } // doc no padding
// add N months, clamped to month-end (Jan31 +1mo -> Feb28/29, not Mar3)
function addMonths_(d, n){
  var day = d.getDate(), t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  var last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last));
  return t;
}
function ok(msg, extra){ return Object.assign({ success:true, message:msg||'' }, extra||{}); }
function err(msg){ return { success:false, message: msg || 'Something went wrong' }; }

// ============== JSON Row DB (JDB) ==============
// every sheet except Users/Settings/Roles: Date | Data (one row per day, JSON array)
var JDB_MAX = 45000;
function ymd(d){ return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(d).slice(0,10); }
// create a Date|Data JSON sheet on demand (existing deployments self-provision new sheets)
function ensureJsonSheet_(name){
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (sh) return sh;
  sh = ss.insertSheet(name); sh.appendRow(['Date', 'Data']);
  sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#001f3f').setFontColor('white');
  sh.getRange('A:A').setNumberFormat('@');
  return sh;
}

var JDB = {
  rows: function(name){
    var sh = getSheet(name);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
      .map(function(v, i){ return { row:i+2, date:ymd(v[0]), arr: v[1] ? JSON.parse(v[1]) : [] }; });
  },
  readAll: function(name){ return this.rows(name).reduce(function(a, r){ return a.concat(r.arr); }, []); },
  readDay: function(name, date){ return this.rows(name).filter(function(r){ return r.date === date; }).reduce(function(a, r){ return a.concat(r.arr); }, []); },
  readRange: function(name, from, to){
    return this.rows(name).filter(function(r){ return (!from || r.date >= from) && (!to || r.date <= to); })
      .reduce(function(a, r){ return a.concat(r.arr); }, []);
  },
  find: function(name, fn){ return this.readAll(name).find(fn) || null; },
  byId: function(name, id){ return this.find(name, function(x){ return x.id == id; }); },
  nextId: function(name){
    var props = PropertiesService.getScriptProperties(), key = 'JID_' + name;
    var id = parseInt(props.getProperty(key) || '0');
    if (!id) id = this.readAll(name).reduce(function(m, x){ return Math.max(m, x.id || 0); }, 0);
    props.setProperty(key, String(id + 1));
    return id + 1;
  },
  insert: function(name, rec){
    var lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      var now = getCurrentTimestamp();
      rec.id = this.nextId(name);
      rec.created = rec.created || now;
      rec.updated = now;
      var date = ymd(rec.created), sh = getSheet(name) || ensureJsonSheet_(name);
      var day = this.rows(name).filter(function(r){ return r.date === date; }), last = day[day.length - 1];
      if (last) {
        var json = JSON.stringify(last.arr.concat([rec]));
        if (json.length <= JDB_MAX) { sh.getRange(last.row, 2).setValue(json); return rec; }
      }
      sh.appendRow([date, JSON.stringify([rec])]);
      return rec;
    } finally { lock.releaseLock(); }
  },
  update: function(name, id, patch){
    var lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      var sh = getSheet(name), rows = this.rows(name);
      for (var k = 0; k < rows.length; k++) {
        var r = rows[k], i = r.arr.findIndex(function(x){ return x.id == id; });
        if (i === -1) continue;
        Object.assign(r.arr[i], patch, { updated: getCurrentTimestamp() });
        sh.getRange(r.row, 2).setValue(JSON.stringify(r.arr));
        return r.arr[i];
      }
      return null;
    } finally { lock.releaseLock(); }
  },
  remove: function(name, id){ return this.update(name, id, { deleted: 1 }); } // soft del
};

// ============== Activity Logs ==============
function logActivity(userId, actionType, refTable, refId, desc){
  try {
    JDB.insert(SHEETS.LOGS, { user_id: userId || 0, action_type: actionType, reference_table: refTable || '', reference_id: refId || '', description: desc || '', ip_address: '' });
  } catch (e) { Logger.log('log err: ' + e); }
}

// ============== Settings ==============
// single registry — drives seed + read-merge + save-whitelist. Add ANY new key here.
var SETTINGS_DEFAULTS = {
  shop_name:'Rameez Phone Hub', shop_tagline:'Sales · Repairs · Accessories',
  shop_address:'123 Market Street, Downtown', shop_city:'', shop_country:'',
  shop_phone:'+1 555 0100', shop_email:'hello@phoneshop.demo', shop_website:'', tax_id:'', shop_logo: DEFAULT_LOGO,
  currency:'€', currency_code:'EUR', currency_position:'before', currency_decimals:'2',
  vat_default:'21', enable_vat:'1', low_stock_default:'5',
  invoice_prefix:'INV-', repair_prefix:'RPR-', used_prefix:'UP-',
  date_format:'YYYY-MM-DD', timezone:'', receipt_size:'80mm',
  receipt_footer:'Thank you for shopping with us!', show_logo_on_receipt:'1',
  invoice_terms:'Goods sold are not returnable after 7 days. Warranty as per manufacturer.',
  contract_terms:'The seller confirms lawful ownership of the device and that it is not stolen or blocked. Sold as-is. ID verified at purchase.',
  loyalty_enabled:'1', loyalty_earn_per:'10', loyalty_point_value:'0.10',
  return_prefix:'RET-', return_reasons:'Defective/Faulty,Wrong item,Customer changed mind,Not as described,Warranty claim,Other',
  void_window_hours:'24', expense_categories:'rent,salaries,utilities,marketing,parts,misc',
  wa_template:'Hi {name}, your device "{device}" is repaired and ready for pickup. Balance due: {currency}{remaining}. Thank you - {shop}',
  installment_reminder_email:'0'
};
function ensureSettings_(){
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(SHEETS.SETTINGS);
  if (!sh) { sh = ss.insertSheet(SHEETS.SETTINGS); sh.appendRow(['key', 'value']);
    sh.getRange(1, 1, 1, 2).setBackground('#001f3f').setFontColor('white').setFontWeight('bold'); }
  return sh;
}
// coerce/clamp a value on save (security: only registry keys land; correctness floors)
function clampSetting_(k, v){
  if (k === 'currency_decimals') { var d = parseInt(v); return String(isNaN(d) ? 2 : Math.min(3, Math.max(0, d))); }
  if (k === 'vat_default' || k === 'loyalty_point_value') { var n = Number(v) || 0; return String(Math.max(0, n)); }
  if (k === 'loyalty_earn_per') { var p = Number(v) || 0; return String(p > 0 ? p : 1); }
  if (k === 'low_stock_default') { return String(Math.max(0, parseInt(v) || 0)); }
  if (k === 'enable_vat' || k === 'show_logo_on_receipt' || k === 'loyalty_enabled' || k === 'installment_reminder_email') return (v === '1' || v === 1) ? '1' : '0';
  return v;
}
function settings_(){
  var sh = getSheet(SHEETS.SETTINGS), out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function(r){ if (r[0]) out[r[0]] = r[1]; });
  return out;
}
function getShopSettings(){ return ok('', { data: Object.assign({}, SETTINGS_DEFAULTS, settings_()) }); }
function saveShopSettings(data, userId){
  userId = gate_(userId, 'settings', 'e'); if (!userId) return err('Access denied');
  var sh = ensureSettings_(), vals = sh.getDataRange().getValues(), seen = {}, touched = [];
  var clean = {};
  Object.keys(data).forEach(function(k){ if (SETTINGS_DEFAULTS.hasOwnProperty(k)) { clean[k] = clampSetting_(k, data[k]); touched.push(k); } });
  for (var i = 1; i < vals.length; i++) {
    if (clean.hasOwnProperty(vals[i][0])) { sh.getRange(i + 1, 2).setValue(clean[vals[i][0]]); seen[vals[i][0]] = 1; }
  }
  Object.keys(clean).forEach(function(k){ if (!seen[k]) sh.appendRow([k, clean[k]]); });
  logActivity(userId, 'settings_update', SHEETS.SETTINGS, '', 'Updated settings: ' + touched.join(', '));
  return ok('Settings saved');
}

// ============== Users helpers ==============
function usersData_(){ var sh = getSheet(SHEETS.USERS); return sh ? sh.getDataRange().getValues() : []; }
function userById_(id){ var d = usersData_(); for (var i = 1; i < d.length; i++) if (d[i][U.ID] == id) return d[i]; return null; }
function userByName_(name){ var d = usersData_(); for (var i = 1; i < d.length; i++) if (d[i][U.USER] === name) return d[i]; return null; }
function userRoleById_(id){ var u = userById_(id); return u ? u[U.ROLE] : null; }

// ============== Auth ==============
function authenticateUser(username, password){
  try {
    var sh = getSheet(SHEETS.USERS);
    if (!sh) return err('Users sheet not found. Run setup first.');
    if (loginLocked_(username)) return err('Too many attempts. Try again in a few minutes.');
    var d = sh.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      if (d[i][U.USER] === username) {
        if (Number(d[i][U.DEL]) === 1) { bumpLogin_(username); return err('Invalid username or password'); }
        if (String(password) !== String(d[i][U.PWD])) { bumpLogin_(username); logActivity(d[i][U.ID], 'login', SHEETS.USERS, d[i][U.ID], 'Login failed — bad password'); return err('Invalid username or password'); }
        if (d[i][U.STATUS] !== 'active') { logActivity(d[i][U.ID], 'login', SHEETS.USERS, d[i][U.ID], 'Login failed — inactive'); return err('Account is inactive. Contact the owner.'); }
        clearLogin_(username);
        try { ensureRbacPages_(); } catch (e) { Logger.log('rbac backfill: ' + e); } // backfill new pages on existing deployments
        var token = newSession_(d[i][U.ID], d[i][U.ROLE]);
        logActivity(d[i][U.ID], 'login', SHEETS.USERS, d[i][U.ID], 'Login success');
        return ok('', {
          token: token,
          user: {
            id: d[i][U.ID], username: d[i][U.USER], email: d[i][U.EMAIL], role: d[i][U.ROLE],
            profileImage: d[i][U.IMG] || '', themeMode: d[i][U.THEME] || 'light', customColors: d[i][U.COLORS] || '',
            permissions: rbacPermsFor_(d[i][U.ROLE]), canEditRbac: canEditRbac_(d[i][U.ROLE])
          }
        });
      }
    }
    bumpLogin_(username);
    return err('Invalid username or password');
  } catch (e) { return err('Error: ' + e); }
}
// login throttle (per username) via CacheService — 5 fails / 15 min
function loginKey_(u){ return 'LFAIL_' + String(u || '').toLowerCase(); }
function loginLocked_(u){ var c = CacheService.getScriptCache().get(loginKey_(u)); return !!c && Number(c) >= 5; }
function bumpLogin_(u){ var c = CacheService.getScriptCache(), n = Number(c.get(loginKey_(u)) || 0) + 1; c.put(loginKey_(u), String(n), 900); }
function clearLogin_(u){ CacheService.getScriptCache().remove(loginKey_(u)); }

// ============== RBAC backend ==============
function ensureRbac_(ss){
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.ROLES);
  if (!sh) {
    sh = ss.insertSheet(SHEETS.ROLES);
    sh.appendRow(['role_key','label','color','sort_order','is_super','hidden_signup','permissions']);
    sh.getRange(1, 1, 1, 7).setBackground('#001f3f').setFontColor('white').setFontWeight('bold');
    RBAC_ROLE_DEFS.forEach(function(r, i){
      sh.appendRow([r.key, r.label, r.color, i, r.is_super, r.hidden_signup, JSON.stringify(rbacDefaultPerms_(r.key))]);
    });
  }
  return sh;
}
// additive migration — backfill any RBAC_PAGES key missing from each role's JSON (idempotent)
function ensureRbacPages_(){
  var sh = ensureRbac_(), d = sh.getDataRange().getValues(), wrote = false;
  for (var i = 1; i < d.length; i++) {
    var key = d[i][ROLE_C.KEY]; if (!key) continue;
    var perms = {}; try { perms = JSON.parse(d[i][ROLE_C.PERMS] || '{}'); } catch (e) {}
    var defs = rbacDefaultPerms_(key), changed = false;
    RBAC_PAGES.forEach(function(p){ if (!perms[p.key]) { perms[p.key] = defs[p.key]; changed = true; } });
    if (changed) { sh.getRange(i + 1, ROLE_C.PERMS + 1).setValue(JSON.stringify(perms)); wrote = true; }
  }
  return wrote;
}
function readRoles_(){
  var d = ensureRbac_().getDataRange().getValues(), out = [];
  for (var i = 1; i < d.length; i++) {
    var r = d[i]; if (!r[ROLE_C.KEY]) continue;
    var perms = {}; try { perms = JSON.parse(r[ROLE_C.PERMS] || '{}'); } catch (e) {}
    out.push({ key:r[ROLE_C.KEY], label:r[ROLE_C.LABEL], color:r[ROLE_C.COLOR], sort:Number(r[ROLE_C.SORT])||0,
               is_super:Number(r[ROLE_C.SUPER])?1:0, hidden_signup:Number(r[ROLE_C.HIDDEN])?1:0, perms:perms });
  }
  out.sort(function(a,b){ return a.sort - b.sort; });
  return out;
}
function roleByKey_(key){ var a = readRoles_(); for (var i = 0; i < a.length; i++) if (a[i].key === key) return a[i]; return null; }
function canEditRbac_(role){ return RBAC_EDIT_ROLES.indexOf(role) !== -1; }
function rbacPermsFor_(role){ var r = roleByKey_(role); return r ? r.perms : rbacDefaultPerms_(role); }
function hasPerm_(role, page, perm){ var r = roleByKey_(role); return !!(r && r.perms && r.perms[page] && r.perms[page][perm || 'v']); }
// ---- Sessions: random token issued on login, resolves to the real userId ----
var SESSION_TTL_MS = 12 * 3600 * 1000; // 12h (outlives the 1h client session)
function newSession_(uid, role){
  var token = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('SESS_' + token, JSON.stringify({ uid: uid, role: role, exp: Date.now() + SESSION_TTL_MS }));
  return token;
}
function sess_(token){
  if (!token) return 0;
  var props = PropertiesService.getScriptProperties(), raw = props.getProperty('SESS_' + token);
  if (!raw) return 0;
  var s; try { s = JSON.parse(raw); } catch (e) { return 0; }
  if (!s || !s.exp || s.exp < Date.now()) { props.deleteProperty('SESS_' + token); return 0; }
  return Number(s.uid) || 0;
}
function endSession_(token){ if (token) PropertiesService.getScriptProperties().deleteProperty('SESS_' + token); }
function logout(token){ endSession_(token); return ok('Signed out'); }
// gate takes a session token, resolves the real userId, returns it (0 = denied) so handlers reassign userId
function gate_(token, page, perm){
  var uid = sess_(token);
  if (!uid) return 0;
  return hasPerm_(userRoleById_(uid), page, perm) ? uid : 0;
}

function getMyPermissions(userId){
  userId = sess_(userId); if (!userId) return err('Not signed in');
  var role = userRoleById_(userId);
  return ok('', { perms: rbacPermsFor_(role), canEdit: canEditRbac_(role), role: role });
}
function getRbacMatrix(userId){
  userId = sess_(userId);
  if (!userId || !canEditRbac_(userRoleById_(userId))) return err('Access denied');
  var roles = readRoles_(), perms = {};
  roles.forEach(function(r){ perms[r.key] = r.perms; });
  return ok('', { pages:RBAC_PAGES, roles: roles.map(function(r){ return { key:r.key, label:r.label, color:r.color, is_super:r.is_super }; }), perms: perms });
}
function toggleRbac(roleKey, pageKey, perm, value, userId){
  userId = sess_(userId);
  if (!userId || !canEditRbac_(userRoleById_(userId))) return err('Access denied');
  if (['v','a','e','d'].indexOf(perm) === -1) return err('Bad permission');
  var sh = ensureRbac_(), d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (d[i][ROLE_C.KEY] === roleKey) {
      if (Number(d[i][ROLE_C.SUPER]) === 1) return err('Owner permissions are locked');
      var p = {}; try { p = JSON.parse(d[i][ROLE_C.PERMS] || '{}'); } catch (e) {}
      if (!p[pageKey]) p[pageKey] = { v:0, a:0, e:0, d:0 };
      p[pageKey][perm] = value ? 1 : 0;
      if (perm === 'v' && !value) { p[pageKey].a = 0; p[pageKey].e = 0; p[pageKey].d = 0; }
      if (perm !== 'v' && value) p[pageKey].v = 1;
      sh.getRange(i + 1, ROLE_C.PERMS + 1).setValue(JSON.stringify(p));
      logActivity(userId, 'role_update', SHEETS.ROLES, '', roleKey + ' · ' + pageKey + ' · ' + perm + '=' + (value ? 1 : 0));
      return ok('Saved');
    }
  }
  return err('Role not found');
}

// ============== Users CRUD ==============
function getUsers(userId){
  userId = gate_(userId, 'users', 'v'); if (!userId) return err('Access denied');
  var d = usersData_(), out = [];
  for (var i = 1; i < d.length; i++) {
    if (Number(d[i][U.DEL]) === 1) continue;
    out.push({ id:d[i][U.ID], username:d[i][U.USER], email:d[i][U.EMAIL], role:d[i][U.ROLE], status:d[i][U.STATUS],
      profileImage:d[i][U.IMG], created_at:isoOr_(d[i][U.CREATED]), created_by:d[i][U.CREATED_BY], updated_at:isoOr_(d[i][U.UPDATED]), updated_by:d[i][U.UPDATED_BY] });
  }
  return ok('', { data: out });
}
function isoOr_(v){ if (v && !(typeof v === 'string' && v.indexOf('T') !== -1)) { try { return new Date(v).toISOString(); } catch (e) {} } return v; }

// role-assignment guard — only an owner may grant a super/owner role; role must exist
function roleAssignError_(reqRole, actorId){
  if (!reqRole) return '';
  var roles = readRoles_(), keys = roles.map(function(r){ return r.key; });
  if (keys.indexOf(reqRole) === -1) return 'Invalid role';
  var target = roles.find(function(r){ return r.key === reqRole; });
  if (target && target.is_super && !canEditRbac_(userRoleById_(actorId))) return 'Only an owner can assign that role';
  return '';
}
function addUser(data, userId){
  userId = gate_(userId, 'users', 'a'); if (!userId) return err('Access denied');
  if (!data.username || !data.email || !data.password) return err('Username, email & password required');
  var re = roleAssignError_(data.role || 'employee', userId); if (re) return err(re);
  var sh = getSheet(SHEETS.USERS), d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) if (d[i][U.USER] === data.username && Number(d[i][U.DEL]) !== 1) return err('Username already exists');
  var ts = getCurrentTimestamp(), id = nextUserId_();
  sh.appendRow([id, data.username, data.email, data.password, data.role || 'employee', data.status || 'active', DEFAULT_LOGO, 'light', '', ts, userId, ts, userId, 0]);
  logActivity(userId, 'user_add', SHEETS.USERS, id, 'Added user: ' + data.username);
  return ok('User added', { id: id });
}
function nextUserId_(){ var d = usersData_(), m = 0; for (var i = 1; i < d.length; i++) m = Math.max(m, Number(d[i][U.ID]) || 0); return m + 1; }

function updateUser(id, data, userId){
  userId = gate_(userId, 'users', 'e'); if (!userId) return err('Access denied');
  var tgt = userById_(id);
  if (tgt) { var tdef = roleByKey_(tgt[U.ROLE]); if (tdef && tdef.is_super && !canEditRbac_(userRoleById_(userId))) return err('Only an owner can edit an owner account'); }
  if (data.role) { var re = roleAssignError_(data.role, userId); if (re) return err(re); }
  var sh = getSheet(SHEETS.USERS), d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (d[i][U.ID] == id) {
      sh.getRange(i + 1, U.EMAIL + 1).setValue(data.email);
      if (data.password && String(data.password).trim() !== '') sh.getRange(i + 1, U.PWD + 1).setValue(data.password);
      if (data.role) sh.getRange(i + 1, U.ROLE + 1).setValue(data.role);
      if (data.status) sh.getRange(i + 1, U.STATUS + 1).setValue(data.status);
      sh.getRange(i + 1, U.UPDATED + 1).setValue(getCurrentTimestamp());
      sh.getRange(i + 1, U.UPDATED_BY + 1).setValue(userId);
      logActivity(userId, 'user_edit', SHEETS.USERS, id, 'Updated user: ' + d[i][U.USER]);
      return ok('User updated');
    }
  }
  return err('User not found');
}
function deleteUser(id, userId){
  userId = gate_(userId, 'users', 'd'); if (!userId) return err('Access denied');
  if (id == userId) return err('You cannot delete your own account');
  var sh = getSheet(SHEETS.USERS), d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (d[i][U.ID] == id) {
      sh.getRange(i + 1, U.DEL + 1).setValue(1);
      sh.getRange(i + 1, U.STATUS + 1).setValue('inactive');
      logActivity(userId, 'deletion', SHEETS.USERS, id, 'Deleted user: ' + d[i][U.USER]);
      return ok('User deleted');
    }
  }
  return err('User not found');
}

// ============== My Account / Settings ==============
function updateMyAccount(userId, form){
  userId = sess_(userId); if (!userId) return err('Not signed in');
  var sh = getSheet(SHEETS.USERS), d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (d[i][U.ID] == userId) {
      if (String(form.CurrentPassword) !== String(d[i][U.PWD])) return err('Current password is incorrect');
      sh.getRange(i + 1, U.EMAIL + 1).setValue(form.Email);
      if (form.NewPassword && String(form.NewPassword).trim() !== '') sh.getRange(i + 1, U.PWD + 1).setValue(form.NewPassword);
      sh.getRange(i + 1, U.UPDATED + 1).setValue(getCurrentTimestamp());
      sh.getRange(i + 1, U.UPDATED_BY + 1).setValue(userId);
      logActivity(userId, 'account_update', SHEETS.USERS, userId, 'Updated own profile');
      return ok('Account updated');
    }
  }
  return err('User not found');
}
function getUserSettings(userId){
  userId = sess_(userId); if (!userId) return err('Not signed in');
  var u = userById_(userId);
  if (!u) return err('User not found');
  return ok('', { settings: { profileImage: u[U.IMG] || '', themeMode: u[U.THEME] || 'light', customColors: u[U.COLORS] || '' } });
}
function updateUserSettings(userId, settings){
  userId = sess_(userId); if (!userId) return err('Not signed in');
  var sh = getSheet(SHEETS.USERS), d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (d[i][U.ID] == userId) {
      if (settings.profileImage !== undefined) sh.getRange(i + 1, U.IMG + 1).setValue(settings.profileImage);
      if (settings.themeMode !== undefined) sh.getRange(i + 1, U.THEME + 1).setValue(settings.themeMode);
      if (settings.customColors !== undefined) sh.getRange(i + 1, U.COLORS + 1).setValue(settings.customColors);
      sh.getRange(i + 1, U.UPDATED + 1).setValue(getCurrentTimestamp());
      return ok('Settings updated');
    }
  }
  return err('User not found');
}

// ============== Drive uploads ==============
function getAssetsFolder(){
  try {
    var folders = DriveApp.getFoldersByName(ASSETS_FOLDER_NAME);
    if (folders.hasNext()) return folders.next();
    var folder = DriveApp.createFolder(ASSETS_FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  } catch (e) { Logger.log('assets folder err: ' + e); return null; }
}
function uploadAsset_(base64Data, filename, uid){
  var folder = getAssetsFolder();
  if (!folder) return err('Failed to create ASSETS folder');
  var b64 = base64Data.split(',')[1] || base64Data;
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', filename);
  var file = folder.createFile(blob);
  file.setName(uid + '_' + new Date().getTime() + '_' + filename);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fileId = file.getId();
  return ok('', { fileId: fileId, fileUrl: 'https://lh3.google.com/u/0/d/' + fileId, fileName: file.getName() });
}
function uploadProfileImage(base64Data, filename, userId){
  try {
    var uid = sess_(userId); if (!uid) return err('Not signed in');
    return uploadAsset_(base64Data, filename, uid);
  } catch (e) { return err('Upload error: ' + e); }
}
// gated shop logo upload — settings editors only
function uploadShopLogo(base64Data, filename, userId){
  var uid = gate_(userId, 'settings', 'e'); if (!uid) return err('Access denied');
  try { return uploadAsset_(base64Data, filename, uid); } catch (e) { return err('Upload error: ' + e); }
}
// product image upload — anyone who can add or edit products
function uploadProductImage(base64Data, filename, userId){
  var uid = sess_(userId);
  if (!uid || !(hasPerm_(userRoleById_(uid), 'products', 'a') || hasPerm_(userRoleById_(uid), 'products', 'e'))) return err('Access denied');
  try { return uploadAsset_(base64Data, filename, uid); } catch (e) { return err('Upload error: ' + e); }
}
// seller ID card image upload — anyone who can buy or edit used phones
function uploadUsedIdImage(base64Data, filename, userId){
  var uid = sess_(userId);
  if (!uid || !(hasPerm_(userRoleById_(uid), 'used_phones', 'a') || hasPerm_(userRoleById_(uid), 'used_phones', 'e'))) return err('Access denied');
  try { return uploadAsset_(base64Data, filename, uid); } catch (e) { return err('Upload error: ' + e); }
}

// ============== Suppliers ==============
function getSuppliers(userId){
  userId = gate_(userId, 'suppliers', 'v'); if (!userId) return err('Access denied');
  return ok('', { data: JDB.readAll(SHEETS.SUPPLIERS).filter(function(r){ return !r.deleted; }).reverse() });
}
// shared supplier fields (add + update)
function supplierFields_(d){
  return {
    name:String(d.name||'').trim(), company:d.company||'', contact_person:d.contact_person||'',
    phone:d.phone||'', email:d.email||'', website:d.website||'',
    address:d.address||'', city:d.city||'', country:d.country||'', tax_id:d.tax_id||'',
    payment_terms:d.payment_terms||'', bank_name:d.bank_name||'', bank_account:d.bank_account||'',
    opening_balance:round2(d.opening_balance), category:d.category||'', status:d.status||'active', notes:d.notes||''
  };
}
function addSupplier(d, userId){
  userId = gate_(userId, 'suppliers', 'a'); if (!userId) return err('Access denied');
  if (!d.name) return err('Supplier name required');
  var rec = JDB.insert(SHEETS.SUPPLIERS, supplierFields_(d));
  logActivity(userId, 'supplier_add', SHEETS.SUPPLIERS, rec.id, 'Added supplier: ' + rec.name);
  return ok('Supplier added', { id: rec.id });
}
function updateSupplier(id, d, userId){
  userId = gate_(userId, 'suppliers', 'e'); if (!userId) return err('Access denied');
  var cur = JDB.byId(SHEETS.SUPPLIERS, id);
  if (!cur || cur.deleted) return err('Supplier not found');
  JDB.update(SHEETS.SUPPLIERS, id, supplierFields_(d));
  logActivity(userId, 'supplier_edit', SHEETS.SUPPLIERS, id, 'Updated supplier: ' + d.name);
  return ok('Supplier updated');
}
function deleteSupplier(id, userId){
  userId = gate_(userId, 'suppliers', 'd'); if (!userId) return err('Access denied');
  var inUse = JDB.readAll(SHEETS.PRODUCTS).some(function(p){ return !p.deleted && p.supplier_id == id; });
  if (inUse) return err('Supplier has products — reassign or remove them first');
  JDB.remove(SHEETS.SUPPLIERS, id);
  logActivity(userId, 'deletion', SHEETS.SUPPLIERS, id, 'Deleted supplier');
  return ok('Supplier deleted');
}

// ============== Products ==============
function getProducts(userId){
  userId = gate_(userId, 'products', 'v'); if (!userId) return err('Access denied');
  var sup = supplierMap_();
  var data = JDB.readAll(SHEETS.PRODUCTS).filter(function(r){ return !r.deleted; }).map(function(p){
    p.supplier_name = sup[p.supplier_id] || '—';
    p.low = Number(p.stock_qty) <= Number(p.low_stock_alert || 0);
    return p;
  }).reverse();
  return ok('', { data: data });
}
function supplierMap_(){ var m = {}; JDB.readAll(SHEETS.SUPPLIERS).forEach(function(s){ m[s.id] = s.name; }); return m; }
function productMap_(){ var m = {}; JDB.readAll(SHEETS.PRODUCTS).forEach(function(p){ m[p.id] = p; }); return m; }

// shared product descriptive fields (stock_qty managed separately via add/adjust)
function productFields_(d, cfg){
  cfg = cfg || settings_();
  // images = array of URLs; image_url stays = first (back-compat with table/POS/CSV)
  var imgs = (Array.isArray(d.images) ? d.images : (d.image_url ? [d.image_url] : []))
    .map(function(s){ return String(s || '').trim(); }).filter(Boolean);
  return {
    supplier_id: Number(d.supplier_id)||0, name:String(d.name||'').trim(), sku:d.sku||'',
    category:d.category||'phone', barcode:d.barcode||'', brand:d.brand||'', model:d.model||'',
    color:d.color||'', storage:d.storage||'', ram:d.ram||'', condition:d.condition||'new',
    purchase_price:round2(d.purchase_price), sale_price:round2(d.sale_price), mrp:round2(d.mrp),
    vat_rate: (d.vat_rate != null && d.vat_rate !== '') ? round2(d.vat_rate) : round2(cfg.vat_default || 21),
    tax_inclusive: d.tax_inclusive ? 1 : 0, discount_max:round2(d.discount_max),
    low_stock_alert: parseInt(d.low_stock_alert) || parseInt(cfg.low_stock_default || 5),
    reorder_qty: parseInt(d.reorder_qty)||0, unit:d.unit||'pcs',
    shelf_location:d.shelf_location||'', supplier_sku:d.supplier_sku||'', weight:d.weight||'',
    warranty_months: parseInt(d.warranty_months)||0, description:d.description||'',
    images: imgs, image_url: imgs[0] || '', status:d.status||'active'
  };
}
function addProduct(d, userId){
  userId = gate_(userId, 'products', 'a'); if (!userId) return err('Access denied');
  if (!d.name || !d.supplier_id) return err('Name & supplier required');
  if (d.barcode && JDB.readAll(SHEETS.PRODUCTS).some(function(p){ return !p.deleted && p.barcode && p.barcode === d.barcode; })) return err('Barcode already exists');
  var cfg = settings_(), qty = parseInt(d.stock_qty) || 0;
  var fields = productFields_(d, cfg); fields.stock_qty = qty;
  var rec = JDB.insert(SHEETS.PRODUCTS, fields);
  if (qty > 0) JDB.insert(SHEETS.INVENTORY, { product_id: rec.id, user_id: userId, movement_type:'purchase', qty_change: qty, note:'Opening stock' });
  logActivity(userId, 'product_add', SHEETS.PRODUCTS, rec.id, 'Added product: ' + rec.name);
  return ok('Product added', { id: rec.id });
}
function updateProduct(id, d, userId){
  userId = gate_(userId, 'products', 'e'); if (!userId) return err('Access denied');
  var cur = JDB.byId(SHEETS.PRODUCTS, id);
  if (!cur || cur.deleted) return err('Product not found');
  if (d.barcode && JDB.readAll(SHEETS.PRODUCTS).some(function(p){ return !p.deleted && p.id != id && p.barcode && p.barcode === d.barcode; })) return err('Barcode already exists');
  JDB.update(SHEETS.PRODUCTS, id, productFields_(d));
  logActivity(userId, 'product_edit', SHEETS.PRODUCTS, id, 'Updated product: ' + d.name);
  return ok('Product updated');
}
function deleteProduct(id, userId){
  userId = gate_(userId, 'products', 'd'); if (!userId) return err('Access denied');
  JDB.remove(SHEETS.PRODUCTS, id);
  logActivity(userId, 'deletion', SHEETS.PRODUCTS, id, 'Deleted product');
  return ok('Product deleted');
}
// stock adjustment — logged as inventory movement
function adjustStock(id, qtyChange, note, userId){
  userId = gate_(userId, 'inventory', 'a'); if (!userId) return err('Access denied');
  var p = JDB.byId(SHEETS.PRODUCTS, id);
  if (!p || p.deleted) return err('Product not found');
  var delta = parseInt(qtyChange) || 0;
  if (!delta) return err('Quantity change required');
  if (Number(p.stock_qty) + delta < 0) return err('Adjustment would make stock negative');
  JDB.update(SHEETS.PRODUCTS, id, { stock_qty: Number(p.stock_qty) + delta });
  JDB.insert(SHEETS.INVENTORY, { product_id: id, user_id: userId, movement_type:'adjustment', qty_change: delta, note: note || '' });
  logActivity(userId, 'inventory_adjustment', SHEETS.PRODUCTS, id, 'Stock ' + (delta > 0 ? '+' : '') + delta + ' (' + p.name + ')');
  return ok('Stock adjusted');
}

// ============== Customers ==============
function getCustomers(userId){
  userId = gate_(userId, 'customers', 'v'); if (!userId) return err('Access denied');
  var due = {};
  JDB.readAll(SHEETS.SALES).forEach(function(s){ if (!s.deleted && s.customer_id) due[s.customer_id] = round2((due[s.customer_id] || 0) + Number(s.due_amount || 0)); });
  JDB.readAll(SHEETS.REPAIRS).forEach(function(r){ if (!r.deleted && r.customer_id) due[r.customer_id] = round2((due[r.customer_id] || 0) + Number(r.remaining_amount || 0)); });
  return ok('', { data: JDB.readAll(SHEETS.CUSTOMERS).filter(function(r){ return !r.deleted; }).map(function(c){ c.outstanding = round2(due[c.id] || 0); return c; }).reverse() });
}
// shared customer fields (add + update)
function customerFields_(d){
  return {
    name:String(d.name||'').trim(), phone:String(d.phone||'').trim(), email:d.email||'',
    company:d.company||'', address:d.address||'', city:d.city||'', country:d.country||'',
    tax_id:d.tax_id||'', customer_type:d.customer_type||'retail',
    credit_limit:round2(d.credit_limit), loyalty_points:parseInt(d.loyalty_points)||0,
    dob:d.dob||'', gender:d.gender||'', status:d.status||'active', notes:d.notes||''
  };
}
function addCustomer(d, userId){
  userId = gate_(userId, 'customers', 'a'); if (!userId) return err('Access denied');
  if (!d.name || !d.phone) return err('Name & phone required');
  var rec = JDB.insert(SHEETS.CUSTOMERS, customerFields_(d));
  logActivity(userId, 'customer_add', SHEETS.CUSTOMERS, rec.id, 'Added customer: ' + rec.name);
  return ok('Customer added', { id: rec.id, data: rec });
}
function updateCustomer(id, d, userId){
  userId = gate_(userId, 'customers', 'e'); if (!userId) return err('Access denied');
  var cur = JDB.byId(SHEETS.CUSTOMERS, id);
  if (!cur || cur.deleted) return err('Customer not found');
  JDB.update(SHEETS.CUSTOMERS, id, customerFields_(d));
  logActivity(userId, 'customer_edit', SHEETS.CUSTOMERS, id, 'Updated customer: ' + d.name);
  return ok('Customer updated');
}
function deleteCustomer(id, userId){
  userId = gate_(userId, 'customers', 'd'); if (!userId) return err('Access denied');
  JDB.remove(SHEETS.CUSTOMERS, id);
  logActivity(userId, 'deletion', SHEETS.CUSTOMERS, id, 'Deleted customer');
  return ok('Customer deleted');
}

// ============== Inventory Movements ==============
function getInventoryMovements(userId, from, to){
  userId = gate_(userId, 'inventory', 'v'); if (!userId) return err('Access denied');
  var pm = productMap_(), users = userNameMap_();
  var rows = (from || to) ? JDB.readRange(SHEETS.INVENTORY, from, to) : JDB.readAll(SHEETS.INVENTORY);
  var data = rows.map(function(m){
    m.product_name = pm[m.product_id] ? pm[m.product_id].name : '—';
    m.user_name = users[m.user_id] || '—';
    return m;
  }).reverse();
  return ok('', { data: data });
}
function userNameMap_(){ var m = {}, d = usersData_(); for (var i = 1; i < d.length; i++) m[d[i][U.ID]] = d[i][U.USER]; return m; }
function getLowStockProducts(userId){
  userId = gate_(userId, 'products', 'v'); if (!userId) return err('Access denied');
  var data = JDB.readAll(SHEETS.PRODUCTS).filter(function(p){ return !p.deleted && Number(p.stock_qty) <= Number(p.low_stock_alert || 0); });
  return ok('', { data: data });
}

// ============== POS / Sales ==============
function getSales(userId, from, to){
  userId = gate_(userId, 'pos', 'v'); if (!userId) return err('Access denied');
  var cm = customerNameMap_(), um = userNameMap_();
  var rows = (from || to) ? JDB.readRange(SHEETS.SALES, from, to) : JDB.readAll(SHEETS.SALES);
  var data = rows.filter(function(s){ return !s.deleted; }).map(function(s){
    s.customer_name = s.customer_id ? (cm[s.customer_id] || '—') : 'Walk-in';
    s.cashier_name = um[s.user_id] || '—';
    return s;
  }).reverse();
  return ok('', { data: data });
}
function customerNameMap_(){ var m = {}; JDB.readAll(SHEETS.CUSTOMERS).forEach(function(c){ m[c.id] = c.name; }); return m; }
function getSale(id, userId){
  userId = gate_(userId, 'pos', 'v'); if (!userId) return err('Access denied');
  var s = JDB.byId(SHEETS.SALES, id);
  if (!s) return err('Sale not found');
  return ok('', { data: s });
}
// items: [{product_id, qty, unit_price?}] — prices NET, VAT per line; whole-order discount re-apportions VAT
function createSale(d, userId){
  userId = gate_(userId, 'pos', 'a'); if (!userId) return err('Access denied');
  var items = d.items || [];
  if (!items.length) return err('Add at least one item');
  // lock whole read-check-decrement so two cashiers can't oversell the last unit
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return err('System busy — please retry');
  try {
    var cfg = settings_(), pm = productMap_(), lines = [], subtotal = 0, vatTotal = 0, need = {}, overrides = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i], p = pm[it.product_id];
      if (!p || p.deleted) return err('Product not found in cart');
      var qty = parseInt(it.qty) || 0;
      if (qty <= 0) return err('Invalid qty for ' + p.name);
      need[p.id] = (need[p.id] || 0) + qty; // aggregate dup lines vs total stock
      if (Number(p.stock_qty) < need[p.id]) return err('Not enough stock for ' + p.name + ' (have ' + p.stock_qty + ')');
      var list = round2(p.sale_price);
      var unit = (it.unit_price != null && it.unit_price !== '') ? round2(it.unit_price) : list;
      if (unit > list) unit = list; // never above list price
      var floor = Number(p.discount_max) > 0 ? round2(list * (1 - Number(p.discount_max) / 100)) : 0;
      if (unit < floor) unit = floor; // respect product max discount
      if (unit !== list) overrides.push(p.name + ' ' + fmtMoney_(unit, cfg) + '/' + fmtMoney_(list, cfg));
      var rate = (String(cfg.enable_vat) === '0') ? 0 : Number(p.vat_rate); // VAT toggle
      var net = round2(unit * qty), vat = round2(net * rate / 100);
      subtotal = round2(subtotal + net); vatTotal = round2(vatTotal + vat);
      lines.push({ product_id: p.id, name: p.name, qty: qty, unit_price: unit, unit_cost: round2(p.purchase_price),
        vat_rate: rate, vat_amount: vat, line_total: round2(net + vat) });
    }
    var gross = round2(subtotal + vatTotal);
    var discount = round2(d.discount); if (discount < 0) discount = 0; if (discount > gross) discount = gross;
    var total = round2(gross - discount);
    var vatPortion = gross > 0 ? round2(discount * vatTotal / gross) : 0; // VAT share of discount
    var vatNet = round2(vatTotal - vatPortion);                           // real VAT owed after discount
    // tender waterfall — points, then store credit, then cash (TENDERS, not discounts; total/VAT unchanged)
    var loyOn = String(cfg.loyalty_enabled == null ? '1' : cfg.loyalty_enabled) === '1';
    var earnPer = Number(cfg.loyalty_earn_per) || 0, ptVal = Number(cfg.loyalty_point_value) || 0;
    var cust = d.customer_id ? JDB.byId(SHEETS.CUSTOMERS, d.customer_id) : null;
    var reqPts = loyOn ? (parseInt(d.redeem_points) || 0) : 0;
    var reqCredit = round2(d.apply_store_credit); if (reqCredit < 0) reqCredit = 0;
    if ((reqPts > 0 || reqCredit > 0) && (!cust || cust.deleted)) return err('Select a customer to use points or store credit');
    var ptBal = cust ? Number(cust.loyalty_points) || 0 : 0;
    var ptCap = ptVal > 0 ? Math.floor(total / ptVal) : 0;               // never redeem more value than the bill
    var redeemPts = Math.max(0, Math.min(reqPts, ptBal, ptCap));
    var redeemValue = round2(redeemPts * ptVal);
    var dueAfterPts = round2(total - redeemValue);
    var creditBal = cust ? Number(cust.store_credit) || 0 : 0;
    var creditApplied = round2(Math.min(reqCredit, creditBal, dueAfterPts));
    var dueAfterCredit = round2(dueAfterPts - creditApplied);
    var cashPaid = (d.amount_paid != null && d.amount_paid !== '') ? round2(d.amount_paid) : dueAfterCredit;
    var changeGiven = round2(Math.max(0, cashPaid - dueAfterCredit));     // change only ever from cash
    var cashApplied = round2(cashPaid - changeGiven);
    var amountPaid = round2(redeemValue + creditApplied + cashApplied);
    var dueAmount = round2(Math.max(0, total - amountPaid));
    var payStatus = dueAmount <= 0 ? 'paid' : (amountPaid <= 0 ? 'unpaid' : 'partial');
    var earned = (cust && loyOn && earnPer > 0) ? Math.floor(round2(total - redeemValue) / earnPer) : 0; // not on points-funded spend
    var sale = JDB.insert(SHEETS.SALES, {
      user_id: userId, customer_id: d.customer_id || null, subtotal: subtotal,
      vat_amount: vatNet, vat_gross: vatTotal, net_amount: round2(total - vatNet),
      discount: discount, total: total, amount_paid: amountPaid, change_given: changeGiven,
      due_amount: dueAmount, payment_status: payStatus,
      payment_method: d.payment_method || 'cash', notes: d.notes || '', receipt_printed: 0,
      points_earned: earned, points_redeemed: redeemPts, redeem_value: redeemValue, store_credit_applied: creditApplied,
      returned_total: 0, returned_vat: 0, returned_cogs_restocked: 0, return_status: 'none', items: lines
    });
    JDB.update(SHEETS.SALES, sale.id, { invoice_no: (cfg.invoice_prefix || 'INV-') + padNo_(sale.id) });
    sale.invoice_no = (cfg.invoice_prefix || 'INV-') + padNo_(sale.id);
    if (cust) JDB.update(SHEETS.CUSTOMERS, cust.id, {                     // atomic loyalty + credit balance update
      loyalty_points: Math.max(0, ptBal - redeemPts + earned), store_credit: round2(creditBal - creditApplied)
    });
    // decrement stock once per product (aggregated) + movement
    Object.keys(need).forEach(function(pid){
      var p = pm[pid];
      JDB.update(SHEETS.PRODUCTS, p.id, { stock_qty: Number(p.stock_qty) - need[pid] });
      JDB.insert(SHEETS.INVENTORY, { product_id: p.id, user_id: userId, movement_type:'sale', qty_change: -need[pid], note:'Sale #' + sale.id });
    });
    logActivity(userId, 'sale', SHEETS.SALES, sale.id, 'Sale ' + fmtMoney_(total, cfg) + ' (' + lines.length + ' line' + (lines.length > 1 ? 's' : '') + ')' + (overrides.length ? ' · price override: ' + overrides.join(', ') : '') + (earned ? ' · +' + earned + 'pts' : '') + (redeemPts ? ' · −' + redeemPts + 'pts (' + fmtMoney_(redeemValue, cfg) + ')' : '') + (creditApplied ? ' · credit ' + fmtMoney_(creditApplied, cfg) : ''));
    return ok('Sale completed', { id: sale.id, data: sale });
  } finally { lock.releaseLock(); }
}
// VOID — same-day cancellation only, blocked once returns exist (use Returns for the rest)
function deleteSale(id, userId){
  userId = gate_(userId, 'pos', 'd'); if (!userId) return err('Access denied');
  var s = JDB.byId(SHEETS.SALES, id);
  if (!s || s.deleted) return err('Sale not found');
  if (s.return_status && s.return_status !== 'none') return err('This sale has returns — void is blocked. Use Returns to reverse remaining items.');
  var vh = parseInt(settings_().void_window_hours || '24') || 24;
  if ((Date.now() - new Date(s.created).getTime()) / 36e5 > vh) return err('Void is only for same-day cancellation. Use Returns for older sales.');
  // return stock
  (s.items || []).forEach(function(l){
    var p = JDB.byId(SHEETS.PRODUCTS, l.product_id);
    if (p) { JDB.update(SHEETS.PRODUCTS, p.id, { stock_qty: Number(p.stock_qty) + l.qty });
      JDB.insert(SHEETS.INVENTORY, { product_id: p.id, user_id: userId, movement_type:'return', qty_change: l.qty, note:'Void sale #' + id }); }
  });
  // reverse loyalty + store credit applied on the sale
  if (s.customer_id) {
    var c = JDB.byId(SHEETS.CUSTOMERS, s.customer_id);
    if (c) JDB.update(SHEETS.CUSTOMERS, c.id, {
      loyalty_points: Math.max(0, (Number(c.loyalty_points) || 0) - Number(s.points_earned || 0) + Number(s.points_redeemed || 0)),
      store_credit: round2((Number(c.store_credit) || 0) + Number(s.store_credit_applied || 0))
    });
  }
  JDB.update(SHEETS.SALES, id, { deleted: 1 });
  logActivity(userId, 'deletion', SHEETS.SALES, id, 'Voided sale #' + id + (s.customer_id ? ' · loyalty reversed' : ''));
  return ok('Sale voided & stock restored');
}
function markReceiptPrinted(id, userId){ userId = gate_(userId, 'pos', 'v'); if (!userId) return err('Access denied'); JDB.update(SHEETS.SALES, id, { receipt_printed: 1 }); logActivity(userId, 'print', SHEETS.SALES, id, 'Printed receipt/invoice for sale #' + id); return ok('Marked'); }
// ---- Returns / Refunds ----
function getReturns(userId, from, to){
  userId = gate_(userId, 'pos', 'v'); if (!userId) return err('Access denied');
  var cm = customerNameMap_(), um = userNameMap_();
  var rows = (from || to) ? JDB.readRange(SHEETS.RETURNS, from, to) : JDB.readAll(SHEETS.RETURNS);
  var data = rows.filter(function(r){ return !r.deleted; }).map(function(r){
    r.customer_name = r.customer_id ? (cm[r.customer_id] || '—') : 'Walk-in';
    r.staff_name = um[r.user_id] || '—';
    return r;
  }).reverse();
  return ok('', { data: data });
}
// payload: { items:[{product_id, qty}], reason, refund_method, restock } — refund mirrors sale VAT/discount math
function createReturn(saleId, payload, userId){
  userId = gate_(userId, 'pos', 'e'); if (!userId) return err('Access denied');
  payload = payload || {};
  var items = payload.items || [], method = payload.refund_method || 'cash', restock = payload.restock ? 1 : 0;
  if (!items.length) return err('Select at least one item to return');
  if (['cash','card','bank_transfer','store_credit'].indexOf(method) === -1) return err('Invalid refund method');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return err('System busy — please retry');
  try {
    var cfg = settings_(), sale = JDB.byId(SHEETS.SALES, saleId);
    if (!sale) return err('Sale not found');
    if (sale.deleted) return err('This sale was voided — returns do not apply');
    if (sale.return_status === 'full') return err('Sale already fully returned');
    if (method === 'store_credit' && !sale.customer_id) return err('Store credit needs a customer on the sale');
    var lineOf = {}; (sale.items || []).forEach(function(l){ lineOf[l.product_id] = l; });
    var gross = round2(Number(sale.subtotal) + Number(sale.vat_gross)), D = Number(sale.discount) || 0;
    var rSub = 0, rVatGross = 0, returnedCogs = 0, rLines = [], touched = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i], L = lineOf[it.product_id];
      if (!L) return err('Item not in this sale');
      var q = parseInt(it.qty) || 0; if (q <= 0) continue;
      var remaining = Number(L.qty) - Number(L.returned_qty || 0);
      if (q > remaining) return err('Cannot return ' + q + ' of ' + L.name + ' — only ' + remaining + ' left');
      var net = round2(L.unit_price * q), vat = round2(net * Number(L.vat_rate) / 100), cogs = round2(Number(L.unit_cost) * q);
      rSub = round2(rSub + net); rVatGross = round2(rVatGross + vat); returnedCogs = round2(returnedCogs + cogs);
      rLines.push({ product_id: L.product_id, name: L.name, qty: q, unit_price: L.unit_price, unit_cost: Number(L.unit_cost),
        vat_rate: Number(L.vat_rate), _net: net, _vat: vat, _gross: round2(net + vat) });
      touched[L.product_id] = q;
    }
    if (!rLines.length) return err('Nothing to return');
    var rGross = round2(rSub + rVatGross);
    var discountShare = gross > 0 ? round2(D * rGross / gross) : 0;
    var refundVatPortion = rGross > 0 ? round2(discountShare * rVatGross / rGross) : 0;
    var refundVat = round2(rVatGross - refundVatPortion);
    var refundTotal = round2(rGross - discountShare);
    // full-return clamp — zero penny drift across partials
    var fully = (sale.items || []).every(function(l){ return Number(l.returned_qty || 0) + (touched[l.product_id] || 0) >= Number(l.qty); });
    if (fully) {
      refundTotal = round2(Number(sale.total) - Number(sale.returned_total || 0));
      refundVat = round2(Number(sale.vat_amount) - Number(sale.returned_vat || 0));
    }
    var refundSub = round2(refundTotal - refundVat), acc = 0;
    rLines.forEach(function(l, idx){
      l.refund_total = (idx === rLines.length - 1) ? round2(refundTotal - acc) : round2(refundTotal * l._gross / rGross);
      acc = round2(acc + l.refund_total);
      l.refund_vat = round2(l._vat * (refundVat / (rVatGross || 1)));
      l.refund_net = round2(l.refund_total - l.refund_vat);
      l.restocked = restock; delete l._net; delete l._vat; delete l._gross;
    });
    var due = Number(sale.due_amount) || 0, dueApplied = round2(Math.min(refundTotal, due));
    var cashOut = round2(refundTotal - dueApplied), newDue = round2(due - dueApplied);
    var newPaid = Number(sale.amount_paid) || 0;
    var payStatus = newDue <= 0 ? 'paid' : (newPaid <= 0 ? 'unpaid' : 'partial');
    if (restock) Object.keys(touched).forEach(function(pid){
      var p = JDB.byId(SHEETS.PRODUCTS, pid);
      if (p && !p.deleted) {
        JDB.update(SHEETS.PRODUCTS, pid, { stock_qty: Number(p.stock_qty) + touched[pid] });
        JDB.insert(SHEETS.INVENTORY, { product_id: Number(pid), user_id: userId, movement_type:'return', qty_change: touched[pid], note:'Return on sale #' + saleId });
      }
    });
    var rec = JDB.insert(SHEETS.RETURNS, {
      sale_id: saleId, invoice_no: sale.invoice_no, customer_id: sale.customer_id || null, user_id: userId,
      reason: String(payload.reason || ''), refund_method: method, restock: restock, items: rLines,
      refund_subtotal: refundSub, refund_vat: refundVat, refund_total: refundTotal, returned_cogs: returnedCogs,
      discount_share: discountShare, due_applied: dueApplied, cash_refunded: cashOut
    });
    JDB.update(SHEETS.RETURNS, rec.id, { return_no: (cfg.return_prefix || 'RET-') + padNo_(rec.id) });
    rec.return_no = (cfg.return_prefix || 'RET-') + padNo_(rec.id);
    if (method === 'store_credit' && sale.customer_id) {
      var c2 = JDB.byId(SHEETS.CUSTOMERS, sale.customer_id);
      if (c2) JDB.update(SHEETS.CUSTOMERS, sale.customer_id, { store_credit: round2(Number(c2.store_credit || 0) + cashOut) });
    }
    var newItems = (sale.items || []).map(function(l){
      var add = touched[l.product_id] || 0;
      return add ? Object.assign({}, l, { returned_qty: Number(l.returned_qty || 0) + add }) : l;
    });
    var fullyReturned = newItems.every(function(l){ return Number(l.returned_qty || 0) >= Number(l.qty); });
    var anyReturned = newItems.some(function(l){ return Number(l.returned_qty || 0) > 0; });
    JDB.update(SHEETS.SALES, saleId, {
      items: newItems,
      returned_total: round2(Number(sale.returned_total || 0) + refundTotal),
      returned_vat: round2(Number(sale.returned_vat || 0) + refundVat),
      returned_cogs_restocked: round2(Number(sale.returned_cogs_restocked || 0) + (restock ? returnedCogs : 0)),
      return_status: fullyReturned ? 'full' : (anyReturned ? 'partial' : 'none'),
      due_amount: newDue, payment_status: payStatus
    });
    logActivity(userId, 'return', SHEETS.RETURNS, rec.id, 'Refund ' + fmtMoney_(cashOut, cfg) + ' on ' + sale.invoice_no + ' · ' + method + (restock ? ' · restocked' : ' · no restock') + (dueApplied > 0 ? ' · ' + fmtMoney_(dueApplied, cfg) + ' cleared due' : ''));
    return ok('Refund processed', { id: rec.id, data: rec, refund_total: refundTotal, cash_refunded: cashOut });
  } finally { lock.releaseLock(); }
}

// ---- Customer payments + credit ledger ----
// core payment logic, no lock/gate of its own — callers (recordSalePayment, recordInstallmentPayment)
// hold their own lock so this never nests LockService.getScriptLock()
function applySalePayment_(s, amount, method, userId, note){
  var due = round2(s.due_amount); if (due <= 0) return { error: 'Already settled' };
  var amt = round2(amount); if (!(amt > 0)) return { error: 'Enter a valid amount' };
  amt = round2(Math.min(amt, due)); method = method || 'cash';
  if (method === 'store_credit') {
    if (!s.customer_id) return { error: 'No customer on this sale for store credit' };
    var c = JDB.byId(SHEETS.CUSTOMERS, s.customer_id);
    var cap = round2(Math.min(amt, Number(c && c.store_credit || 0)));
    if (cap <= 0) return { error: 'No store credit available' };
    amt = cap; JDB.update(SHEETS.CUSTOMERS, c.id, { store_credit: round2((Number(c.store_credit) || 0) - amt) });
  }
  var newPaid = round2(Number(s.amount_paid) + amt), newDue = round2(Math.max(0, Number(s.total) - newPaid));
  JDB.update(SHEETS.SALES, s.id, { amount_paid: newPaid, due_amount: newDue, payment_status: newDue <= 0 ? 'paid' : (newPaid <= 0 ? 'unpaid' : 'partial') });
  JDB.insert(SHEETS.PAYMENTS, { customer_id: s.customer_id || null, ref_type: 'sale', ref_id: s.id, amount: amt, method: method, note: note || '', user_id: userId });
  logActivity(userId, 'payment', SHEETS.PAYMENTS, s.id, 'Sale #' + s.id + ' payment ' + fmtMoney_(amt) + ' (' + method + ')' + (note ? ' · ' + note : ''));
  reconcileInstallments_(s.id, newDue);
  return { applied: amt, due: newDue };
}
// true up any pending Installments rows against the sale's real due_amount — runs on every
// sale payment (direct POS/ledger payment or an installment mirror) so the two never drift.
// consumes the gap oldest-due-first; no-op when installments already match (normal mirror path)
function reconcileInstallments_(saleId, saleDue){
  var pend = JDB.readAll(SHEETS.INSTALLMENTS).filter(function(r){ return !r.deleted && r.sale_id == saleId && r.status === 'pending'; })
    .sort(function(a, b){ return a.due_date < b.due_date ? -1 : (a.due_date > b.due_date ? 1 : 0); });
  if (!pend.length) return;
  var schedRemaining = round2(pend.reduce(function(sum, r){ return sum + (Number(r.amount) - Number(r.paid_amount || 0)); }, 0));
  var gap = round2(schedRemaining - round2(saleDue)); // sale paid down more than installments reflect
  if (gap <= 0) return;
  pend.forEach(function(r){
    if (gap <= 0) return;
    var room = round2(Number(r.amount) - Number(r.paid_amount || 0)), apply = round2(Math.min(room, gap));
    if (apply <= 0) return;
    gap = round2(gap - apply);
    var newPaid = round2(Number(r.paid_amount || 0) + apply), status = newPaid >= round2(r.amount) ? 'paid' : 'pending';
    JDB.update(SHEETS.INSTALLMENTS, r.id, { paid_amount: newPaid, status: status, paid_date: status === 'paid' ? ymd(new Date()) : (r.paid_date || '') });
  });
}
function recordSalePayment(saleId, amount, method, userId){
  userId = gate_(userId, 'pos', 'e'); if (!userId) return err('Access denied');
  var lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return err('System busy — please retry');
  try {
    var s = JDB.byId(SHEETS.SALES, saleId);
    if (!s || s.deleted) return err('Sale not found');
    var r = applySalePayment_(s, amount, method, userId);
    if (r.error) return err(r.error);
    return ok('Payment recorded', { due: r.due });
  } finally { lock.releaseLock(); }
}
function recordRepairPayment(repairId, amount, method, userId){
  userId = gate_(userId, 'repairs', 'e'); if (!userId) return err('Access denied');
  var lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return err('System busy — please retry');
  try {
    var r = JDB.byId(SHEETS.REPAIRS, repairId);
    if (!r || r.deleted) return err('Repair not found');
    var remaining = round2(r.remaining_amount); if (remaining <= 0) return err('Already settled');
    var amt = round2(amount); if (!(amt > 0)) return err('Enter a valid amount');
    amt = round2(Math.min(amt, remaining)); method = method || 'cash';
    if (method === 'store_credit') {
      if (!r.customer_id) return err('No customer on this repair for store credit');
      var c = JDB.byId(SHEETS.CUSTOMERS, r.customer_id);
      var cap = round2(Math.min(amt, Number(c && c.store_credit || 0)));
      if (cap <= 0) return err('No store credit available');
      amt = cap; JDB.update(SHEETS.CUSTOMERS, c.id, { store_credit: round2((Number(c.store_credit) || 0) - amt) });
    }
    var newPaid = round2(Number(r.paid_amount) + amt), newRemaining = round2(Math.max(0, Number(r.total_cost) - newPaid));
    JDB.update(SHEETS.REPAIRS, repairId, { paid_amount: newPaid, remaining_amount: newRemaining });
    JDB.insert(SHEETS.PAYMENTS, { customer_id: r.customer_id || null, ref_type: 'repair', ref_id: repairId, amount: amt, method: method, note: '', user_id: userId });
    logActivity(userId, 'payment', SHEETS.PAYMENTS, repairId, 'Repair #' + repairId + ' payment ' + fmtMoney_(amt) + ' (' + method + ')');
    return ok('Payment recorded', { remaining: newRemaining });
  } finally { lock.releaseLock(); }
}
function getCustomerLedger(customerId, userId){
  userId = gate_(userId, 'customers', 'v'); if (!userId) return err('Access denied');
  var c = JDB.byId(SHEETS.CUSTOMERS, customerId);
  if (!c) return err('Customer not found');
  var um = userNameMap_();
  var unpaidSales = JDB.readAll(SHEETS.SALES).filter(function(s){ return !s.deleted && s.customer_id == customerId && Number(s.due_amount) > 0; })
    .map(function(s){ return { id: s.id, invoice_no: s.invoice_no, total: round2(s.total), amount_paid: round2(s.amount_paid), due_amount: round2(s.due_amount), payment_status: s.payment_status, created: s.created }; });
  var unpaidRepairs = JDB.readAll(SHEETS.REPAIRS).filter(function(r){ return !r.deleted && r.customer_id == customerId && Number(r.remaining_amount) > 0; })
    .map(function(r){ return { id: r.id, ticket_no: r.ticket_no, device_name: r.device_name, total_cost: round2(r.total_cost), paid_amount: round2(r.paid_amount), remaining_amount: round2(r.remaining_amount), status: r.status }; });
  var payments = JDB.readAll(SHEETS.PAYMENTS).filter(function(p){ return !p.deleted && p.customer_id == customerId; }).map(function(p){ p.user_name = um[p.user_id] || '—'; return p; }).reverse();
  var outstanding = round2(unpaidSales.reduce(function(a, s){ return a + Number(s.due_amount); }, 0) + unpaidRepairs.reduce(function(a, r){ return a + Number(r.remaining_amount); }, 0));
  return ok('', { data: {
    customer: { id: c.id, name: c.name, phone: c.phone, loyalty_points: Number(c.loyalty_points) || 0, store_credit: round2(c.store_credit), credit_limit: round2(c.credit_limit) },
    outstanding: outstanding, unpaidSales: unpaidSales, unpaidRepairs: unpaidRepairs, payments: payments
  } });
}
// owner manual store-credit adjustment (atomic — never via the customer edit form)
function adjustStoreCredit(customerId, delta, reason, userId){
  userId = gate_(userId, 'customers', 'e'); if (!userId) return err('Access denied');
  var c = JDB.byId(SHEETS.CUSTOMERS, customerId);
  if (!c || c.deleted) return err('Customer not found');
  var dl = round2(delta); if (!dl) return err('Enter a non-zero amount');
  var bal = round2(Number(c.store_credit || 0) + dl); if (bal < 0) bal = 0;
  JDB.update(SHEETS.CUSTOMERS, customerId, { store_credit: bal });
  logActivity(userId, 'store_credit_adjust', SHEETS.CUSTOMERS, customerId, 'Store credit ' + (dl > 0 ? '+' : '') + fmtMoney_(dl) + (reason ? ' · ' + reason : ''));
  return ok('Store credit updated', { store_credit: bal });
}
// full customer footprint for the 360 / View modal
function getCustomer360(customerId, userId){
  userId = gate_(userId, 'customers', 'v'); if (!userId) return err('Access denied');
  var c = JDB.byId(SHEETS.CUSTOMERS, customerId);
  if (!c) return err('Customer not found');
  var um = userNameMap_();
  var sales = JDB.readAll(SHEETS.SALES).filter(function(s){ return !s.deleted && s.customer_id == customerId; })
    .map(function(s){ return { id:s.id, invoice_no:s.invoice_no, created:s.created, total:round2(s.total), amount_paid:round2(s.amount_paid), due_amount:round2(s.due_amount), payment_status:s.payment_status, payment_method:s.payment_method, return_status:s.return_status, items:(s.items || []) }; }).reverse();
  var repairs = JDB.readAll(SHEETS.REPAIRS).filter(function(r){ return !r.deleted && r.customer_id == customerId; })
    .map(function(r){ return { id:r.id, ticket_no:r.ticket_no, device_name:r.device_name, created:r.created, total_cost:round2(r.total_cost), paid_amount:round2(r.paid_amount), remaining_amount:round2(r.remaining_amount), status:r.status, tech_name: um[r.assigned_user_id] || '—' }; }).reverse();
  var used = JDB.readAll(SHEETS.USED_PHONES).filter(function(u){ return !u.deleted && u.customer_id == customerId; })
    .map(function(u){ return { id:u.id, device_name:u.device_name, imei:u.imei, created:u.created, purchase_price:round2(u.purchase_price), status:u.status }; }).reverse();
  var payments = JDB.readAll(SHEETS.PAYMENTS).filter(function(p){ return !p.deleted && p.customer_id == customerId; })
    .map(function(p){ p.user_name = um[p.user_id] || '—'; return p; }).reverse();
  var totalInvoiced = round2(sales.reduce(function(a, s){ return a + Number(s.total); }, 0));
  var totalPaid = round2(sales.reduce(function(a, s){ return a + Number(s.amount_paid); }, 0) + repairs.reduce(function(a, r){ return a + Number(r.paid_amount); }, 0));
  var outstanding = round2(sales.reduce(function(a, s){ return a + Number(s.due_amount); }, 0) + repairs.reduce(function(a, r){ return a + Number(r.remaining_amount); }, 0));
  var last = [].concat(sales.map(function(s){ return s.created; }), repairs.map(function(r){ return r.created; }), used.map(function(u){ return u.created; })).sort().pop() || c.created;
  return ok('', { data: {
    customer: { id:c.id, name:c.name, phone:c.phone, email:c.email, company:c.company, city:c.city, country:c.country, address:c.address, customer_type:c.customer_type, credit_limit:round2(c.credit_limit), loyalty_points:Number(c.loyalty_points) || 0, store_credit:round2(c.store_credit), status:c.status, created:c.created, notes:c.notes },
    sales:sales, repairs:repairs, used:used, payments:payments,
    kpi: { totalInvoiced:totalInvoiced, totalPaid:totalPaid, outstanding:outstanding, orders:sales.length, repairs:repairs.length, used:used.length, lastActivity:last }
  } });
}
// activity log filtered to one user (admin audit) — gated on logs OR users view
function getUserActivity(targetId, userId){
  var uid = sess_(userId); if (!uid) return err('Not signed in');
  var role = userRoleById_(uid);
  if (!(hasPerm_(role, 'logs', 'v') || hasPerm_(role, 'users', 'v'))) return err('Access denied');
  var um = userNameMap_();
  var data = JDB.readAll(SHEETS.LOGS).filter(function(l){ return l.user_id == targetId; }).map(function(l){ l.user_name = um[l.user_id] || ('#' + l.user_id); return l; }).reverse().slice(0, 200);
  return ok('', { data: data });
}
// product detail for the View modal — stock movements + where it sold
function getProductDetail(productId, userId){
  userId = gate_(userId, 'products', 'v'); if (!userId) return err('Access denied');
  var p = JDB.byId(SHEETS.PRODUCTS, productId);
  if (!p) return err('Product not found');
  var um = userNameMap_();
  var moves = JDB.readAll(SHEETS.INVENTORY).filter(function(m){ return m.product_id == productId; }).map(function(m){ m.user_name = um[m.user_id] || '—'; return m; }).reverse().slice(0, 100);
  var sold = [];
  JDB.readAll(SHEETS.SALES).forEach(function(s){ if (s.deleted) return; (s.items || []).forEach(function(l){ if (l.product_id == productId) sold.push({ invoice_no:s.invoice_no, created:s.created, qty:l.qty, unit_price:round2(l.unit_price) }); }); });
  sold = sold.reverse().slice(0, 100);
  return ok('', { data: { product:p, moves:moves, sold:sold, soldQty: sold.reduce(function(a, x){ return a + Number(x.qty); }, 0) } });
}

// ---- Expenses ----
var EXPENSE_CATS = ['rent','salaries','utilities','marketing','parts','misc'];
function expenseFields_(d){
  return {
    date: ymd(d.date || new Date()), category: String(d.category || 'misc').toLowerCase(),
    amount: round2(d.amount), payment_method: d.payment_method || 'cash',
    payee: String(d.payee || '').trim(), note: d.note || ''
  };
}
function expensesInRange_(from, to){
  return JDB.readAll(SHEETS.EXPENSES).filter(function(e){ return !e.deleted && (!from || e.date >= from) && (!to || e.date <= to); });
}
function getExpenses(userId, from, to){
  userId = gate_(userId, 'expenses', 'v'); if (!userId) return err('Access denied');
  var um = userNameMap_();
  var data = expensesInRange_(from, to).map(function(e){ e.user_name = um[e.user_id] || '—'; return e; }).reverse();
  return ok('', { data: data });
}
function addExpense(d, userId){
  userId = gate_(userId, 'expenses', 'a'); if (!userId) return err('Access denied');
  var amt = round2(d.amount); if (!(amt > 0)) return err('Amount must be greater than 0');
  var f = expenseFields_(d); f.user_id = userId;
  var rec = JDB.insert(SHEETS.EXPENSES, f);
  logActivity(userId, 'expense_add', SHEETS.EXPENSES, rec.id, 'Expense ' + fmtMoney_(amt) + ' · ' + f.category + (f.payee ? ' → ' + f.payee : ''));
  return ok('Expense added', { id: rec.id });
}
function updateExpense(id, d, userId){
  userId = gate_(userId, 'expenses', 'e'); if (!userId) return err('Access denied');
  var cur = JDB.byId(SHEETS.EXPENSES, id);
  if (!cur || cur.deleted) return err('Expense not found');
  var amt = round2(d.amount); if (!(amt > 0)) return err('Amount must be greater than 0');
  JDB.update(SHEETS.EXPENSES, id, expenseFields_(d));
  logActivity(userId, 'expense_edit', SHEETS.EXPENSES, id, 'Updated expense #' + id + ' · ' + fmtMoney_(amt));
  return ok('Expense updated');
}
function deleteExpense(id, userId){
  userId = gate_(userId, 'expenses', 'd'); if (!userId) return err('Access denied');
  var cur = JDB.byId(SHEETS.EXPENSES, id);
  if (!cur || cur.deleted) return err('Expense not found');
  JDB.remove(SHEETS.EXPENSES, id);
  logActivity(userId, 'deletion', SHEETS.EXPENSES, id, 'Deleted expense #' + id);
  return ok('Expense deleted');
}
// money fmt — honors currency symbol/position/decimals from settings
function fmtMoney_(n, cfg){
  cfg = cfg || settings_();
  var sym = cfg.currency || '€', pos = cfg.currency_position || 'before';
  var dec = (cfg.currency_decimals === 0 || cfg.currency_decimals) ? parseInt(cfg.currency_decimals) : 2;
  if (isNaN(dec)) dec = 2;
  var v = round2(n).toFixed(dec);
  return pos === 'after' ? (v + ' ' + sym) : (sym + v);
}

// ============== Repairs ==============
function getRepairs(userId, from, to){
  userId = gate_(userId, 'repairs', 'v'); if (!userId) return err('Access denied');
  var cm = customerNameMap_(), um = userNameMap_();
  var rows = (from || to) ? JDB.readRange(SHEETS.REPAIRS, from, to) : JDB.readAll(SHEETS.REPAIRS);
  var data = rows.filter(function(r){ return !r.deleted; }).map(function(r){
    r.customer_name = cm[r.customer_id] || '—';
    r.tech_name = um[r.assigned_user_id] || '—';
    return r;
  }).reverse();
  return ok('', { data: data });
}
// parts: [{product_id, qty_used}] — repair_part products, decrement stock
function createRepair(d, userId){
  userId = gate_(userId, 'repairs', 'a'); if (!userId) return err('Access denied');
  if (!d.customer_id || !d.device_name) return err('Customer & device required');
  var pm = productMap_(), parts = [], partsCost = 0, cfg = settings_();
  var partsInput = d.parts || [];
  for (var i = 0; i < partsInput.length; i++) {
    var it = partsInput[i], p = pm[it.product_id];
    if (!p || p.deleted) return err('Part not found');
    var q = parseInt(it.qty_used) || 0;
    if (q <= 0) continue;
    if (Number(p.stock_qty) < q) return err('Not enough stock for part ' + p.name);
    var cost = round2(p.purchase_price);
    parts.push({ product_id: p.id, name: p.name, qty_used: q, unit_cost: cost });
    partsCost = round2(partsCost + cost * q);
  }
  var totalCost = round2(d.total_cost), paid = round2(d.paid_amount);
  var rec = JDB.insert(SHEETS.REPAIRS, {
    customer_id: Number(d.customer_id), assigned_user_id: Number(d.assigned_user_id) || userId,
    device_name: String(d.device_name).trim(), brand: d.brand || '', model: d.model || '', color: d.color || '',
    problem_description: d.problem_description || '', diagnosis: d.diagnosis || '',
    device_imei: d.device_imei || '', passcode: d.passcode || '',
    date_received: d.date_received || ymd(new Date()), due_date: d.due_date || '', date_delivered: '',
    warranty_days: parseInt(d.warranty_days) || 0, warranty_until: d.warranty_until || '',
    priority: d.priority || 'normal', notes: d.notes || '',
    labor_cost: round2(d.labor_cost), parts_cost: partsCost,
    total_cost: totalCost, paid_amount: paid, remaining_amount: round2(Math.max(0, totalCost - paid)),
    status: d.status || 'in_repair', whatsapp_sent: 0, receipt_printed: 0, parts: parts,
    track_token: Utilities.getUuid() // public tracker link — generated once, never regenerated
  });
  JDB.update(SHEETS.REPAIRS, rec.id, { ticket_no: (cfg.repair_prefix || 'RPR-') + padNo_(rec.id) });
  rec.ticket_no = (cfg.repair_prefix || 'RPR-') + padNo_(rec.id);
  parts.forEach(function(pt){
    var p = pm[pt.product_id];
    JDB.update(SHEETS.PRODUCTS, p.id, { stock_qty: Number(p.stock_qty) - pt.qty_used });
    JDB.insert(SHEETS.INVENTORY, { product_id: p.id, user_id: userId, movement_type:'repair_use', qty_change: -pt.qty_used, note:'Repair #' + rec.id });
  });
  logActivity(userId, 'repair', SHEETS.REPAIRS, rec.id, 'New repair: ' + rec.device_name);
  return ok('Repair logged', { id: rec.id, data: rec });
}
// edit core fields/status/payment — remaining recomputed; fires WhatsApp prompt on → repaired
function updateRepair(id, d, userId){
  userId = gate_(userId, 'repairs', 'e'); if (!userId) return err('Access denied');
  var cur = JDB.byId(SHEETS.REPAIRS, id);
  if (!cur || cur.deleted) return err('Repair not found');
  var totalCost = d.total_cost != null ? round2(d.total_cost) : Number(cur.total_cost);
  var paid = d.paid_amount != null ? round2(d.paid_amount) : Number(cur.paid_amount);
  var newStatus = d.status || cur.status;
  var keep = function(nv, ov){ return nv != null ? nv : (ov || ''); };
  var patch = {
    device_name: d.device_name != null ? String(d.device_name).trim() : cur.device_name,
    brand: keep(d.brand, cur.brand), model: keep(d.model, cur.model), color: keep(d.color, cur.color),
    problem_description: keep(d.problem_description, cur.problem_description),
    diagnosis: keep(d.diagnosis, cur.diagnosis),
    assigned_user_id: d.assigned_user_id != null ? Number(d.assigned_user_id) : cur.assigned_user_id,
    device_imei: keep(d.device_imei, cur.device_imei), passcode: keep(d.passcode, cur.passcode),
    date_received: keep(d.date_received, cur.date_received), due_date: keep(d.due_date, cur.due_date),
    warranty_days: d.warranty_days != null ? (parseInt(d.warranty_days) || 0) : (cur.warranty_days || 0),
    warranty_until: keep(d.warranty_until, cur.warranty_until),
    priority: d.priority != null ? d.priority : (cur.priority || 'normal'),
    labor_cost: d.labor_cost != null ? round2(d.labor_cost) : Number(cur.labor_cost || 0),
    notes: keep(d.notes, cur.notes),
    total_cost: totalCost, paid_amount: paid, remaining_amount: round2(Math.max(0, totalCost - paid)), status: newStatus
  };
  if (cur.status !== 'delivered' && newStatus === 'delivered') patch.date_delivered = ymd(new Date());
  JDB.update(SHEETS.REPAIRS, id, patch);
  logActivity(userId, 'repair', SHEETS.REPAIRS, id, 'Updated repair #' + id + ' → ' + newStatus);
  // app-level WhatsApp trigger on transition into 'repaired'
  var notify = null;
  if (cur.status !== 'repaired' && newStatus === 'repaired') {
    notify = { whatsapp: buildRepairWaLink_(Object.assign({}, cur, patch)) };
  }
  return ok('Repair updated', { notify: notify });
}
function deleteRepair(id, userId){
  userId = gate_(userId, 'repairs', 'd'); if (!userId) return err('Access denied');
  var r = JDB.byId(SHEETS.REPAIRS, id);
  if (!r || r.deleted) return err('Repair not found');
  // restore consumed parts to stock (symmetric with deleteSale)
  (r.parts || []).forEach(function(pt){
    var p = JDB.byId(SHEETS.PRODUCTS, pt.product_id);
    if (p) {
      JDB.update(SHEETS.PRODUCTS, p.id, { stock_qty: Number(p.stock_qty) + Number(pt.qty_used || 0) });
      JDB.insert(SHEETS.INVENTORY, { product_id: p.id, user_id: userId, movement_type:'return', qty_change: Number(pt.qty_used || 0), note:'Void repair #' + id });
    }
  });
  JDB.remove(SHEETS.REPAIRS, id);
  logActivity(userId, 'deletion', SHEETS.REPAIRS, id, 'Deleted repair #' + id + ' & parts restored');
  return ok('Repair deleted & parts restored');
}
function markRepairWhatsapp(id, userId){ userId = gate_(userId, 'repairs', 'v'); if (!userId) return err('Access denied'); JDB.update(SHEETS.REPAIRS, id, { whatsapp_sent: 1 }); return ok('Marked sent'); }
function markRepairReceipt(id, userId){ userId = gate_(userId, 'repairs', 'v'); if (!userId) return err('Access denied'); JDB.update(SHEETS.REPAIRS, id, { receipt_printed: 1 }); logActivity(userId, 'print', SHEETS.REPAIRS, id, 'Printed job ticket #' + id); return ok('Marked'); }
function getRepairWaLink(id, userId){
  userId = gate_(userId, 'repairs', 'v'); if (!userId) return err('Access denied');
  var r = JDB.byId(SHEETS.REPAIRS, id);
  if (!r) return err('Repair not found');
  return ok('', { link: buildRepairWaLink_(r) });
}
function buildRepairWaLink_(repair){
  var cfg = settings_(), cust = JDB.byId(SHEETS.CUSTOMERS, repair.customer_id) || {};
  var phone = String(cust.phone || '').replace(/[^0-9]/g, '');
  var tpl = cfg.wa_template || 'Hi {name}, your device "{device}" is repaired and ready for pickup. Balance due: {currency}{remaining}. Thank you - {shop}';
  var msg = tpl.replace('{name}', cust.name || '')
               .replace('{device}', repair.device_name || '')
               .replace('{currency}', cfg.currency || '€')
               .replace('{remaining}', round2(repair.remaining_amount).toFixed(2))
               .replace('{total}', round2(repair.total_cost).toFixed(2))
               .replace('{shop}', cfg.shop_name || 'Phone Shop');
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
}
// public tracker page — no session/RBAC, gated purely by token match. NEVER expose passcode/customer/pricing
function getRepairPublicStatus(id, token){
  var r = JDB.byId(SHEETS.REPAIRS, id);
  if (!r || r.deleted || String(r.track_token) !== String(token)) return err('Invalid tracking link');
  return ok('', { data: { ticket_no: r.ticket_no, device_name: r.device_name, status: r.status, due_date: r.due_date || null } });
}
// staff-side: build the shareable tracker link + WhatsApp share text
function getRepairTrackLink(id, userId){
  userId = gate_(userId, 'repairs', 'v'); if (!userId) return err('Access denied');
  var r = JDB.byId(SHEETS.REPAIRS, id);
  if (!r || r.deleted) return err('Repair not found');
  if (!r.track_token) return err('No tracking link for this repair'); // pre-existing ticket, created before tracker
  var url = ScriptApp.getService().getUrl() + '?track=' + r.id + '&t=' + r.track_token;
  var cust = JDB.byId(SHEETS.CUSTOMERS, r.customer_id) || {};
  var phone = String(cust.phone || '').replace(/[^0-9]/g, '');
  var waLink = 'https://wa.me/' + phone + '?text=' + encodeURIComponent('Track your repair status here: ' + url);
  return ok('', { url: url, waLink: waLink });
}

// ============== Used Phone Purchases ==============
function getUsedPhones(userId, from, to){
  userId = gate_(userId, 'used_phones', 'v'); if (!userId) return err('Access denied');
  var cm = customerNameMap_(), um = userNameMap_();
  var rows = (from || to) ? JDB.readRange(SHEETS.USED_PHONES, from, to) : JDB.readAll(SHEETS.USED_PHONES);
  var data = rows.filter(function(r){ return !r.deleted; }).map(function(r){
    r.customer_name = cm[r.customer_id] || '—';
    r.buyer_name = um[r.user_id] || '—';
    return r;
  }).reverse();
  return ok('', { data: data });
}
// shared used-phone descriptive fields
function usedFields_(d){
  return {
    customer_id: Number(d.customer_id)||0, device_name:String(d.device_name||'').trim(),
    brand:d.brand||'', model:d.model||'', storage:d.storage||'', color:d.color||'',
    imei:String(d.imei||'').trim(), id_type:d.id_type||'none', id_number:d.id_number||'',
    condition:d.condition||'good', grade:d.grade||'', battery_health:parseInt(d.battery_health)||0,
    accessories:d.accessories||'', notes:d.notes||'', purchase_price:round2(d.purchase_price),
    resale_price:round2(d.resale_price), status:d.status||'in_stock', warranty_days:parseInt(d.warranty_days)||0,
    screen_condition:d.screen_condition||'', battery_grade:d.battery_grade||'', body_condition:d.body_condition||'',
    base_market_value:round2(d.base_market_value), id_card_url:String(d.id_card_url||'').trim()
  };
}
// trade-in grading — mirrors client CONDITION_GRADE_MULTIPLIERS
var GRADE_MULTIPLIERS_ = { A:1.00, B:0.85, C:0.70, D:0.50 };
function computeSuggestedResale_(baseMarketValue, screenGrade, batteryGrade, bodyGrade){
  var m = GRADE_MULTIPLIERS_;
  var avg = ((m[screenGrade]||0) + (m[batteryGrade]||0) + (m[bodyGrade]||0)) / 3;
  return round2((Number(baseMarketValue)||0) * avg);
}
// flag big staff/system gap in activity log — never blocks the save, staff price always wins
function resaleDeviationNote_(f){
  var suggested = computeSuggestedResale_(f.base_market_value, f.screen_condition, f.battery_grade, f.body_condition);
  if (!suggested || !f.resale_price) return '';
  var diffPct = Math.abs(f.resale_price - suggested) / suggested;
  return diffPct > 0.2 ? ' [resale ' + f.resale_price + ' vs suggested ' + suggested + ']' : '';
}
function usedImeiExists_(imei, exceptId){
  imei = String(imei||'').trim(); if (!imei) return false;
  return JDB.readAll(SHEETS.USED_PHONES).some(function(u){ return !u.deleted && String(u.imei).trim() === imei && u.id != exceptId; });
}
function addUsedPhone(d, userId){
  userId = gate_(userId, 'used_phones', 'a'); if (!userId) return err('Access denied');
  if (!d.customer_id || !d.device_name || !d.imei) return err('Customer, device & IMEI required');
  if (usedImeiExists_(d.imei)) return err('A used phone with this IMEI already exists');
  var fields = usedFields_(d); fields.user_id = userId; fields.signature = d.signature || ''; fields.contract_printed = 0;
  var rec = JDB.insert(SHEETS.USED_PHONES, fields);
  logActivity(userId, 'used_phone_purchase', SHEETS.USED_PHONES, rec.id, 'Bought used: ' + rec.device_name + ' (IMEI ' + rec.imei + ')' + resaleDeviationNote_(fields));
  return ok('Used phone purchase logged', { id: rec.id, data: rec });
}
function updateUsedPhone(id, d, userId){
  userId = gate_(userId, 'used_phones', 'e'); if (!userId) return err('Access denied');
  var cur = JDB.byId(SHEETS.USED_PHONES, id);
  if (!cur || cur.deleted) return err('Record not found');
  if (usedImeiExists_(d.imei, id)) return err('A used phone with this IMEI already exists');
  var fields = usedFields_(d);
  JDB.update(SHEETS.USED_PHONES, id, fields);
  logActivity(userId, 'used_phone_purchase', SHEETS.USED_PHONES, id, 'Updated used phone #' + id + resaleDeviationNote_(fields));
  return ok('Record updated');
}
function deleteUsedPhone(id, userId){
  userId = gate_(userId, 'used_phones', 'd'); if (!userId) return err('Access denied');
  JDB.remove(SHEETS.USED_PHONES, id);
  logActivity(userId, 'deletion', SHEETS.USED_PHONES, id, 'Deleted used phone #' + id);
  return ok('Record deleted');
}
function markUsedPhoneContract(id, userId){ userId = gate_(userId, 'used_phones', 'v'); if (!userId) return err('Access denied'); JDB.update(SHEETS.USED_PHONES, id, { contract_printed: 1 }); logActivity(userId, 'print', SHEETS.USED_PHONES, id, 'Printed purchase contract #' + id); return ok('Marked'); }

// ============== IMEI Lifecycle Lookup ==============
// cross-read Used_Phones (imei) + Repairs (device_imei), merged timeline — no own sheet
function getImeiHistory(imei, userId){
  userId = gate_(userId, 'imei_lookup', 'v'); if (!userId) return err('Access denied');
  imei = String(imei || '').trim();
  if (!imei) return err('Enter an IMEI to search');
  var cm = customerNameMap_();
  var events = [];
  JDB.readAll(SHEETS.USED_PHONES).forEach(function(u){
    if (u.deleted || String(u.imei).trim() !== imei) return;
    u.customer_name = cm[u.customer_id] || '—';
    events.push({
      type: 'used_phone_purchase', id: u.id, ref_id: u.id, date: u.created,
      title: 'Bought as used: ' + (u.device_name || ''),
      subtitle: u.customer_name + ' · ' + (u.condition || '') + (u.grade ? ' (' + u.grade + ')' : ''),
      status: u.status, ref: u
    });
  });
  JDB.readAll(SHEETS.REPAIRS).forEach(function(r){
    if (r.deleted || String(r.device_imei).trim() !== imei) return;
    r.customer_name = cm[r.customer_id] || '—';
    events.push({
      type: 'repair', id: r.id, ref_id: r.id, date: r.created,
      title: 'Repair ticket ' + (r.ticket_no || '#' + r.id) + ': ' + (r.problem_description || r.device_name || ''),
      subtitle: r.customer_name + (r.diagnosis ? ' · ' + r.diagnosis : ''),
      status: r.status, ref: r
    });
  });
  events.sort(function(a, b){ return new Date(a.date) - new Date(b.date); }); // oldest first
  return ok('', { data: events });
}

// ============== Cash Drawer / Daily Till ==============
function cashDrawerOpen_(){ return JDB.readAll(SHEETS.CASH_DRAWER).find(function(t){ return !t.deleted && t.status === 'open'; }) || null; }
// cash physical in the till = opening float + cash tendered on new sales + later cash top-ups/mirrors
// (repair payments, installment down payments & installment mirrors — all funnel through the Payments ledger)
// − cash refunds (Returns) − cash expenses (Expenses paid out of till), all strictly inside the shift window
function cashDrawerExpected_(session){
  var from = ymd(session.created), to = ymd(new Date()), openIso = session.created, nowIso = getCurrentTimestamp();
  var inWin = function(iso){ return iso >= openIso && iso <= nowIso; };
  var salesCash = JDB.readRange(SHEETS.SALES, from, to).reduce(function(sum, s){
    if (s.deleted || s.payment_method !== 'cash' || !inWin(s.created)) return sum;
    return sum + (Number(s.amount_paid) - Number(s.redeem_value || 0) - Number(s.store_credit_applied || 0));
  }, 0);
  var paymentsCash = JDB.readRange(SHEETS.PAYMENTS, from, to).reduce(function(sum, p){
    if (p.deleted || p.method !== 'cash' || !inWin(p.created)) return sum;
    return sum + Number(p.amount);
  }, 0);
  var refundsCash = JDB.readRange(SHEETS.RETURNS, from, to).reduce(function(sum, r){
    if (r.deleted || r.refund_method !== 'cash' || !inWin(r.created)) return sum;
    return sum + Number(r.cash_refunded);
  }, 0);
  var expensesCash = JDB.readRange(SHEETS.EXPENSES, from, to).reduce(function(sum, e){
    if (e.deleted || e.payment_method !== 'cash' || !inWin(e.created)) return sum;
    return sum + Number(e.amount);
  }, 0);
  return round2(Number(session.opening_float) + salesCash + paymentsCash - refundsCash - expensesCash);
}
function getCashDrawerStatus(userId){
  userId = gate_(userId, 'cash_drawer', 'v'); if (!userId) return err('Access denied');
  var um = userNameMap_();
  var open = cashDrawerOpen_();
  if (open) { open.opened_by_name = um[open.opened_by] || '—'; open.expected_cash = cashDrawerExpected_(open); }
  var history = JDB.readAll(SHEETS.CASH_DRAWER).filter(function(t){ return !t.deleted && t.status === 'closed'; })
    .map(function(t){ t.opened_by_name = um[t.opened_by] || '—'; t.closed_by_name = um[t.closed_by] || '—'; return t; })
    .reverse();
  return ok('', { data: { open: open, history: history } });
}
function openTill(openingFloat, userId){
  userId = gate_(userId, 'cash_drawer', 'a'); if (!userId) return err('Access denied');
  var lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return err('System busy — please retry');
  try {
    if (cashDrawerOpen_()) return err('A till session is already open');
    var flt = round2(openingFloat);
    if (isNaN(flt) || flt < 0) return err('Enter a valid opening float');
    var rec = JDB.insert(SHEETS.CASH_DRAWER, {
      opened_by: userId, opening_float: flt, closed_by: null, closed_at: null,
      expected_cash: 0, counted_cash: 0, variance: 0, notes: '', status: 'open'
    });
    logActivity(userId, 'till_open', SHEETS.CASH_DRAWER, rec.id, 'Opened till · float ' + fmtMoney_(flt, settings_()));
    return ok('Till opened', { id: rec.id, data: rec });
  } finally { lock.releaseLock(); }
}
function closeTill(id, countedCash, notes, userId){
  userId = gate_(userId, 'cash_drawer', 'e'); if (!userId) return err('Access denied');
  var lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return err('System busy — please retry');
  try {
    var t = JDB.byId(SHEETS.CASH_DRAWER, id);
    if (!t || t.deleted || t.status !== 'open') return err('Till already closed');
    var counted = round2(countedCash);
    if (isNaN(counted) || counted < 0) return err('Enter a valid counted cash amount');
    var expected = cashDrawerExpected_(t), variance = round2(counted - expected), cfg = settings_();
    JDB.update(SHEETS.CASH_DRAWER, id, { status:'closed', closed_by:userId, closed_at:getCurrentTimestamp(), expected_cash:expected, counted_cash:counted, notes:notes || '', variance:variance });
    logActivity(userId, 'till_close', SHEETS.CASH_DRAWER, id, 'Closed till · expected ' + fmtMoney_(expected, cfg) + ' · counted ' + fmtMoney_(counted, cfg) + ' · variance ' + fmtMoney_(variance, cfg));
    return ok('Till closed', { data: JDB.byId(SHEETS.CASH_DRAWER, id) });
  } finally { lock.releaseLock(); }
}

// ============== Installment / EMI Sales Plan ==============
function getInstallments(userId){
  userId = gate_(userId, 'installments', 'v'); if (!userId) return err('Access denied');
  var custMap = {}; JDB.readAll(SHEETS.CUSTOMERS).forEach(function(c){ custMap[c.id] = c; });
  var saleMap = {}; JDB.readAll(SHEETS.SALES).forEach(function(s){ saleMap[s.id] = s; });
  var today = ymd(new Date());
  var data = JDB.readAll(SHEETS.INSTALLMENTS).filter(function(r){ return !r.deleted; }).map(function(r){
    var cust = custMap[r.customer_id] || {}, sale = saleMap[r.sale_id] || {};
    r.customer_name = cust.name || '—';
    r.customer_phone = cust.phone || '';
    r.invoice_no = sale.invoice_no || ('#' + r.sale_id);
    r.status = (r.status === 'pending' && r.due_date < today) ? 'overdue' : r.status; // derived, never persisted
    return r;
  }).sort(function(a, b){ return a.due_date < b.due_date ? -1 : (a.due_date > b.due_date ? 1 : 0); });
  return ok('', { data: data });
}
// sales still owing money — eligible base for a new plan
function getSalesForInstallment(userId){
  userId = gate_(userId, 'installments', 'v'); if (!userId) return err('Access denied');
  var cm = customerNameMap_();
  var data = JDB.readAll(SHEETS.SALES).filter(function(s){ return !s.deleted && round2(s.due_amount) > 0; })
    .map(function(s){ return { id: s.id, invoice_no: s.invoice_no, due_amount: round2(s.due_amount), customer_name: cm[s.customer_id] || 'Walk-in' }; })
    .reverse();
  return ok('', { data: data });
}
// down payment + N monthly dues, evenly split off the sale's remaining due_amount
function createInstallmentPlan(saleId, downPayment, numInstallments, method, userId){
  userId = gate_(userId, 'installments', 'a'); if (!userId) return err('Access denied');
  var lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return err('System busy — please retry');
  try {
    var sale = JDB.byId(SHEETS.SALES, saleId);
    if (!sale || sale.deleted) return err('Sale not found');
    var remaining = round2(sale.due_amount);
    if (remaining <= 0) return err('Sale is already fully paid');
    var hasActive = JDB.readAll(SHEETS.INSTALLMENTS).some(function(r){ return !r.deleted && r.sale_id == saleId && r.status === 'pending'; });
    if (hasActive) return err('Sale already has an active installment plan');
    var down = round2(downPayment);
    if (down < 0) return err('Down payment cannot be negative');
    if (down > remaining) return err('Down payment exceeds remaining due');
    var financed = round2(remaining - down);
    if (financed <= 0) return err('Down payment settles the sale in full — no installments needed');
    var n = parseInt(numInstallments) || 0;
    if (n < 1) return err('Enter at least 1 installment');
    // apply/validate down payment before writing any schedule rows — a failed down payment
    // (e.g. insufficient store credit) must never leave orphaned Installments rows behind
    if (down > 0) {
      var dp = applySalePayment_(sale, down, method || 'cash', userId, 'Installment plan down payment');
      if (dp.error) return err(dp.error);
    }
    var per = round2(financed / n), sum = 0, today = new Date(), rows = [];
    for (var i = 0; i < n; i++) {
      var amt = (i === n - 1) ? round2(financed - sum) : per; // last absorbs the rounding remainder
      sum = round2(sum + amt);
      rows.push(JDB.insert(SHEETS.INSTALLMENTS, {
        sale_id: saleId, customer_id: sale.customer_id || null, due_date: ymd(addMonths_(today, i + 1)),
        amount: amt, paid_amount: 0, status: 'pending', paid_date: '', notes: ''
      }));
    }
    logActivity(userId, 'installment_plan', SHEETS.INSTALLMENTS, saleId, 'Installment plan on sale #' + saleId + ': ' + n + ' x ' + fmtMoney_(per) + (down ? ' + down ' + fmtMoney_(down) : ''));
    return ok('Installment plan created', { count: rows.length, data: rows });
  } finally { lock.releaseLock(); }
}
// applies a payment to one due row, then mirrors the same amount onto the parent sale
// (shared Payments/applySalePayment_ mechanism — sale & installment ledgers never drift)
function recordInstallmentPayment(installmentId, amount, method, userId){
  userId = gate_(userId, 'installments', 'e'); if (!userId) return err('Access denied');
  var lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return err('System busy — please retry');
  try {
    var inst = JDB.byId(SHEETS.INSTALLMENTS, installmentId);
    if (!inst || inst.deleted) return err('Installment not found');
    var due = round2(inst.amount - (inst.paid_amount || 0)); if (due <= 0) return err('Already settled');
    var amt = round2(amount); if (!(amt > 0)) return err('Enter a valid amount');
    amt = round2(Math.min(amt, due));
    var newPaid = round2(Number(inst.paid_amount || 0) + amt);
    var status = newPaid >= round2(inst.amount) ? 'paid' : 'pending';
    var paidDate = status === 'paid' ? ymd(new Date()) : (inst.paid_date || '');
    JDB.update(SHEETS.INSTALLMENTS, installmentId, { paid_amount: newPaid, status: status, paid_date: paidDate });
    var sale = JDB.byId(SHEETS.SALES, inst.sale_id);
    if (sale && !sale.deleted && round2(sale.due_amount) > 0) {
      applySalePayment_(sale, Math.min(amt, round2(sale.due_amount)), method || 'cash', userId, 'Installment #' + installmentId + ' payment');
    }
    logActivity(userId, 'installment_payment', SHEETS.INSTALLMENTS, installmentId, 'Installment #' + installmentId + ' payment ' + fmtMoney_(amt) + ' (' + (method || 'cash') + ')');
    return ok('Payment recorded', { paid_amount: newPaid, status: status });
  } finally { lock.releaseLock(); }
}
// time-driven trigger target — no session/userId, gated purely by the settings toggle
function sendOverdueInstallmentReminders(){
  var cfg = settings_();
  if (String(cfg.installment_reminder_email) !== '1') return;
  var today = ymd(new Date());
  var saleMap = {}; JDB.readAll(SHEETS.SALES).forEach(function(s){ saleMap[s.id] = s.invoice_no; });
  var overdue = JDB.readAll(SHEETS.INSTALLMENTS).filter(function(r){ return !r.deleted && r.status === 'pending' && r.due_date < today; });
  var sent = 0;
  overdue.forEach(function(r){
    var cust = JDB.byId(SHEETS.CUSTOMERS, r.customer_id);
    if (!cust || !cust.email) return;
    var due = round2(r.amount - (r.paid_amount || 0));
    var subject = (cfg.shop_name || 'Phone Shop') + ' — Overdue Installment Reminder';
    var body = 'Hi ' + (cust.name || '') + ',\n\nYour installment of ' + fmtMoney_(due, cfg) + ' for sale ' +
      (saleMap[r.sale_id] || ('#' + r.sale_id)) + ' was due on ' + r.due_date + ' and is still outstanding.\n\n' +
      'Please settle it at your earliest convenience.\n\nThank you,\n' + (cfg.shop_name || 'Phone Shop');
    try { MailApp.sendEmail(cust.email, subject, body); sent++; } catch (e) { Logger.log('reminder mail err: ' + e); }
  });
  logActivity(0, 'installment_reminder', SHEETS.INSTALLMENTS, '', 'Sent ' + sent + ' overdue reminder email(s)');
}
// one-time setup — run manually from the Apps Script editor (owner only), never auto-installs on doGet
function installInstallmentReminderTrigger(){
  ScriptApp.newTrigger('sendOverdueInstallmentReminders').timeBased().everyDays(1).atHour(9).create();
}

// ============== Bulk CSV Import (master sheets) ==============
// generic importer — gate · dedup vs sheet+batch · skip-and-collect · {ok,count,errors}
function bulkImport_(token, page, sheet, rows, opts){
  var uid = gate_(token, page, 'a'); if (!uid) return { ok:false, error:'Access denied' };
  if (!Array.isArray(rows) || !rows.length) return { ok:false, error:'No rows to import' };
  var seen = {};
  if (opts.uniqueKey) JDB.readAll(sheet).forEach(function(r){ if (!r.deleted) { var k = String(r[opts.uniqueKey] || '').trim().toLowerCase(); if (k) seen[k] = 1; } });
  var count = 0, errors = [];
  rows.forEach(function(r, i){
    var miss = opts.required.find(function(f){ return !String(r[f] == null ? '' : r[f]).trim(); });
    if (miss) { errors.push('Row ' + (i + 1) + ': missing ' + miss); return; }
    var uniq = opts.uniqueKey ? String(r[opts.uniqueKey] || '').trim().toLowerCase() : '';
    if (uniq) { if (seen[uniq]) { errors.push('Row ' + (i + 1) + ': duplicate ' + opts.uniqueKey + ' "' + r[opts.uniqueKey] + '"'); return; } seen[uniq] = 1; }
    try { var rec = JDB.insert(sheet, opts.build(r)); opts.after && opts.after(rec, uid); count++; }
    catch (e) { errors.push('Row ' + (i + 1) + ': ' + (e.message || e)); }
  });
  logActivity(uid, 'import', sheet, '', 'Imported ' + count + ' record(s)' + (errors.length ? ' · ' + errors.length + ' skipped' : ''));
  return { ok:true, count:count, errors:errors };
}
function bulkImportCustomers(rows, token){
  return bulkImport_(token, 'customers', SHEETS.CUSTOMERS, rows, { required:['name','phone'], uniqueKey:'phone', build: customerFields_ });
}
function bulkImportSuppliers(rows, token){
  return bulkImport_(token, 'suppliers', SHEETS.SUPPLIERS, rows, { required:['name'], uniqueKey:'name', build: supplierFields_ });
}
function bulkImportProducts(rows, token){
  var cfg = settings_();
  return bulkImport_(token, 'products', SHEETS.PRODUCTS, rows, {
    required:['name','supplier_id'], uniqueKey:'barcode',
    build: function(r){ var f = productFields_(r, cfg); f.stock_qty = parseInt(r.stock_qty) || 0; return f; },
    after: function(rec, uid){ if (Number(rec.stock_qty) > 0) JDB.insert(SHEETS.INVENTORY, { product_id: rec.id, user_id: uid, movement_type:'purchase', qty_change: Number(rec.stock_qty), note:'Opening stock (import)' }); }
  });
}

// ============== Dashboard & Reports ==============
function getDashboardStats(userId){
  userId = gate_(userId, 'dashboard', 'v'); if (!userId) return err('Access denied');
  var today = ymd(new Date());
  var todaySales = JDB.readDay(SHEETS.SALES, today).filter(function(s){ return !s.deleted; });
  var todayRevenue = todaySales.reduce(function(a, s){ return a + Number(s.total); }, 0);
  var repairs = JDB.readAll(SHEETS.REPAIRS).filter(function(r){ return !r.deleted; });
  var products = JDB.readAll(SHEETS.PRODUCTS).filter(function(p){ return !p.deleted; });
  var lowStock = products.filter(function(p){ return Number(p.stock_qty) <= Number(p.low_stock_alert || 0); });

  // 7-day revenue + txn-count trend (oldest → newest)
  var trend = [];
  for (var k = 6; k >= 0; k--) {
    var day = ymd(new Date(Date.now() - k * 86400000));
    var daySales = JDB.readDay(SHEETS.SALES, day).filter(function(s){ return !s.deleted; });
    var rev = daySales.reduce(function(a, s){ return a + Number(s.total); }, 0);
    trend.push({ day: day, total: round2(rev), count: daySales.length });
  }

  // last-30-day payment mix + top sellers
  var since = ymd(new Date(Date.now() - 29 * 86400000));
  var recent = JDB.readRange(SHEETS.SALES, since, today).filter(function(s){ return !s.deleted; });
  var payMix = { cash: 0, card: 0, bank_transfer: 0 }, prodAgg = {};
  recent.forEach(function(s){
    payMix[s.payment_method] = round2((payMix[s.payment_method] || 0) + Number(s.total));
    (s.items || []).forEach(function(l){
      if (!prodAgg[l.product_id]) prodAgg[l.product_id] = { name: l.name, qty: 0 };
      prodAgg[l.product_id].qty += Number(l.qty) || 0;
    });
  });
  var topProducts = Object.keys(prodAgg).map(function(k){ return prodAgg[k]; })
    .sort(function(a, b){ return b.qty - a.qty; }).slice(0, 6);

  // stock units per category + inventory value at cost
  var stockByCategory = {}, inventoryValue = 0;
  products.forEach(function(p){
    var c = p.category || 'other';
    stockByCategory[c] = (stockByCategory[c] || 0) + (Number(p.stock_qty) || 0);
    inventoryValue = round2(inventoryValue + (Number(p.stock_qty) || 0) * (Number(p.purchase_price) || 0));
  });

  // installments due today or overdue — top 10 by due_date
  var custMapD = {}; JDB.readAll(SHEETS.CUSTOMERS).forEach(function(c){ custMapD[c.id] = c; });
  var saleMapD = {}; JDB.readAll(SHEETS.SALES).forEach(function(s){ saleMapD[s.id] = s.invoice_no; });
  var installmentsDue = JDB.readAll(SHEETS.INSTALLMENTS).filter(function(r){ return !r.deleted && r.status === 'pending' && r.due_date <= today; })
    .map(function(r){ var c = custMapD[r.customer_id] || {}; return {
      id: r.id, customer_name: c.name || '—', customer_phone: c.phone || '',
      invoice_no: saleMapD[r.sale_id] || ('#' + r.sale_id), due_date: r.due_date, due: round2(r.amount - (r.paid_amount || 0))
    }; }).sort(function(a, b){ return a.due_date < b.due_date ? -1 : 1; }).slice(0, 10);

  return ok('', { data: {
    todaySalesCount: todaySales.length,
    todayRevenue: round2(todayRevenue),
    repairsInProgress: repairs.filter(function(r){ return r.status === 'in_repair'; }).length,
    repairsReady: repairs.filter(function(r){ return r.status === 'repaired'; }).length,
    totalProducts: products.length,
    lowStockCount: lowStock.length,
    totalCustomers: JDB.readAll(SHEETS.CUSTOMERS).filter(function(c){ return !c.deleted; }).length,
    outstandingRepairBalance: round2(repairs.reduce(function(a, r){ return a + Number(r.remaining_amount || 0); }, 0)),
    inventoryValue: inventoryValue,
    repairsByStatus: {
      in_repair: repairs.filter(function(r){ return r.status === 'in_repair'; }).length,
      repaired: repairs.filter(function(r){ return r.status === 'repaired'; }).length,
      delivered: repairs.filter(function(r){ return r.status === 'delivered'; }).length
    },
    salesTrend: trend,
    paymentMix: payMix,
    topProducts: topProducts,
    stockByCategory: stockByCategory,
    lowStock: lowStock.slice(0, 10),
    installmentsDue: installmentsDue,
    recentSales: JDB.readAll(SHEETS.SALES).filter(function(s){ return !s.deleted; }).slice(-7).reverse(),
    recentActivity: (function(){ var um = userNameMap_(); return JDB.readAll(SHEETS.LOGS).slice(-8).reverse().map(function(l){ return { action_type:l.action_type, description:l.description, created:l.created, user_name: um[l.user_id] || 'System' }; }); })()
  } });
}
function getReportSummary(userId, from, to){
  userId = gate_(userId, 'reports', 'v'); if (!userId) return err('Access denied');
  var pm = productMap_();
  var sales = JDB.readRange(SHEETS.SALES, from, to).filter(function(s){ return !s.deleted; });
  var repairs = JDB.readRange(SHEETS.REPAIRS, from, to).filter(function(r){ return !r.deleted; });
  var used = JDB.readRange(SHEETS.USED_PHONES, from, to).filter(function(u){ return !u.deleted; });

  var salesRevenue = 0, salesVat = 0, salesCogs = 0, salesDiscount = 0, byPay = {}, prodAgg = {};
  sales.forEach(function(s){
    salesRevenue = round2(salesRevenue + Number(s.total));
    salesVat = round2(salesVat + Number(s.vat_amount));
    salesDiscount = round2(salesDiscount + Number(s.discount || 0));
    byPay[s.payment_method] = round2((byPay[s.payment_method] || 0) + Number(s.total));
    (s.items || []).forEach(function(l){
      var cost = (l.unit_cost != null) ? Number(l.unit_cost) : (pm[l.product_id] ? Number(pm[l.product_id].purchase_price) : 0); // snapshot cost-at-sale
      salesCogs = round2(salesCogs + cost * l.qty);
      if (!prodAgg[l.product_id]) prodAgg[l.product_id] = { name: l.name, qty: 0, revenue: 0 };
      prodAgg[l.product_id].qty += l.qty;
      prodAgg[l.product_id].revenue = round2(prodAgg[l.product_id].revenue + (l.unit_price * l.qty));
    });
  });
  var topProducts = Object.keys(prodAgg).map(function(k){ return prodAgg[k]; }).sort(function(a, b){ return b.qty - a.qty; }).slice(0, 10);
  var repairIncome = round2(repairs.reduce(function(a, r){ return a + Number(r.paid_amount || 0); }, 0));
  var usedSpend = round2(used.reduce(function(a, u){ return a + Number(u.purchase_price || 0); }, 0));

  // --- Returns netting (gross accumulators kept intact for back-compat) ---
  var rets = JDB.readRange(SHEETS.RETURNS, from, to).filter(function(r){ return !r.deleted; });
  var refundsTotal = 0, refundsVat = 0, refundsCogsRestored = 0, refundByMethod = {}, refundsCount = rets.length;
  rets.forEach(function(rt){
    refundsTotal = round2(refundsTotal + Number(rt.refund_total));
    refundsVat = round2(refundsVat + Number(rt.refund_vat));
    refundsCogsRestored = round2(refundsCogsRestored + (rt.restock ? Number(rt.returned_cogs) : 0)); // COGS back only if restocked
    refundByMethod[rt.refund_method] = round2((refundByMethod[rt.refund_method] || 0) + Number(rt.cash_refunded));
  });
  var salesRevenueNet = round2(salesRevenue - refundsTotal);
  var salesVatNet = round2(salesVat - refundsVat);
  var salesCogsNet = round2(salesCogs - refundsCogsRestored);
  var salesGrossProfit = round2(salesRevenueNet - salesVatNet - salesCogsNet);

  // --- Expenses + P&L ---
  var expensesTotal = 0, expensesByCategory = {};
  expensesInRange_(from, to).forEach(function(e){
    expensesTotal = round2(expensesTotal + Number(e.amount || 0));
    expensesByCategory[e.category] = round2((expensesByCategory[e.category] || 0) + Number(e.amount || 0));
  });
  var repairPartsCost = round2(repairs.reduce(function(a, r){ return a + Number(r.parts_cost || 0); }, 0));
  var repairProfit = round2(repairIncome - repairPartsCost);
  var netProfit = round2(salesGrossProfit + repairProfit - expensesTotal);

  return ok('', { data: {
    salesCount: sales.length, salesRevenue: salesRevenue, salesVat: salesVat, salesDiscount: salesDiscount,
    salesNet: round2(salesRevenue - salesVat), grossProfit: salesGrossProfit,
    salesRevenueNet: salesRevenueNet, salesVatNet: salesVatNet, salesCogsNet: salesCogsNet, salesGrossProfit: salesGrossProfit,
    refundsTotal: refundsTotal, refundsVat: refundsVat, refundsCogsRestored: refundsCogsRestored, refundsCount: refundsCount, refundByMethod: refundByMethod,
    byPayment: byPay, topProducts: topProducts,
    repairsCount: repairs.length, repairIncome: repairIncome, repairPartsCost: repairPartsCost, repairProfit: repairProfit,
    repairsByStatus: { in_repair: repairs.filter(function(r){ return r.status === 'in_repair'; }).length,
      repaired: repairs.filter(function(r){ return r.status === 'repaired'; }).length,
      delivered: repairs.filter(function(r){ return r.status === 'delivered'; }).length },
    usedCount: used.length, usedSpend: usedSpend,
    expensesTotal: expensesTotal, expensesByCategory: expensesByCategory, netProfit: netProfit
  } });
}

// ============== Activity Logs viewer ==============
function getLogs(userId){
  userId = gate_(userId, 'logs', 'v'); if (!userId) return err('Access denied');
  var um = userNameMap_();
  var data = JDB.readAll(SHEETS.LOGS).map(function(l){ l.user_name = um[l.user_id] || (l.user_id ? ('#' + l.user_id) : 'System'); return l; }).reverse();
  return ok('', { data: data });
}
function clearLogs(userId){
  userId = gate_(userId, 'logs', 'd'); if (!userId) return err('Access denied');
  var sh = getSheet(SHEETS.LOGS);
  // keep id counter at current max so cleared log ids are never reused
  var maxId = JDB.readAll(SHEETS.LOGS).reduce(function(m, x){ return Math.max(m, x.id || 0); }, 0);
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  PropertiesService.getScriptProperties().setProperty('JID_' + SHEETS.LOGS, String(maxId));
  logActivity(userId, 'deletion', SHEETS.LOGS, '', 'Cleared activity logs');
  return ok('Logs cleared');
}

// ============== Setup / Demo Data ==============
function seedJsonSheet_(ss, name, records){
  var sh = ss.insertSheet(name);
  sh.appendRow(['Date', 'Data']);
  sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#001f3f').setFontColor('white');
  sh.getRange('A:A').setNumberFormat('@');
  var byDate = {};
  records.forEach(function(r){ var k = ymd(r.created); (byDate[k] = byDate[k] || []).push(r); });
  Object.keys(byDate).sort().forEach(function(k){ sh.appendRow([k, JSON.stringify(byDate[k])]); });
  var maxId = records.reduce(function(m, r){ return Math.max(m, r.id || 0); }, 0);
  PropertiesService.getScriptProperties().setProperty('JID_' + name, String(maxId));
  sh.autoResizeColumn(1);
  return sh;
}

function setupDemoData(){
  try {
    // editor-only guard — a remote google.script.run call has active≠effective, blocking a data wipe
    if (Session.getActiveUser().getEmail() !== Session.getEffectiveUser().getEmail()) {
      return { success:false, message:'setupDemoData can only be run from the Apps Script editor.' };
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var temp = ss.insertSheet('__temp_' + new Date().getTime());
    ss.getSheets().forEach(function(sh){ if (sh.getSheetId() !== temp.getSheetId()) ss.deleteSheet(sh); });

    // reset all JDB id counters
    var props = PropertiesService.getScriptProperties();
    Object.keys(SHEETS).forEach(function(k){ props.deleteProperty('JID_' + SHEETS[k]); });

    var now = new Date();
    var iso = function(daysAgo, h){ return new Date(now.getTime() - (daysAgo || 0) * 864e5 - (h || 0) * 36e5).toISOString(); };

    // ---- Users (classic) ----
    var usersSheet = ss.insertSheet(SHEETS.USERS);
    usersSheet.appendRow(['id','username','email','password','role','status','profile_image','theme_mode','custom_colors','created_at','created_by','updated_at','updated_by','is_deleted']);
    usersSheet.getRange(1, 1, 1, 14).setBackground('#001f3f').setFontColor('white').setFontWeight('bold');
    var demoUsers = [
      [1,'owner','owner@demo.com','owner123','owner','active'],
      [2,'manager','manager@demo.com','manager123','manager','active'],
      [3,'emp1','emp1@demo.com','emp123','employee','active'],
      [4,'emp2','emp2@demo.com','emp123','employee','active'],
      [5,'emp3','emp3@demo.com','emp123','employee','inactive']
    ];
    demoUsers.forEach(function(u, i){
      var ts = iso(demoUsers.length - i);
      usersSheet.appendRow([u[0], u[1], u[2], u[3], u[4], u[5], DEFAULT_LOGO, 'light', '', ts, 'System', ts, 'System', 0]);
    });
    usersSheet.autoResizeColumns(1, 14);

    // ---- Roles (RBAC) ----
    ensureRbac_(ss);

    // ---- Settings (key|value) — seeded from the single registry ----
    var setSheet = ss.insertSheet(SHEETS.SETTINGS);
    setSheet.appendRow(['key', 'value']);
    setSheet.getRange(1, 1, 1, 2).setBackground('#001f3f').setFontColor('white').setFontWeight('bold');
    var seedSettings = Object.assign({}, SETTINGS_DEFAULTS, { timezone: Session.getScriptTimeZone() });
    Object.keys(seedSettings).forEach(function(k){ setSheet.appendRow([k, seedSettings[k]]); });
    setSheet.autoResizeColumns(1, 2);

    // ---- Suppliers ----
    var suppliers = [
      { id:1, name:'Supplier 1', phone:'0423000001', email:'supplier1@demo.com', address:'House 4, Street 1, Demo City',  contact_person:'Contact 1', notes:'Net-30 terms', created: iso(40), updated: iso(40) },
      { id:2, name:'Supplier 2', phone:'0423000002', email:'supplier2@demo.com', address:'House 88, Street 2, Demo City', contact_person:'Contact 2', notes:'Fast shipping', created: iso(38), updated: iso(38) },
      { id:3, name:'Supplier 3', phone:'0423000003', email:'supplier3@demo.com', address:'House 12, Street 3, Demo City', contact_person:'Contact 3', notes:'OEM parts',     created: iso(35), updated: iso(35) },
      { id:4, name:'Supplier 4', phone:'0423000004', email:'supplier4@demo.com', address:'House 5, Street 4, Demo City',  contact_person:'Contact 4', notes:'',             created: iso(30), updated: iso(30) }
    ];
    suppliers.forEach(function(s){
      s.company = s.company || s.name; s.website = s.website || ''; s.city = s.city || 'Demo City'; s.country = s.country || 'Demo Country';
      s.tax_id = s.tax_id || ('VAT-' + (1000 + s.id)); s.payment_terms = s.payment_terms || 'Net-30';
      s.bank_name = s.bank_name || ''; s.bank_account = s.bank_account || ''; s.opening_balance = s.opening_balance || 0;
      s.category = s.category || 'phones & parts'; s.status = s.status || 'active';
    });
    seedJsonSheet_(ss, SHEETS.SUPPLIERS, suppliers);

    // ---- Products ----
    var P = function(id, sup, name, cat, bc, pur, sale, stock, low){ return { id:id, supplier_id:sup, name:name, sku:bc, category:cat, barcode:bc, brand:name.split(' ')[0], model:'', color:'', storage:'', ram:'', condition:'new', purchase_price:pur, sale_price:sale, mrp:round2(sale*1.15), vat_rate:21, tax_inclusive:0, discount_max:10, stock_qty:stock, low_stock_alert:low||5, reorder_qty:(low||5)*2, unit:'pcs', shelf_location:'', supplier_sku:'', weight:'', warranty_months: cat==='phone'?12:0, description:'', image_url:'', status:'active', created: iso(28), updated: iso(28) }; };
    var products = [
      P(1, 1, 'Smartphone Model 1 128GB', 'phone', 'PH-SM1-128', 520, 699, 8, 3),
      P(2, 1, 'Smartphone Model 2',       'phone', 'PH-SM2',     430, 599, 5, 3),
      P(3, 1, 'Smartphone Model 3',       'phone', 'PH-SM3',     400, 549, 4, 2),
      P(4, 1, 'Smartphone Model 4',       'phone', 'PH-SM4',     150, 229, 12, 4),
      P(5, 2, 'Fast Charger 25W',         'accessory', 'AC-CHG25', 6, 19.99, 40, 10),
      P(6, 2, 'Screen Protector',         'accessory', 'AC-TGP',  1.2, 9.99, 60, 15),
      P(7, 2, 'Phone Case',               'accessory', 'AC-CASE', 2, 14.99, 35, 10),
      P(8, 2, 'Wireless Earbuds',         'accessory', 'AC-EARB', 18, 49.99, 18, 6),
      P(9, 2, 'Power Bank 10000mAh',      'accessory', 'AC-PB10', 11, 29.99, 3, 6),
      P(10, 3, 'Model 1 Screen Assembly', 'repair_part', 'RP-SM1SCR', 65, 129, 7, 3),
      P(11, 3, 'Model 2 Battery',         'repair_part', 'RP-SM2BAT', 14, 39, 9, 4),
      P(12, 3, 'Charging Port Flex',      'repair_part', 'RP-CPFLEX', 4, 19, 2, 5)
    ];
    seedJsonSheet_(ss, SHEETS.PRODUCTS, products);

    // ---- Customers ----
    var customers = [
      { id:1, name:'Customer 1', phone:'03001000001', email:'customer1@demo.com', address:'House 10, Street 1, Demo City', notes:'',             created: iso(25), updated: iso(25) },
      { id:2, name:'Customer 2', phone:'03001000002', email:'customer2@demo.com', address:'House 22, Street 2, Demo City', notes:'VIP',          created: iso(22), updated: iso(22) },
      { id:3, name:'Customer 3', phone:'03001000003', email:'',                   address:'',                              notes:'',             created: iso(18), updated: iso(18) },
      { id:4, name:'Customer 4', phone:'03001000004', email:'customer4@demo.com', address:'House 7, Street 4, Demo City',  notes:'Repeat buyer', created: iso(12), updated: iso(12) },
      { id:5, name:'Customer 5', phone:'03001000005', email:'',                   address:'',                              notes:'',             created: iso(6),  updated: iso(6) },
      { id:6, name:'Customer 6', phone:'03001000006', email:'customer6@demo.com', address:'House 3, Street 6, Demo City',  notes:'',             created: iso(2),  updated: iso(2) }
    ];
    customers.forEach(function(c){
      c.company = c.company || ''; c.city = c.city || 'Demo City'; c.country = c.country || 'Demo Country'; c.tax_id = c.tax_id || '';
      c.customer_type = c.customer_type || (c.notes === 'VIP' ? 'wholesale' : 'retail');
      c.credit_limit = c.credit_limit || (c.customer_type === 'wholesale' ? 500 : 0);
      c.loyalty_points = c.loyalty_points || (c.id * 15); c.dob = c.dob || ''; c.gender = c.gender || ''; c.status = c.status || 'active';
      c.store_credit = c.store_credit || (c.id === 4 ? 25 : 0);
    });
    seedJsonSheet_(ss, SHEETS.CUSTOMERS, customers);

    // ---- Inventory movements (opening stock per product) ----
    var inv = products.map(function(p, i){ return { id:i+1, product_id:p.id, user_id:1, movement_type:'purchase', qty_change:p.stock_qty, note:'Opening stock', created: iso(28), updated: iso(28) }; });
    seedJsonSheet_(ss, SHEETS.INVENTORY, inv);

    // ---- Sales (with embedded items) ----
    var pmap = {}; products.forEach(function(p){ pmap[p.id] = p; });
    var mkLines = function(items){ return items.map(function(it){ var p = pmap[it.pid]; var net = round2(p.sale_price * it.qty), vat = round2(net * p.vat_rate / 100); return { product_id:p.id, name:p.name, qty:it.qty, unit_price:p.sale_price, unit_cost:round2(p.purchase_price), vat_rate:p.vat_rate, vat_amount:vat, line_total:round2(net + vat) }; }); };
    var mkSale = function(id, uid, cid, items, pay, daysAgo, disc){
      var lines = mkLines(items), sub = 0, vt = 0;
      lines.forEach(function(l){ sub = round2(sub + l.unit_price * l.qty); vt = round2(vt + l.vat_amount); });
      var gross = round2(sub + vt), dd = round2(disc || 0); if (dd > gross) dd = gross;
      var tot = round2(gross - dd), vatPortion = gross > 0 ? round2(dd * vt / gross) : 0, vatNet = round2(vt - vatPortion);
      return { id:id, user_id:uid, customer_id:cid, subtotal:sub, vat_amount:vatNet, vat_gross:vt, net_amount:round2(tot - vatNet),
        discount:dd, total:tot, amount_paid:tot, change_given:0, due_amount:0, payment_status:'paid',
        invoice_no:'INV-' + padNo_(id), payment_method:pay, notes:'', receipt_printed:1,
        points_earned:0, points_redeemed:0, redeem_value:0, store_credit_applied:0,
        returned_total:0, returned_vat:0, returned_cogs_restocked:0, return_status:'none',
        items:lines, created: iso(daysAgo), updated: iso(daysAgo) };
    };
    var sales = [
      mkSale(1, 3, 1, [{pid:5,qty:1},{pid:6,qty:2}], 'cash', 5),
      mkSale(2, 2, 2, [{pid:1,qty:1},{pid:7,qty:1}], 'card', 4, 10),
      mkSale(3, 3, null, [{pid:6,qty:1}], 'cash', 3),
      mkSale(4, 4, 3, [{pid:8,qty:1},{pid:5,qty:1}], 'card', 1),
      mkSale(5, 2, 4, [{pid:2,qty:1}], 'bank_transfer', 0)
    ];
    // partial sale → open ledger balance + a demo installment plan (see below)
    var partialSale = mkSale(6, 3, 4, [{pid:9,qty:1}], 'cash', 35);
    partialSale.amount_paid = 10; partialSale.due_amount = round2(partialSale.total - 10); partialSale.payment_status = 'partial';
    sales.push(partialSale);
    // demo RETURN — 1 unit of product 6 from sale 1, restocked cash refund; mutate sale 1 tally BEFORE seeding
    var rl = mkLines([{pid:6,qty:1}])[0];
    var rNet = round2(rl.unit_price * 1), rVat = round2(rNet * rl.vat_rate / 100), rTot = round2(rNet + rVat), rCogs = round2(rl.unit_cost * 1);
    var demoReturn = { id:1, return_no:'RET-' + padNo_(1), sale_id:1, invoice_no:'INV-' + padNo_(1), customer_id:1, user_id:2,
      reason:'Customer changed mind', refund_method:'cash', restock:1,
      items:[{ product_id:6, name:rl.name, qty:1, unit_price:rl.unit_price, unit_cost:rl.unit_cost, vat_rate:rl.vat_rate, refund_net:rNet, refund_vat:rVat, refund_total:rTot, restocked:1 }],
      refund_subtotal:rNet, refund_vat:rVat, refund_total:rTot, returned_cogs:rCogs, discount_share:0, due_applied:0, cash_refunded:rTot,
      created: iso(2), updated: iso(2) };
    sales[0].items = sales[0].items.map(function(l){ return l.product_id === 6 ? Object.assign({}, l, { returned_qty:1 }) : l; });
    sales[0].returned_total = rTot; sales[0].returned_vat = rVat; sales[0].returned_cogs_restocked = rCogs; sales[0].return_status = 'partial';
    seedJsonSheet_(ss, SHEETS.SALES, sales);
    seedJsonSheet_(ss, SHEETS.RETURNS, [demoReturn]);

    // ---- Repairs (with embedded parts) ----
    var repairs = [
      { id:1, customer_id:1, assigned_user_id:3, device_name:'Smartphone Model 1', problem_description:'Cracked screen', device_imei:'356789104500011', passcode:'1234', due_date:'', warranty_days:90, notes:'Screen replaced under warranty', total_cost:160, paid_amount:160, remaining_amount:0, status:'delivered', whatsapp_sent:1, receipt_printed:1, parts:[{product_id:10,name:'Model 1 Screen Assembly',qty_used:1,unit_cost:65}], created: iso(7), updated: iso(5) },
      { id:2, customer_id:2, assigned_user_id:3, device_name:'Smartphone Model 2', problem_description:'Battery drains fast', device_imei:'351234567800022', passcode:'0000', due_date:'', warranty_days:30, notes:'Awaiting pickup', total_cost:70, paid_amount:30, remaining_amount:40, status:'repaired', whatsapp_sent:0, receipt_printed:0, parts:[{product_id:11,name:'Model 2 Battery',qty_used:1,unit_cost:14}], created: iso(3), updated: iso(1) },
      { id:3, customer_id:4, assigned_user_id:4, device_name:'Smartphone Model 4', problem_description:'Not charging', device_imei:'', passcode:'9999', due_date:'', warranty_days:0, notes:'Diagnosing charging issue', total_cost:45, paid_amount:0, remaining_amount:45, status:'in_repair', whatsapp_sent:0, receipt_printed:0, parts:[{product_id:12,name:'Charging Port Flex',qty_used:1,unit_cost:4}], created: iso(1), updated: iso(1) }
    ];
    repairs.forEach(function(r){
      r.ticket_no = 'RPR-' + padNo_(r.id);
      r.brand = r.brand || r.device_name.split(' ')[0]; r.model = r.model || ''; r.color = r.color || '';
      r.diagnosis = r.diagnosis || r.problem_description;
      r.date_received = r.date_received || ymd(r.created);
      r.date_delivered = r.status === 'delivered' ? ymd(r.updated) : '';
      r.warranty_until = r.warranty_until || ''; r.priority = r.priority || 'normal';
      r.parts_cost = (r.parts || []).reduce(function(a, p){ return round2(a + Number(p.unit_cost || 0) * Number(p.qty_used || 0)); }, 0);
      r.labor_cost = round2(Math.max(0, Number(r.total_cost || 0) - r.parts_cost));
    });
    seedJsonSheet_(ss, SHEETS.REPAIRS, repairs);

    // ---- Used phone purchases ----
    var used = [
      { id:1, user_id:2, customer_id:3, device_name:'Smartphone Model 5 64GB', imei:'356789104567890', id_type:'id_card', id_number:'ID-100001', condition:'good', battery_health:85, screen_condition:'A', battery_grade:'B', body_condition:'A', base_market_value:260, accessories:'Box, Charger', notes:'', signature:'', purchase_price:180, resale_price:240, contract_printed:1, created: iso(6), updated: iso(6) },
      { id:2, user_id:3, customer_id:5, device_name:'Smartphone Model 6', imei:'351234567890123', id_type:'driving_license', id_number:'DL-100002', condition:'fair', battery_health:78, screen_condition:'B', battery_grade:'C', body_condition:'C', base_market_value:200, accessories:'Charger', notes:'Minor scratches', signature:'', purchase_price:120, resale_price:150, contract_printed:0, created: iso(2), updated: iso(2) }
    ];
    used.forEach(function(u){
      u.brand = u.brand || u.device_name.split(' ')[0]; u.model = u.model || ''; u.storage = u.storage || ''; u.color = u.color || '';
      u.grade = u.grade || (u.condition === 'good' ? 'A' : 'B');
      u.resale_price = u.resale_price || round2(Number(u.purchase_price) * 1.3);
      u.status = u.status || 'in_stock'; u.warranty_days = u.warranty_days || 0;
    });
    seedJsonSheet_(ss, SHEETS.USED_PHONES, used);

    // ---- Expenses ----
    var EXP = function(id, cat, amt, method, payee, daysAgo, note){
      return { id:id, date: ymd(new Date(now.getTime() - daysAgo * 864e5)), category:cat, amount:amt, payment_method:method,
        payee:payee, note:note || '', user_id:1, created: iso(daysAgo), updated: iso(daysAgo) };
    };
    var expenses = [
      EXP(1, 'rent',      1200, 'bank_transfer', 'Property Owner',   28, 'Monthly shop rent'),
      EXP(2, 'salaries',  2400, 'bank_transfer', 'Staff Payroll',    27, 'Monthly salaries'),
      EXP(3, 'utilities',  180, 'cash',          'Utility Provider', 20, 'Electricity + water'),
      EXP(4, 'marketing',  150, 'card',          'Ad Platform',      12, 'Boosted posts'),
      EXP(5, 'parts',       95, 'cash',          'Supplier 3',        6, 'Workshop consumables'),
      EXP(6, 'misc',        40, 'cash',          'Office Supplies',   2, 'Stationery')
    ];
    seedJsonSheet_(ss, SHEETS.EXPENSES, expenses);

    // ---- Payments (credit ledger) ----
    var payments = [
      { id:1, customer_id:4, ref_type:'sale',   ref_id:6, amount:10, method:'cash', note:'Part payment', user_id:3, created: iso(34), updated: iso(34) },
      { id:2, customer_id:2, ref_type:'repair', ref_id:2, amount:30, method:'cash', note:'Deposit',      user_id:3, created: iso(2),  updated: iso(2) }
    ];
    seedJsonSheet_(ss, SHEETS.PAYMENTS, payments);

    // ---- Installments (plan on the partial sale #6, one row overdue for the reminder widget) ----
    var s6 = partialSale, s6due = round2(s6.due_amount), s6a = round2(s6due / 2), s6b = round2(s6due - s6a);
    var installments = [
      { id:1, sale_id:6, customer_id:4, due_date: ymd(new Date(now.getTime() - 20 * 864e5)), amount:s6a, paid_amount:0, status:'overdue', paid_date:'', notes:'', created: iso(33), updated: iso(33) },
      { id:2, sale_id:6, customer_id:4, due_date: ymd(new Date(now.getTime() + 10 * 864e5)), amount:s6b, paid_amount:0, status:'pending', paid_date:'', notes:'', created: iso(33), updated: iso(33) }
    ];
    seedJsonSheet_(ss, SHEETS.INSTALLMENTS, installments);

    // ---- Cash drawer (two closed till sessions for history) ----
    var drawer = [
      { id:1, opened_by:2, opening_float:100, opened_at: iso(3, 8), closed_by:2, closed_at: iso(3, 1), expected_cash:340, counted_cash:340, variance:0,  notes:'Balanced',    status:'closed', created: iso(3, 8), updated: iso(3, 1) },
      { id:2, opened_by:3, opening_float:100, opened_at: iso(2, 8), closed_by:2, closed_at: iso(2, 1), expected_cash:275, counted_cash:270, variance:-5, notes:'Short by 5',  status:'closed', created: iso(2, 8), updated: iso(2, 1) }
    ];
    seedJsonSheet_(ss, SHEETS.CASH_DRAWER, drawer);

    // ---- Activity logs ----
    var logs = [
      { id:1, user_id:1, action_type:'login', reference_table:'Users', reference_id:1, description:'Owner logged in', ip_address:'', created: iso(7), updated: iso(7) },
      { id:2, user_id:3, action_type:'sale', reference_table:'Sales', reference_id:1, description:'Sale completed', ip_address:'', created: iso(5), updated: iso(5) },
      { id:3, user_id:3, action_type:'repair', reference_table:'Repairs', reference_id:1, description:'New repair: Smartphone Model 1', ip_address:'', created: iso(7), updated: iso(7) },
      { id:4, user_id:2, action_type:'used_phone_purchase', reference_table:'Used_Phones', reference_id:1, description:'Bought used Smartphone Model 5', ip_address:'', created: iso(6), updated: iso(6) },
      { id:5, user_id:2, action_type:'inventory_adjustment', reference_table:'Products', reference_id:9, description:'Stock -2 (Power Bank)', ip_address:'', created: iso(2), updated: iso(2) },
      { id:6, user_id:1, action_type:'product_edit', reference_table:'Products', reference_id:1, description:'Updated product: Smartphone Model 1', ip_address:'', created: iso(1), updated: iso(1) }
    ];
    seedJsonSheet_(ss, SHEETS.LOGS, logs);

    ss.deleteSheet(temp);

    return {
      success: true, message: 'Phone Shop POS demo data ready!',
      summary: { users: demoUsers.length, suppliers: suppliers.length, products: products.length, customers: customers.length, sales: sales.length, repairs: repairs.length, usedPhones: used.length, expenses: expenses.length, returns: 1, payments: payments.length, installments: installments.length, tillSessions: drawer.length }
    };
  } catch (e) { return { success: false, message: 'Error: ' + e }; }
}
