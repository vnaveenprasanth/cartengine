# CartEngine API — Checkout & Rewards Service

This repository contains the backend implementation for a robust e-commerce checkout and rewards service. It handles cart management, concurrent inventory deduction, idempotency, and a milestone-based coupon generation system.

For a detailed breakdown of the architectural choices, concurrency handling, and intentional trade-offs made during this timeboxed assignment, please read [DECISIONS.md](./DECISIONS.md).

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### 1. Installation

```bash
git clone <repository-url>
cd <repository-dir>
npm install
```

### 2. Running the Server

Start the development server:

```bash
npm run dev
```

*Note: On the first run, the system will automatically create a local SQLite database (`sqlite.db` in the project root), run all Drizzle migrations, and seed the database with initial products and configurations.*

The server will start on `http://localhost:3000`.

### 3. Running the Tests

The project includes an extensive integration test suite using Vitest and Supertest. The tests specifically target the core concurrency and safety invariants (oversell prevention, idempotent retries, double-coupon redemption races, etc.).

```bash
npm test
```

*(Note: The test suite uses isolated process forks, so every test file runs against its own temporary, perfectly clean database to prevent state pollution).*

### 4. Running the Frontend UI (Optional)

If you'd like to interact with the API via the web interface rather than Swagger or Postman, a frontend client is available in the `frontend/` directory.

In a **new terminal window**, run:

```bash
cd frontend
npm install
npm run dev
```

The frontend will typically start on `http://localhost:5173` (or the port specified in the console output) and will communicate with the backend running on port 3000.

---


## 📖 API Documentation (Swagger / OpenAPI)

Once the server is running, you can view and interact with the full API documentation via the Swagger UI:

👉 **[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**

If you prefer to test via Postman, you can import the raw OpenAPI JSON specification directly into Postman to automatically generate a collection:

👉 **[http://localhost:3000/api-docs.json](http://localhost:3000/api-docs.json)**

---

## 🛠️ Technology Stack

- **Framework:** Express.js (TypeScript)
- **Database:** SQLite (WAL mode enabled for better concurrency)
- **ORM:** Drizzle ORM
- **Validation:** Zod (with middleware for structured 400 responses)
- **Testing:** Vitest + Supertest
- **Documentation:** `swagger-jsdoc` + `swagger-ui-express`

## 📁 Project Structure

```text
src/
├── app.ts                 # Express setup, Swagger config, and DB bootstrap
├── index.ts               # Server entry point
├── db/                    # Drizzle connection, schema, and auto-migrations
├── middleware/            # Error handling and Zod request validation
├── routes/                # Express routers (Products, Carts, Checkout, Admin)
├── schemas/               # Zod schemas for request validation
├── services/              # Core business logic and DB transactions
├── utils/                 # Money formatting and error classes
└── test/                  # Comprehensive integration tests
```
