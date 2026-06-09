# Gold Ledger — Gamage Jewellers

A web app for managing wholesale 22kt jewellery accounts. Replaces the Excel "shop cards" previously used to track how much 24kt gold each jeweller owes.

## How it works

Each jeweller has a single account with a running balance denominated in **24kt gold grams**. The balance is computed from an append-only stream of ledger entries — it is never stored directly.

**Balance = total sold − total returned − total settled**

### Entry types

| Type | Effect | Fields |
|------|--------|--------|
| `SALE` | + balance | date, details, weight (g), rate (%) |
| `RETURN` | − balance | date, details, weight (g), rate (%) |
| `GOLD_PAYMENT` | − balance | date, details, weight (g, 24kt) |
| `CASH_PAYMENT` | − balance | date, details, cash (Rs), 24kt price per gram (Rs) |

Conversion formulas (integer milligrams throughout — no floating-point arithmetic):
- Sale/Return amount: `round(weightMg × ratePct / 100)`
- Cash payment amount: `round(cashCents × 1000 / pricePerGramCents)`

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Recharts |
| Backend | Node.js, Express 4 |
| Database | MongoDB (Mongoose 8) |
| Auth | bcryptjs, JWT (7-day sessions) |

## Project structure

```
gold-ledger/
├── client/          # React SPA (Vite)
│   └── src/
│       ├── App.jsx          # Auth gate — Login or GoldLedger
│       ├── Login.jsx        # Login form
│       ├── GoldLedger.jsx   # Main app shell + all views
│       └── HorseMark.jsx    # Brand mark SVG
└── server/          # Express REST API
    └── src/
        ├── app.js           # Express app (routes wired here)
        ├── index.js         # DB connect + server listen
        ├── models/          # Mongoose schemas (User, Account, Entry)
        ├── routes/          # auth, accounts, entries, users, health
        ├── middleware/
        │   └── requireAuth.js
        ├── lib/
        │   └── balance.js   # entryAmountMg, computeBalance, buildRunningLedger
        └── scripts/
            └── create-admin.js   # CLI helper for first-time setup
```

## Getting started

### Prerequisites

- Node.js 18+
- A MongoDB connection string (local or Atlas free tier)

### 1. Install dependencies

```bash
npm install             # root (concurrently)
npm install --prefix server
npm install --prefix client
```

### 2. Configure the server

Create `server/.env`:

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/gold-ledger
JWT_SECRET=change-me-to-a-long-random-string
PORT=3000
FRONTEND_URL=http://localhost:5173
```

### 3. Create the first admin user

The first `POST /auth/register` request is open (no auth required) and automatically grants the `admin` role. Either use the UI's login page to self-register, or use the CLI script:

```bash
cd server
node src/scripts/create-admin.js "Your Name" your@email.com
```

### 4. Start development servers

```bash
npm run dev        # starts both server (:3000) and client (:5173) in parallel
npm run dev:server # server only
npm run dev:client # client only
```

The client proxies API requests to the server via the `VITE_API_URL` env var (defaults to same origin if unset).

## API reference

All routes except `/auth/login`, `/auth/register` (first user), and `/health` require a `Authorization: Bearer <token>` header.

```
GET    /health                        DB connection status

POST   /auth/login                    { email, password } → { token, user }
POST   /auth/register                 { name, email, password, role }  (admin-only after first user)

GET    /accounts                      list active accounts with current balance
GET    /accounts/archived             list archived accounts  (admin)
GET    /accounts/stats                monthly sales/settlements/margin for charts
POST   /accounts                      create account
GET    /accounts/:id                  account + full running ledger
PATCH  /accounts/:id/archive          soft-archive  (admin)
PATCH  /accounts/:id/unarchive        restore  (admin)

POST   /accounts/:id/entries          add entry
PATCH  /entries/:id                   edit entry (previous version saved to history[])
PATCH  /entries/:id/void              soft-delete (status → "voided", excluded from balance)

GET    /users                         list all users  (admin)
PATCH  /users/:id/role                change role  (admin)
PATCH  /users/:id/deactivate          prevent login  (admin)
PATCH  /users/:id/reactivate          restore login  (admin)
```

## User roles

| Role | Can do |
|------|--------|
| `operator` | View accounts and ledger |
| `staff` | View + add/edit entries |
| `admin` | All of the above + void entries, archive accounts, manage users |

## Precision rules

All gold weights are stored and computed as **integer milligrams** (`grams × 1000`). All cash amounts are stored as **integer cents** (`rupees × 100`). Division to display units happens only at render time. This prevents floating-point rounding errors in financial calculations.

## Audit trail

Entries are never hard-deleted. To remove one, an admin sets `status: "voided"` — voided entries are excluded from balance computation but remain in the database. Every edit appends the previous state to `entry.history[]` with who changed it and when.

## Building for production

```bash
npm run build --prefix client   # outputs to client/dist/
npm start --prefix server       # runs the server without --watch
```

Serve `client/dist/` from a static host or configure Express to serve it. Set `FRONTEND_URL` in the server env to the deployed frontend origin for CORS.
