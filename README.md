# 🐾 Paw Paw Pet Grooming Centre — Full Project

## Tech Stack
- **React + Vite** (frontend framework)
- **Tailwind CSS** (styling)
- **Firebase Auth** (user + admin login)
- **Firebase Firestore** (database — bookings, reviews)
- **React Router v6** (page navigation)

---

## 📁 Complete Project Structure

```
pawpaw-pet-grooming/              ← Root folder (create this anywhere)
│
├── index.html                    ← Main HTML entry point
├── package.json                  ← Dependencies & scripts
├── vite.config.js                ← Vite bundler config
├── tailwind.config.js            ← Tailwind CSS config
├── postcss.config.js             ← PostCSS config (needed by Tailwind)
├── .env                          ← Firebase keys (you create this — see below)
├── .gitignore                    ← Ignore node_modules, .env etc.
│
└── src/                          ← All your source code lives here
    │
    ├── main.jsx                  ← App entry point (renders React into index.html)
    ├── App.jsx                   ← Main router — all routes defined here
    ├── index.css                 ← Global styles + Tailwind directives
    ├── firebase.js               ← Firebase config & exports
    │
    ├── context/
    │   └── AuthContext.jsx       ← Global auth state (user, isAdmin, logout)
    │
    ├── utils/
    │   └── services.js           ← Services list, time slots, pet types, statuses
    │
    ├── components/               ← Reusable UI components
    │   ├── Navbar.jsx            ← Top navigation bar
    │   └── Footer.jsx            ← Site footer
    │
    ├── pages/                    ← Public + user pages
    │   ├── Home.jsx              ← Landing page (hero, services preview, map)
    │   ├── Services.jsx          ← All services with booking counts
    │   ├── Book.jsx              ← 3-step booking form (login required)
    │   ├── MyBookings.jsx        ← User's booking history (login required)
    │   ├── Reviews.jsx           ← Public reviews + submit review
    │   └── Login.jsx             ← Google login + email/password + signup
    │
    └── admin/                    ← Admin-only pages (owner login required)
        ├── AdminLayout.jsx       ← Sidebar layout wrapper for admin
        ├── AdminDashboard.jsx    ← Stats overview + charts
        ├── AdminBookings.jsx     ← All bookings + status management
        └── AdminReviews.jsx      ← All reviews + delete option
```

---

## 🔥 Firebase Setup (Step by Step)

### Step 1 — Create Firebase Project
1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"**
3. Name it: `pawpaw-grooming`
4. Disable Google Analytics (optional)
5. Click **Create project**

### Step 2 — Enable Authentication
1. In Firebase Console → Left sidebar → **Build → Authentication**
2. Click **"Get started"**
3. Enable **Google** (Sign-in providers tab)
   - Click Google → Enable → Add support email → Save
4. Enable **Email/Password**
   - Click Email/Password → Enable → Save

### Step 3 — Create Firestore Database
1. Left sidebar → **Build → Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (for development)
4. Select region: `asia-south1` (Mumbai — closest to Pune)
5. Click **Enable**

### Step 4 — Get Your Firebase Config
1. Left sidebar → **Project Settings** (gear icon at top)
2. Scroll down to **"Your apps"**
3. Click **Web icon (</>)**
4. Register app name: `pawpaw-web`
5. Copy the `firebaseConfig` object

### Step 5 — Add Config to Project
Open `src/firebase.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",               // ← paste your values
  authDomain: "pawpaw-grooming.firebaseapp.com",
  projectId: "pawpaw-grooming",
  storageBucket: "pawpaw-grooming.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
}

// Also update admin email to the owner's email:
export const ADMIN_EMAIL = "owner@gmail.com"   // ← owner's Google account
```

### Step 6 — Set Firestore Security Rules
In Firebase Console → Firestore → **Rules** tab, paste this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Bookings: users can read/write their own; admin reads all
    match /bookings/{bookingId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.userId;
      allow read, write: if request.auth != null
        && request.auth.token.email == "owner@gmail.com";
      allow create: if request.auth != null;
    }

    // Reviews: anyone can read; logged in users can write
    match /reviews/{reviewId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth != null
        && request.auth.token.email == "owner@gmail.com";
    }
  }
}
```
> ⚠️ Replace `owner@gmail.com` with the actual owner email

---

## 🚀 How to Run Locally

```bash
# Step 1: Go into the project folder
cd pawpaw-pet-grooming

# Step 2: Install all dependencies
npm install

# Step 3: Start the dev server
npm run dev

