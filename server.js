const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

const app = express();

/* ======================
   CONFIG
====================== */
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

/* ======================
   MIDDLEWARE
====================== */
app.use(cors());
app.use(express.json());

/* ======================
   HEALTH CHECK (REQUIRED)
====================== */
app.get("/", (req, res) => {
  res.json({ status: "OK" });
});

/* ======================
   DATABASE CONFIG (AIVEN)
====================== */
const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 26324),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  ssl: {
    rejectUnauthorized: false, // REQUIRED for Aiven
  },
};

let pool = null;

/* ======================
   NON-BLOCKING DB INIT
====================== */
async function connectDatabase() {
  try {
    if (!DB_CONFIG.host) {
      console.warn("⚠️ DB env vars missing. Running without DB.");
      return;
    }

    pool = mysql.createPool(DB_CONFIG);
    await pool.query("SELECT 1");
    console.log("✅ Database connected");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    console.log("⚠️ Server will keep running without DB");
  }
}

connectDatabase();

/* ======================
   SQLITE-COMPAT DB API
====================== */
const db = {
  run(sql, params = [], cb) {
    pool.query(sql, params)
      .then(([res]) => cb && cb.call({ lastID: res.insertId, changes: res.affectedRows }, null))
      .catch(err => cb && cb(err));
  },

  get(sql, params = [], cb) {
    pool.query(sql, params)
      .then(([rows]) => cb(null, rows[0]))
      .catch(err => cb(err));
  },

  all(sql, params = [], cb) {
    pool.query(sql, params)
      .then(([rows]) => cb(null, rows))
      .catch(err => cb(err));
  },

  prepare(sql) {
    return {
      run: (...args) => {
        const cb = typeof args.at(-1) === "function" ? args.pop() : null;
        pool.query(sql, args).then(() => cb && cb()).catch(err => cb && cb(err));
      },
      finalize() {}
    };
  },

  serialize(fn) {
    fn && fn();
  }
};

/* ======================
   AUTH MIDDLEWARE
====================== */
function authMiddleware(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ message: "Missing token" });

    try {
      const token = header.split(" ")[1];
      const payload = jwt.verify(token, JWT_SECRET);

      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ message: "Forbidden" });
      }

      req.user = payload;
      next();
    } catch {
      res.status(401).json({ message: "Invalid token" });
    }
  };
}

/* ======================
   AUTH ROUTES
====================== */
app.post("/api/auth/register", (req, res) => {
  if (!pool) return res.status(503).json({ message: "DB unavailable" });

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  const hash = bcrypt.hashSync(password, 10);

  db.run(
    `INSERT INTO users (email, passwordHash, role) VALUES (?, ?, 'student')`,
    [email, hash],
    function (err) {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ message: "Email already exists" });
        }
        return res.status(500).json({ message: "Registration failed" });
      }

      const token = jwt.sign(
        { id: this.lastID, email, role: "student" },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({ token });
    }
  );
});

app.post("/api/auth/login", (req, res) => {
  if (!pool) return res.status(503).json({ message: "DB unavailable" });

  const { email, password } = req.body;

  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user });
  });
});

/* ======================
   🔥 ALL YOUR OTHER ROUTES GO HERE
   (PASTE THEM EXACTLY AS THEY ARE)
====================== */

app.get('/api/me', authMiddleware(), (req, res) => {
  db.get(
    `SELECT id, email, role, name, profileImage, membershipType, membershipExpiresAt FROM users WHERE id = ?`,
    [req.user.id],
    (err, user) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json(user);
    }
  );
});

app.put('/api/user/profile', authMiddleware(), (req, res) => {
  const { name, profileImage } = req.body;
  db.run(
    `UPDATE users SET name = ?, profileImage = ? WHERE id = ?`,
    [name, profileImage, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Profile updated successfully' });
    }
  );
});

