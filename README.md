# 📱 Phone Shop POS & Repair Center Management System

[![Frontend: Netlify](https://img.shields.io/badge/Frontend-Netlify-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)](https://www.netlify.com/)
[![Backend: Firebase](https://img.shields.io/badge/Backend-Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Database: Firestore](https://img.shields.io/badge/Database-Firestore-FFCA28?style=for-the-badge&logo=google-cloud&logoColor=black)](https://firebase.google.com/docs/firestore)
[![Language: HTML/CSS/React](https://img.shields.io/badge/Built%20With-HTML%20%7C%20CSS%20%7C%20React-007ACC?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)

A premium, feature-rich Point of Sale (POS) and repair tracker built specifically for mobile phone shops. This software helps manage inventory, track repairs, buy/resell used phones with IMEI checkups, handle customer installment plans (EMI), open/close cash shifts, and view detailed financial report analytics.

Originally built on Google Sheets, this system is now fully upgraded with a **Serverless Firebase (Firestore & Storage)** backend and is ready to deploy on **Netlify** with a single click.

---

## 🌟 Key Features

*   🛒 **Smart POS Dashboard**: Perform sales, calculate VAT/discount per item, apply store credit, redeem customer loyalty points, and print thermal receipt layouts.
*   🔧 **Repair Job Ticket Manager**: Register repairs, track hardware statuses (In Repair, Repaired, Delivered), calculate part vs. labor costs, and print thermal job tickets.
*   📲 **WhatsApp Integration**: Instantly send status update notifications & WhatsApp invoice links to customers.
*   🏷️ **Used Phone Trade-In**: Buy used phones from customers with IMEI checks, calculate grade-based resale value deviations, capture ID card photos, and print formal purchase contracts.
*   🔍 **IMEI Lookup History**: Enter an IMEI to view its full transaction history (when it was bought, sold, or brought in for repair).
*   💳 **Installment (EMI) Plans**: Create flexible repayment plans on outstanding dues, track pending/overdue schedules, and record payments.
*   💰 **Finance & Expenses**: Categorized business expense tracking and full P&L reports.
*   🔒 **RBAC (Role Based Access Control)**: Restrict pages and CRUD actions dynamically for Owners, Managers, and Employees.
*   📊 **Real-time Business Reports**: Dynamic charts displaying sales trends, payment method mixes, top-selling products, and stock valuations.
*   🌓 **Theme Manager**: Built-in Dark and Light mode presets with custom accent color styling.

---

## ⚙️ Setup & Deployment Guide

Follow this quick guide to deploy the POS application on your own serverless infrastructure in under 5 minutes.

### Step 1: Create a Firebase Project
1.  Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  Enable **Cloud Firestore** database (Start in **Test Mode** or apply security rules).
3.  Enable **Firebase Storage** (For hosting profile photos, product images, and seller ID scans).
4.  Register a new **Web App** in your project settings and copy the `firebaseConfig` credentials object.

### Step 2: Deploy Frontend to Netlify
1.  Create a free account on [Netlify](https://www.netlify.com/).
2.  Click **Add new site** -> **Import from an existing project**.
3.  Connect to your GitHub account, choose this repository (`PosMobile`), and select the `main` branch.
4.  Leave the build settings blank and click **Deploy Site**.

### Step 3: Initialize Database
1.  Open your deployed Netlify web app link in a browser.
2.  A beautiful **Firebase Setup Wizard** overlay will appear.
3.  Paste the `firebaseConfig` credentials object that you copied from Firebase Console.
4.  Click **Connect & Save**.
5.  Click **Initialize & Seed Database** (This will automatically configure Firestore structures, create default roles, populate settings, add demo stock items, and set up your initial admin login).
6.  The page will reload automatically. You're done!

---

## 🔑 Default Administrator Login

*   **Username**: `owner`
*   **Password**: `owner123`

*(Note: You can change the password or create new manager/employee accounts in the **Users/Staff** panel after logging in).*

---

## 🛠️ Technology Stack

*   **Frontend**: Plain HTML5, responsive CSS3, Tailwind CSS icons, dynamic grid layouts.
*   **Javascript Engine**: React (UMD compilation via Babel Standalone browser engine for zero dependencies).
*   **Backend**: Google Firebase Web SDK (Compat version for lightweight static environment).
*   **Database**: Cloud Firestore.
*   **File Storage**: Firebase Storage.
*   **Deployment**: Netlify global CDN.

---

## 📜 Development & Support

Developed with ❤️ for mobile retail businesses.
If you need custom integrations, database exports, or support, feel free to submit an issue or contact the repository administrator.