# Open browser at: http://localhost:5173
```

---

## 🌐 How to Deploy (Vercel — Free)

```bash
# Step 1: Install Vercel CLI
npm install -g vercel

# Step 2: Build the project
npm run build

# Step 3: Deploy
vercel

# Follow the prompts — it gives you a live URL instantly
```

Or use **Netlify**:
1. Run `npm run build` → creates a `dist/` folder
2. Go to [netlify.com](https://netlify.com) → drag & drop the `dist/` folder
3. Done — live URL in 30 seconds

---

## 👥 User Roles Explained

| Role | How to Login | What They Can Do |
|------|-------------|-----------------|
| **Guest** | Not logged in | View home, services, reviews |
| **User** | Google or Email/Password | Book appointments, view own bookings, write reviews |
| **Admin (Owner)** | Email/Password with owner's email | View dashboard, manage all bookings, delete reviews |

### Admin Login
- Owner logs in at `/login` using their email (the one set in `ADMIN_EMAIL`)
- They automatically see the **Admin Dashboard** link in the navbar
- Admin panel is at `/admin`

---

## 🗄️ Firestore Collections (Auto-created on first use)

### `bookings` collection
```
{
  userId: "firebase_user_id",
  userEmail: "user@email.com",
  ownerName: "Rahul Sharma",
  phone: "9876543210",
  petName: "Bruno",
  petType: "Dog",
  petBreed: "Labrador",
  serviceId: "haircut",
  serviceName: "Hair Cut",
  date: "2025-02-20",
  slot: "10:00 AM",
  notes: "Bruno is shy with strangers",
  status: "pending",        // pending | confirmed | completed | cancelled
  createdAt: Timestamp
}
```

### `reviews` collection
```
{
  userId: "firebase_user_id",
  userEmail: "user@email.com",
  userName: "Priya Joshi",
  userPhoto: "https://...",
  rating: 5,
  comment: "Amazing service! Bruno looks so handsome.",
  petName: "Bruno",
  createdAt: Timestamp
}
```

---

## ➕ How to Add a New Service

Open `src/utils/services.js` and add to the `SERVICES` array:

```js
{
  id: 'flea_treatment',          // unique ID (no spaces)
  name: 'Flea Treatment',
  icon: '🦟',
  description: 'Safe and effective flea removal treatment.',
  duration: '45 min',
  price: '₹500 – ₹900',
  color: '#9B59B6',
}
```

That's it — it automatically appears on the Services page, booking form, and admin dashboard.

---

## ➕ How to Add a New Time Slot

Open `src/utils/services.js` → `TIME_SLOTS` array → add your slot:
```js
export const TIME_SLOTS = [
  '09:00 AM',
  '09:30 AM',
  // ... add more here
]
```

---

## 📞 Update Shop Details

All contact info is in:
- `src/components/Footer.jsx` — address, phone, email, social links
- `src/pages/Home.jsx` — map embed + contact section

Update the Google Maps embed URL in `Home.jsx`:
```
Replace the `src` of the iframe with the actual Google Maps embed URL for the shop
```

---

## 🔧 Customization Quick Reference

| What to change | Where |
|---------------|-------|
| Shop name / branding | `index.html`, `Navbar.jsx`, `Footer.jsx` |
| Services list | `src/utils/services.js` |
| Time slots | `src/utils/services.js` |
| Colors / theme | `tailwind.config.js` + `src/index.css` |
| Admin email | `src/firebase.js` → `ADMIN_EMAIL` |
| Google Maps location | `src/pages/Home.jsx` → iframe src |
| Social media links | `src/components/Footer.jsx` |
| Firebase project | `src/firebase.js` → `firebaseConfig` |

---

## 📦 npm Packages Used

| Package | Purpose |
|---------|---------|
| `react` + `react-dom` | UI framework |
| `react-router-dom` | Page routing |
| `firebase` | Auth + Firestore database |
| `lucide-react` | Icons |
| `date-fns` | Date formatting |
| `tailwindcss` | Utility CSS styling |
| `vite` | Fast dev server + build tool |

---

## ✅ Checklist Before Going Live

- [ ] Firebase config added to `src/firebase.js`
- [ ] `ADMIN_EMAIL` set to owner's actual email
- [ ] Firestore security rules updated with owner email
- [ ] Google Maps embed URL updated with real shop location
- [ ] Social media links updated in Footer
- [ ] Phone numbers verified in Footer and Home
- [ ] Owner tested login and admin panel
- [ ] Test booking flow end-to-end
- [ ] Deploy to Vercel or Netlify
- [ ] Connect custom domain (e.g. pawpawgrooming.com)