app.get('/api/profile/stats', authMiddleware(), (req, res) => {
  // Get cases completed and total score
  db.get(
    `SELECT 
       COUNT(DISTINCT caseId) as casesCompleted,
       SUM(score) as totalScore
     FROM progress
     WHERE userId = ? AND isCompleted = 1`,
    [req.user.id],
    (err, stats) => {
      if (err) return res.status(500).json({ message: 'Database error' });

      // Get completed cases list
      db.all(
        `SELECT p.caseId, p.score, p.createdAt as completedAt, c.title
         FROM progress p
         JOIN cases c ON p.caseId = c.id
         WHERE p.userId = ? AND p.isCompleted = 1
         ORDER BY p.createdAt DESC`,
        [req.user.id],
        (errCases, completedCases) => {
          if (errCases) return res.status(500).json({ message: 'Database error' });

          // Get rank
          db.all(
            `SELECT userId, SUM(score) as totalScore
             FROM progress
             WHERE isCompleted = 1
             GROUP BY userId
             ORDER BY totalScore DESC`,
            [],
            (err2, leaderboard) => {
              if (err2) return res.status(500).json({ message: 'Database error' });

              const rank = leaderboard.findIndex(u => u.userId === req.user.id) + 1;

              // Get membership info
              db.get(
                `SELECT membershipType, membershipExpiresAt FROM users WHERE id = ?`,
                [req.user.id],
                (err3, user) => {
                  if (err3) return res.status(500).json({ message: 'Database error' });

                  res.json({
                    casesCompleted: stats.casesCompleted || 0,
                    totalScore: stats.totalScore || 0,
                    rank: rank || '-',
                    membershipType: user.membershipType,
                    membershipExpiresAt: user.membershipExpiresAt,
                    completedCases: completedCases || []
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

app.get('/api/cases', authMiddleware(), (req, res) => {
  db.all(
    `SELECT c.*, cat.name as categoryName, cat.icon as categoryIcon,
      COALESCE((
        SELECT MAX(isCompleted) FROM progress p
        WHERE p.userId = ? AND p.caseId = c.id
      ), 0) as isCompleted
     FROM cases c
     LEFT JOIN categories cat ON c.categoryId = cat.id
     ORDER BY c.id ASC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      const cases = rows.map((row) => ({
        id: row.id,
        title: row.title,
        specialty: row.specialty,
        difficulty: row.difficulty,
        isLocked: !!row.isLocked,
        prerequisiteCaseId: row.prerequisiteCaseId,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        isCompleted: !!row.isCompleted,
        thumbnailUrl: row.thumbnailUrl,
        duration: row.duration || 10,
        categoryId: row.categoryId,
        categoryName: row.categoryName || row.category,
        categoryIcon: row.categoryIcon
      }));
      res.json(cases);
    }
  );
});

app.get('/api/cases/:id', authMiddleware(), (req, res) => {
  const caseId = req.params.id;
  db.get(`SELECT * FROM cases WHERE id = ?`, [caseId], (err, caseRow) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!caseRow) return res.status(404).json({ message: 'Case not found' });

    if (caseRow.prerequisiteCaseId) {
      db.get(
        `SELECT MAX(isCompleted) as done
         FROM progress
         WHERE userId = ? AND caseId = ?`,
        [req.user.id, caseRow.prerequisiteCaseId],
        (err2, row) => {
          if (err2) return res.status(500).json({ message: 'Database error' });
          if (!row || !row.done) {
            return res.status(403).json({
              message: 'You must complete the prerequisite case first.',
            });
          }
          loadCaseSteps();
        }
      );
    } else {
      loadCaseSteps();
    }

    function loadCaseSteps() {
      db.all(
        `SELECT * FROM case_steps WHERE caseId = ? ORDER BY stepIndex ASC`,
        [caseId],
        (err3, steps) => {
          if (err3) return res.status(500).json({ message: 'Database error' });
          if (!steps.length)
            return res
              .status(500)
              .json({ message: 'Case has no steps configured' });

          const stepIds = steps.map((s) => s.id);
          const placeholders = stepIds.map(() => '?').join(',');

          if (stepIds.length === 0) {
            return res.json({ ...caseRow, steps: [] });
          }

          db.all(
            `SELECT * FROM case_step_options WHERE stepId IN (${placeholders})`,
            stepIds,
            (err4, options) => {
              if (err4)
                return res.status(500).json({ message: 'Database error' });
              db.all(
                `SELECT * FROM investigations WHERE stepId IN (${placeholders})`,
                stepIds,
                (err5, inv) => {
                  if (err5)
                    return res
                      .status(500)
                      .json({ message: 'Database error' });
                  db.all(
                    `SELECT * FROM xrays WHERE stepId IN (${placeholders})`,
                    stepIds,
                    (err6, xrays) => {
                      if (err6)
                        return res
                          .status(500)
                          .json({ message: 'Database error' });

                      const stepsDto = steps.map((s) => ({
                        id: s.id,
                        stepIndex: s.stepIndex,
                        type: s.type,
                        content: s.content ? JSON.parse(s.content) : null,
                        question: s.question,
                        explanationOnFail: s.explanationOnFail,
                        maxScore: s.maxScore,
                        options: options.filter((o) => o.stepId === s.id).map(
                          (o) => ({
                            id: o.id,
                            label: o.label,
                          })
                        ),
                        investigations: inv
                          .filter((i) => i.stepId === s.id)
                          .map((i) => ({
                            id: i.id,
                            groupLabel: i.groupLabel,
                            testName: i.testName,
                            description: i.description,
                            result: i.result,
                            videoUrl: i.videoUrl,
                          })),
                        xrays: xrays
                          .filter((x) => x.stepId === s.id)
                          .map((x) => {
                            return {
                              id: x.id,
                              label: x.label,
                              icon: x.icon,
                              imageUrl: x.imageUrl,
                            };
                          }),
                      }));

                      res.json({
                        id: caseRow.id,
                        title: caseRow.title,
                        specialty: caseRow.specialty,
                        difficulty: caseRow.difficulty,
                        category: caseRow.category,
                        metadata: caseRow.metadata
                          ? JSON.parse(caseRow.metadata)
                          : {},
                        thumbnailUrl: caseRow.thumbnailUrl,
                        duration: caseRow.duration || 10,
                        steps: stepsDto,
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  });
});

app.post(
  '/api/cases/:caseId/steps/:stepId/answer',
  authMiddleware(),
  (req, res) => {
    const { selectedOptionId, isFinalStep } = req.body;
    const { caseId, stepId } = req.params;

    db.get(
      `SELECT * FROM case_step_options WHERE id = ? AND stepId = ?`,
      [selectedOptionId, stepId],
      (err, optionRow) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        if (!optionRow)
          return res.status(400).json({ message: 'Invalid option' });

        const isCorrect = !!optionRow.isCorrect;
        if (!isCorrect) {
          return res.json({
            correct: false,
            feedback: optionRow.feedback,
          });
        }

        if (isFinalStep) {
          db.get(
            `SELECT SUM(maxScore) as totalScore
             FROM case_steps WHERE caseId = ?`,
            [caseId],
            (err2, row) => {
              if (err2)
                return res.status(500).json({ message: 'Database error' });
              const score = row.totalScore || 0;
              db.run(
                `INSERT INTO progress (userId, caseId, score, isCompleted)
                 VALUES (?, ?, ?, 1)`,
                [req.user.id, caseId, score],
                function (err3) {
                  if (err3)
                    return res
                      .status(500)
                      .json({ message: 'Database error' });

                  db.get(
                    `SELECT 
                       COUNT(DISTINCT caseId) as casesCompleted,
                       SUM(score) as totalScore
                     FROM progress
                     WHERE userId = ? AND isCompleted = 1`,
                    [req.user.id],
                    (err4, stats) => {
                      if (err4)
                        return res
                          .status(500)
                          .json({ message: 'Database error' });

                      res.json({
                        correct: true,
                        final: true,
                        score,
                        stats: {
                          casesCompleted: stats.casesCompleted || 0,
                          totalScore: stats.totalScore || 0,
                        },
                      });
                    }
                  );
                }
              );
            }
          );
        } else {
          res.json({
            correct: true,
          });
        }
      }
    );
  }
);

app.get('/api/stats/me', authMiddleware(), (req, res) => {
  db.get(
    `SELECT 
       COUNT(DISTINCT caseId) as casesCompleted,
       SUM(score) as totalScore
     FROM progress
     WHERE userId = ? AND isCompleted = 1`,
    [req.user.id],
    (err, stats) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({
        casesCompleted: stats.casesCompleted || 0,
        totalScore: stats.totalScore || 0,
      });
    }
  );
});

app.get('/api/admin/cases', authMiddleware('admin'), (req, res) => {
  db.all(`SELECT c.*, cat.name as categoryName FROM cases c LEFT JOIN categories cat ON c.categoryId = cat.id ORDER BY c.id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    const cases = rows.map((row) => ({
      id: row.id,
      title: row.title,
      specialty: row.specialty,
      category: row.category,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      difficulty: row.difficulty,
      isLocked: !!row.isLocked,
      prerequisiteCaseId: row.prerequisiteCaseId,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      thumbnailUrl: row.thumbnailUrl,
      duration: row.duration || 10,
    }));
    res.json(cases);
  });
});

app.post('/api/admin/cases', authMiddleware('admin'), (req, res) => {
  const { title, specialty, category, categoryId, difficulty, isLocked, prerequisiteCaseId, metadata, thumbnailUrl, duration } =
    req.body;
  if (!title) return res.status(400).json({ message: 'Title is required' });
  db.run(
    `INSERT INTO cases (title, specialty, category, categoryId, difficulty, isLocked, prerequisiteCaseId, metadata, thumbnailUrl, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      specialty || null,
      category || null,
      categoryId || null,
      difficulty || null,
      isLocked ? 1 : 0,
      prerequisiteCaseId || null,
      metadata ? JSON.stringify(metadata) : null,
      thumbnailUrl || null,
      duration || 10,
    ],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({
        id: this.lastID,
        title,
        specialty,
        category,
        categoryId,
        difficulty,
        isLocked: !!isLocked,
        prerequisiteCaseId,
        metadata: metadata || {},
        thumbnailUrl,
        duration: duration || 10,
      });
    }
  );
});

app.put('/api/admin/cases/:id', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  const { title, specialty, category, categoryId, difficulty, isLocked, prerequisiteCaseId, metadata, thumbnailUrl, duration } =
    req.body;
  db.run(
    `UPDATE cases
     SET title = ?, specialty = ?, category = ?, categoryId = ?, difficulty = ?, isLocked = ?, prerequisiteCaseId = ?, metadata = ?, thumbnailUrl = ?, duration = ?
     WHERE id = ?`,
    [
      title,
      specialty || null,
      category || null,
      categoryId || null,
      difficulty || null,
      isLocked ? 1 : 0,
      prerequisiteCaseId || null,
      metadata ? JSON.stringify(metadata) : null,
      thumbnailUrl || null,
      duration || 10,
      id,
    ],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Updated' });
    }
  );
});

app.delete('/api/admin/cases/:id', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM cases WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Deleted' });
  });
});

// --- Step Management Endpoints ---

// GET steps for a case
app.get('/api/admin/cases/:id/steps', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  db.all(`SELECT * FROM case_steps WHERE caseId = ? ORDER BY stepIndex ASC`, [id], (err, steps) => {
    if (err) return res.status(500).json({ message: 'Database error' });

    const stepIds = steps.map((s) => s.id);
    if (stepIds.length === 0) return res.json([]);

    const placeholders = stepIds.map(() => '?').join(',');

    db.all(`SELECT * FROM case_step_options WHERE stepId IN (${placeholders})`, stepIds, (err2, options) => {
      if (err2) return res.status(500).json({ message: 'Database error' });
      db.all(`SELECT * FROM investigations WHERE stepId IN (${placeholders})`, stepIds, (err3, invs) => {
        if (err3) return res.status(500).json({ message: 'Database error' });
        db.all(`SELECT * FROM xrays WHERE stepId IN (${placeholders})`, stepIds, (err4, xrays) => {
          if (err4) return res.status(500).json({ message: 'Database error' });

          const detailedSteps = steps.map((s) => ({
            ...s,
            content: s.content ? JSON.parse(s.content) : {},
            options: options.filter(o => o.stepId === s.id).map(o => ({ ...o, isCorrect: !!o.isCorrect })),
            investigations: invs.filter(i => i.stepId === s.id),
            xrays: xrays.filter(x => x.stepId === s.id)
          }));
          res.json(detailedSteps);
        });
      });
    });
  });
});

// POST new step
app.post('/api/admin/cases/:id/steps', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  const { stepIndex, type, content, question, explanationOnFail, maxScore, options, investigations, xrays } = req.body;

  db.run(
    `INSERT INTO case_steps (caseId, stepIndex, type, content, question, explanationOnFail, maxScore) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, stepIndex, type, JSON.stringify(content), question, explanationOnFail, maxScore],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      const stepId = this.lastID;

      // Insert Options
      if (options && options.length > 0) {
        const stmt = db.prepare(`INSERT INTO case_step_options (stepId, label, isCorrect, feedback) VALUES (?, ?, ?, ?)`);
        options.forEach(o => stmt.run(stepId, o.label, o.isCorrect ? 1 : 0, o.feedback));
        stmt.finalize();
      }

      // Insert Investigations
      if (investigations && investigations.length > 0) {
        const stmt = db.prepare(`INSERT INTO investigations (stepId, groupLabel, testName, description, result, videoUrl) VALUES (?, ?, ?, ?, ?, ?)`);
        investigations.forEach(i => stmt.run(stepId, i.groupLabel, i.testName, i.description, i.result, i.videoUrl));
        stmt.finalize();
      }

      // Insert X-Rays
      if (xrays && xrays.length > 0) {
        const stmt = db.prepare(`INSERT INTO xrays (stepId, label, icon, imageUrl) VALUES (?, ?, ?, ?)`);
        xrays.forEach(x => stmt.run(stepId, x.label, x.icon, x.imageUrl));
        stmt.finalize();
      }

      res.json({ id: stepId, message: 'Step created' });
    }
  );
});

// PUT update step
app.put('/api/admin/steps/:id', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  const { stepIndex, type, content, question, explanationOnFail, maxScore, options, investigations, xrays } = req.body;

  db.run(
    `UPDATE case_steps SET stepIndex=?, type=?, content=?, question=?, explanationOnFail=?, maxScore=? WHERE id=?`,
    [stepIndex, type, JSON.stringify(content), question, explanationOnFail, maxScore, id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });

      // Clean up related data to overwrite
      db.run(`DELETE FROM case_step_options WHERE stepId = ?`, [id]);
      db.run(`DELETE FROM investigations WHERE stepId = ?`, [id]);
      db.run(`DELETE FROM xrays WHERE stepId = ?`, [id]);

      // Re-Insert Options
      if (options && options.length > 0) {
        const stmt = db.prepare(`INSERT INTO case_step_options (stepId, label, isCorrect, feedback) VALUES (?, ?, ?, ?)`);
        options.forEach(o => stmt.run(id, o.label, o.isCorrect ? 1 : 0, o.feedback));
        stmt.finalize();
      }

      // Re-Insert Investigations
      if (investigations && investigations.length > 0) {
        const stmt = db.prepare(`INSERT INTO investigations (stepId, groupLabel, testName, description, result, videoUrl) VALUES (?, ?, ?, ?, ?, ?)`);
        investigations.forEach(i => stmt.run(id, i.groupLabel, i.testName, i.description, i.result, i.videoUrl));
        stmt.finalize();
      }

      // Re-Insert X-Rays
      if (xrays && xrays.length > 0) {
        const stmt = db.prepare(`INSERT INTO xrays (stepId, label, icon, imageUrl) VALUES (?, ?, ?, ?)`);
        xrays.forEach(x => stmt.run(id, x.label, x.icon, x.imageUrl));
        stmt.finalize();
      }

      res.json({ message: 'Step updated' });
    }
  );
});

// DELETE Step
app.delete('/api/admin/steps/:id', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM case_steps WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Deleted' });
  });
});

// Admin Dashboard Overview
app.get('/api/admin/overview', authMiddleware('admin'), (req, res) => {
  db.get(`SELECT COUNT(*) as totalUsers FROM users WHERE role = 'student'`, (err1, users) => {
    if (err1) return res.status(500).json({ message: 'Database error' });
    db.get(`SELECT COUNT(*) as totalCases FROM cases`, (err2, cases) => {
      if (err2) return res.status(500).json({ message: 'Database error' });
      db.get(`SELECT COUNT(*) as totalProgress FROM progress WHERE isCompleted = 1`, (err3, progress) => {
        if (err3) return res.status(500).json({ message: 'Database error' });
        db.get(`SELECT COUNT(*) as premiumUsers FROM users WHERE membershipType = 'premium'`, (err4, premium) => {
          if (err4) return res.status(500).json({ message: 'Database error' });
          res.json({
            totalUsers: users.totalUsers,
            totalCases: cases.totalCases,
            totalCompletions: progress.totalProgress,
            premiumUsers: premium.premiumUsers,
          });
        });
      });
    });
  });
});

// User Management
app.get('/api/admin/users', authMiddleware('admin'), (req, res) => {
  db.all(`SELECT id, email, role, membershipType, membershipExpiresAt, createdAt FROM users ORDER BY createdAt DESC`, [], (err, rows) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ message: 'Database error' });
    }
    const users = rows.map(async (row) => {
      return new Promise((resolve) => {
        db.get(`SELECT COUNT(DISTINCT caseId) as casesCompleted, SUM(score) as totalScore FROM progress WHERE userId = ? AND isCompleted = 1`, [row.id], (err2, stats) => {
          resolve({
            id: row.id,
            email: row.email,
            role: row.role,
            membershipType: row.membershipType || 'free',
            membershipExpiresAt: row.membershipExpiresAt,
            createdAt: row.createdAt,
            stats: {
              casesCompleted: stats?.casesCompleted || 0,
              totalScore: stats?.totalScore || 0,
            },
          });
        });
      });
    });
    Promise.all(users).then((usersWithStats) => res.json(usersWithStats));
  });
});

