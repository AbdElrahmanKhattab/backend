const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

const app = express();

/* ======================
   CONFIG
====================== */
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

/* ======================
   MIDDLEWARE
====================== */
app.use(cors());
app.use(express.json());

/* ======================
   HEALTH CHECK (REQUIRED)
====================== */
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

/* ======================
   DATABASE CONNECTION
====================== */
let pool;

async function initDB() {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  await pool.query("SELECT 1");
  console.log("✅ Database connected");
}

initDB().catch(err => {
  console.error("❌ Database connection failed:", err);
});

/* ======================
   AUTH MIDDLEWARE
====================== */
function authMiddleware(requiredRole) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Missing token" });

    const token = authHeader.split(" ")[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ message: "Forbidden" });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
}

/* ======================
   AUTH ROUTES
====================== */
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (email, passwordHash, role) VALUES (?, ?, 'student')`,
      [email, passwordHash]
    );

    const token = jwt.sign(
      { id: result.insertId, email, role: "student" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await pool.query(
    `SELECT * FROM users WHERE email = ?`,
    [email]
  );

  if (!rows.length)
    return res.status(401).json({ message: "Invalid credentials" });

  const user = rows[0];
  if (!bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

/* ======================
   PUBLIC ROUTES
====================== */
app.get("/api/categories", async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM categories ORDER BY name ASC`);
  res.json(rows);
});

/* ======================
   EXAMPLE PROTECTED ROUTE
====================== */
app.get("/api/cases", authMiddleware(), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM cases ORDER BY id ASC`
  );
  res.json(rows);
});

/* ======================
   GLOBAL ERROR HANDLING
====================== */
process.on("unhandledRejection", err => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", err => {
  console.error("Uncaught Exception:", err);
});

/* ======================
   START SERVER
====================== */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
