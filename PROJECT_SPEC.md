# Gold Ledger — Project Spec

A web app to replace the Excel "shop cards" used by a **wholesale 22kt jewellery business**.
Each jeweller (customer) has one account with a running balance, tracked in **24kt gold grams**.

---

## 1. Domain model (read this first)

- We manufacture jewellery in **22kt** gold and sell wholesale to ~50 jewellers.
- For each sale, the buyer agrees a **rate %**. The gold they owe is `weight × rate%`, expressed as **24kt grams**.
  - Example: a 10.000 g piece at 102% → buyer owes **10.200 g of 24kt gold**.
- There is **ONE pooled balance per account**, not per-piece tracking.
  - A shop borrows on 05-15, borrows again on 05-18 → both just add to one total borrowed.
  - A payment reduces that single pool. We never track "which piece is unpaid".
- Buyers must settle within ~2 weeks, two ways:
  - **Gold payment** — they hand over pure 24kt gold. Reduces balance directly.
  - **Cash payment** — they pay rupees; we convert at **that day's 24kt price per gram** into grams, then reduce the balance.

**Balance (24kt g) = total borrowed − total settled − returns**

---

## 2. Entry types

Every account is a stream of dated entries. Balance is **computed** from the stream, never stored/typed.

| Type           | Effect on balance | Fields captured                                  |
|----------------|-------------------|--------------------------------------------------|
| `SALE`         | + (increases)     | date, details, weightOut (g), rate (%)           |
| `RETURN`       | - (decreases)     | date, details, weight (g)  *(see open question)* |
| `GOLD_PAYMENT` | - (decreases)     | date, details, weight (g, 24kt)                  |
| `CASH_PAYMENT` | - (decreases)     | date, details, cash (Rs), price (Rs/g 24kt)      |

### Conversion formulas
- `SALE` grams owed (mg) = round(weightOutMg * ratePct / 100)
- `CASH_PAYMENT` grams settled (mg) = round(cashCents * 1000 / pricePerGramCents)

---

## 3. Precision rules (NON-NEGOTIABLE)

This is real money. **Never do arithmetic on floating-point decimals.**
- Store all **gold weights as integer milligrams** (grams * 1000).
- Store all **cash as integer cents** (rupees * 100).
- Convert to grams/rupees **only for display**.
- Round explicitly with `Math.round` at conversion boundaries.

---

## 4. Data model (MongoDB / Mongoose)

### User
```
{ name, email (unique), passwordHash, role: "admin"|"staff", createdAt }
```

### Account
```
{ name, place, phone, createdAt, createdBy }
```

### Entry  (append-only — see audit rules)
```
{
  accountId (ref Account),
  date,                         // the transaction date (not entry-creation date)
  type: "SALE"|"RETURN"|"GOLD_PAYMENT"|"CASH_PAYMENT",
  details,                      // e.g. "Chain", "Bracelet"
  weightMg,                     // for SALE/RETURN/GOLD_PAYMENT
  ratePct,                      // for SALE only
  cashCents, pricePerGramCents, // for CASH_PAYMENT only
  status: "active"|"voided",    // never hard-delete
  createdBy (ref User), createdAt,
  history: [ { changedBy, changedAt, before } ]  // edit trail
}
```

### Audit trail (because multiple people enter data + real money)
- **Never hard-delete** an entry. To remove, set `status: "voided"` (voided entries are excluded from balance).
- **Edits** push the previous version into `history[]` with who/when, then update fields.
- Every entry records `createdBy` and `createdAt`.

---

## 5. Architecture

- **Frontend:** React (Vite). Account list -> account ledger view -> add/edit entry form.
- **Backend:** Node.js + Express. REST API. Mongoose for MongoDB.
- **DB:** MongoDB (Atlas free tier is fine to start).
- **Auth:** email + password, hashed with bcrypt, JWT for sessions, role-based (admin/staff).
- Balance computation lives on the **server** (single source of truth); the frontend displays it.

### Core API routes (first pass)
```
POST   /auth/login
GET    /accounts                 list (with current balance)
POST   /accounts                 create
GET    /accounts/:id             account + computed running ledger
POST   /accounts/:id/entries     add entry
PATCH  /entries/:id              edit (writes to history)
PATCH  /entries/:id/void         void (soft delete)
```

---

## 6. Build phases (roadmap)

- **Phase 0 — Scaffold:** repo, `/server` + `/client`, connect to MongoDB, health-check route.
- **Phase 1 — Data + balance:** Mongoose models, account & entry CRUD, server-side balance computation (port the logic from the prototype).
- **Phase 2 — UI:** account list with balances, ledger table, add-entry form per type. (Reuse prototype design.)
- **Phase 3 — Auth + audit:** users, login, JWT, role gating, soft-delete + edit history.
- **Phase 4 — Polish:** account search/filter, a totals/overview screen, input validation, CSV export, error states.

---

## 7. Open questions (resolve before/early in Phase 1)

1. **RETURN gold karat:** when a buyer returns gold, is it always 24kt, or sometimes 22kt scrap that must be converted before reducing the balance? If it can vary, RETURN needs its own karat/rate field like a sale.
2. **Negative balance:** can a balance go negative (buyer overpays / credit)? If yes, the UI should show it clearly rather than treating it as an error.
3. **Multiple users:** do we need per-user roles now (admin vs staff), or is everyone the same to start?