app.put('/api/admin/users/:id/membership', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  const { membershipType, membershipExpiresAt } = req.body;
  db.run(`UPDATE users SET membershipType = ?, membershipExpiresAt = ? WHERE id = ?`, [membershipType, membershipExpiresAt || null, id], function (err) {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Updated' });
  });
});

// --- Categories Management ---

app.get('/api/categories', (req, res) => {
  db.all(`SELECT * FROM categories ORDER BY name ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/admin/categories', authMiddleware('admin'), (req, res) => {
  const { name, icon, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  db.run(
    `INSERT INTO categories (name, icon, description) VALUES (?, ?, ?)`,
    [name, icon, description],
    function (err) {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Category already exists' });
        return res.status(500).json({ message: 'Database error' });
      }
      res.json({ id: this.lastID, name, icon, description });
    }
  );
});

app.put('/api/admin/categories/:id', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  const { name, icon, description } = req.body;
  db.run(
    `UPDATE categories SET name = ?, icon = ?, description = ? WHERE id = ?`,
    [name, icon, description, id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Updated' });
    }
  );
});

app.delete('/api/admin/categories/:id', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  // Check if used
  db.get(`SELECT COUNT(*) as count FROM cases WHERE categoryId = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (row.count > 0) return res.status(400).json({ message: 'Cannot delete category used by cases' });

    db.run(`DELETE FROM categories WHERE id = ?`, [id], function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Deleted' });
    });
  });
});


/* ======================
   SERVER START
====================== */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
