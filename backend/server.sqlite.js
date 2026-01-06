const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const DB_PATH = path.join(__dirname, 'data.db');

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'admin')),
      membershipType TEXT DEFAULT 'free',
      membershipExpiresAt TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Note: ALTER TABLE statements removed to avoid errors if columns exist
  // Run migrations separately if needed

  db.run(`
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      specialty TEXT,
      category TEXT,
      difficulty TEXT,
      isLocked INTEGER NOT NULL DEFAULT 0,
      prerequisiteCaseId INTEGER,
      metadata TEXT,
      thumbnailUrl TEXT,
      duration INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Note: ALTER TABLE statements removed to avoid errors if columns exist

  db.run(`
    CREATE TABLE IF NOT EXISTS case_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caseId INTEGER NOT NULL,
      stepIndex INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      question TEXT,
      explanationOnFail TEXT,
      maxScore INTEGER DEFAULT 0,
      FOREIGN KEY(caseId) REFERENCES cases(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS case_step_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stepId INTEGER NOT NULL,
      label TEXT NOT NULL,
      isCorrect INTEGER NOT NULL DEFAULT 0,
      feedback TEXT,
      FOREIGN KEY(stepId) REFERENCES case_steps(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS investigations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stepId INTEGER NOT NULL,
      groupLabel TEXT NOT NULL,
      testName TEXT NOT NULL,
      description TEXT,
      result TEXT,
      videoUrl TEXT,
      FOREIGN KEY(stepId) REFERENCES case_steps(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS xrays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stepId INTEGER NOT NULL,
      label TEXT NOT NULL,
      icon TEXT,
      imageUrl TEXT,
      FOREIGN KEY(stepId) REFERENCES case_steps(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      caseId INTEGER NOT NULL,
      score INTEGER NOT NULL,
      isCompleted INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id),
      FOREIGN KEY(caseId) REFERENCES cases(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS website_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT NOT NULL,
      section TEXT NOT NULL,
      content TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(page, section)
    )
  `);

  db.get(`SELECT COUNT(*) as count FROM users WHERE role='admin'`, (err, row) => {
    if (err) return console.error(err);
    if (row.count === 0) {
      const passwordHash = bcrypt.hashSync('admin123', 10);
      db.run(
        `INSERT INTO users (email, passwordHash, role) VALUES (?, ?, 'admin')`,
        ['admin@example.com', passwordHash],
        (err2) => {
          if (err2) console.error(err2);
          else console.log('Seeded default admin: admin@example.com / admin123');
        }
      );
    }
  });

  db.get(`SELECT COUNT(*) as count FROM cases`, (err, row) => {
    if (err) return console.error(err);
    if (row.count === 0) {
      seedInitialCase();
    }
  });

  // Migration: Add imageUrl column to xrays table if it doesn't exist
  db.all(`PRAGMA table_info(xrays)`, (err, columns) => {
    if (err) return console.error('Error checking xrays table:', err);
    const hasImageUrl = columns.some(col => col.name === 'imageUrl');
    if (!hasImageUrl) {
      db.run(`ALTER TABLE xrays ADD COLUMN imageUrl TEXT`, (err2) => {
        if (err2) {
          console.error('Error adding imageUrl column:', err2);
        } else {
          console.log('Successfully added imageUrl column to xrays table');
        }
      });
    }
  });

  // Migration: Add thumbnailUrl and duration to cases table if they don't exist
  db.all(`PRAGMA table_info(cases)`, (err, columns) => {
    if (err) return console.error('Error checking cases table:', err);
    const hasThumbnailUrl = columns.some(col => col.name === 'thumbnailUrl');
    const hasDuration = columns.some(col => col.name === 'duration');
    if (!hasThumbnailUrl) {
      db.run(`ALTER TABLE cases ADD COLUMN thumbnailUrl TEXT`, (err2) => {
        if (err2) {
          console.error('Error adding thumbnailUrl column:', err2);
        } else {
          console.log('Successfully added thumbnailUrl column to cases table');
        }
      });
    }
    if (!hasDuration) {
      db.run(`ALTER TABLE cases ADD COLUMN duration INTEGER DEFAULT 10`, (err2) => {
        if (err2) {
          console.error('Error adding duration column:', err2);
        } else {
          console.log('Successfully added duration column to cases table');
        }
      });
    }
  });

  // Migration: Add membershipType and membershipExpiresAt to users table if they don't exist
  db.all(`PRAGMA table_info(users)`, (err, columns) => {
    if (err) return console.error('Error checking users table:', err);
    const hasMembershipType = columns.some(col => col.name === 'membershipType');
    const hasMembershipExpiresAt = columns.some(col => col.name === 'membershipExpiresAt');
    if (!hasMembershipType) {
      db.run(`ALTER TABLE users ADD COLUMN membershipType TEXT DEFAULT 'free'`, (err2) => {
        if (err2) {
          console.error('Error adding membershipType column:', err2);
        } else {
          console.log('Successfully added membershipType column to users table');
        }
      });
    }
    if (!hasMembershipExpiresAt) {
      db.run(`ALTER TABLE users ADD COLUMN membershipExpiresAt TEXT`, (err2) => {
        if (err2) {
          console.error('Error adding membershipExpiresAt column:', err2);
        } else {
          console.log('Successfully added membershipExpiresAt column to users table');
        }
      });
    }
  });

  // Migration: Add category to cases table if it doesn't exist
  db.all(`PRAGMA table_info(cases)`, (err, columns) => {
    if (err) return console.error('Error checking cases table:', err);
    const hasCategory = columns.some(col => col.name === 'category');
    if (!hasCategory) {
      db.run(`ALTER TABLE cases ADD COLUMN category TEXT`, (err2) => {
        if (err2) {
          console.error('Error adding category column:', err2);
        } else {
          console.log('Successfully added category column to cases table');
        }
      });
    }
  });
});

function seedInitialCase() {
  db.serialize(() => {
    db.run(
      `INSERT INTO cases (title, specialty, difficulty, isLocked, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [
        '54-year-old female with knee pain',
        'Physical Therapy',
        'Intermediate',
        0,
        JSON.stringify({
          brief:
            '54-year-old female with chronic knee pain, worse on stairs and during prayer on the floor.',
        }),
      ],
      function (err) {
        if (err) return console.error(err);
        const caseId = this.lastID;

        db.run(
          `INSERT INTO case_steps
           (caseId, stepIndex, type, content, question, explanationOnFail, maxScore)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            caseId,
            0,
            'info',
            JSON.stringify({
              patientName: 'Ms. A',
              age: 54,
              gender: 'Female',
              imageUrl: null,
              description:
                'I have had knee pain for a few months. The pain is worse when I go up and down stairs. At first it felt better after moving, but now it is there all the time and makes it difficult to pray on the floor.',
              chiefComplaint:
                'طلوع ونزل السلم بيتعبوني ودلوقتي بقيت اصلي على كرسي علشان مبقتش اعرف اسجد',
            }),
            null,
            null,
            0,
          ]
        );

        db.run(
          `INSERT INTO case_steps
           (caseId, stepIndex, type, content, question, explanationOnFail, maxScore)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            caseId,
            1,
            'mcq',
            JSON.stringify({
              prompt:
                'What is the MOST appropriate next action after hearing this chief complaint?',
            }),
            'Choose the best next step in managing this patient.',
            'Incorrect. Remember that the first priority is to take a focused history before jumping to investigations or treatment.',
            10,
          ],
          function (err2) {
            if (err2) return console.error(err2);
            const stepId = this.lastID;
            const options = [
              {
                label: 'Order MRI of the knee immediately',
                isCorrect: 0,
                feedback:
                  'Jumping to advanced imaging without a proper history and examination is not appropriate as a first step.',
              },
              {
                label: 'Start the patient on strong analgesics and send her home',
                isCorrect: 0,
                feedback:
                  'Symptomatic treatment alone without understanding the cause and functional limitations is not adequate.',
              },
              {
                label: 'Begin quadriceps strengthening exercises right away',
                isCorrect: 0,
                feedback:
                  'Exercise may be part of management but should follow a complete assessment, not precede it.',
              },
              {
                label: 'Take a detailed history of the knee pain and functional limitations',
                isCorrect: 1,
                feedback:
                  'Correct. A structured, detailed history is the essential next step.',
              },
            ];
            const stmt = db.prepare(
              `INSERT INTO case_step_options (stepId, label, isCorrect, feedback)
               VALUES (?, ?, ?, ?)`
            );
            options.forEach((opt) => {
              stmt.run(stepId, opt.label, opt.isCorrect, opt.feedback);
            });
            stmt.finalize();
          }
        );
      }
    );
  });
}

function authMiddleware(requiredRole) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Missing token' });
    const token = authHeader.split(' ')[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      req.user = payload;
      next();
    } catch (e) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };
}

app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const role = 'student';
  db.run(
    `INSERT INTO users (email, passwordHash, role) VALUES (?, ?, ?)`,
    [email, passwordHash, role],
    function (err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(409).json({ message: 'Email already exists' });
        }
        return res.status(500).json({ message: 'Error creating user' });
      }
      const token = jwt.sign(
        { id: this.lastID, email, role },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.json({ token, user: { id: this.lastID, email, role } });
    }
  );
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  db.get(
    `SELECT * FROM users WHERE email = ?`,
    [email],
    (err, user) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!user) return res.status(401).json({ message: 'Invalid credentials' });
      const match = bcrypt.compareSync(password, user.passwordHash);
      if (!match) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.json({
        token,
        user: { id: user.id, email: user.email, role: user.role },
      });
    }
  );
});

app.get('/api/cases', authMiddleware(), (req, res) => {
  db.all(
    `SELECT c.*, 
      COALESCE((
        SELECT MAX(isCompleted) FROM progress p
        WHERE p.userId = ? AND p.caseId = c.id
      ), 0) as isCompleted
     FROM cases c
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
                            console.log('Client API Xray:', { id: x.id, label: x.label, hasImageUrl: !!x.imageUrl, urlLen: x.imageUrl ? x.imageUrl.length : 0 });
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
  db.all(`SELECT * FROM cases ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    const cases = rows.map((row) => ({
      id: row.id,
      title: row.title,
      specialty: row.specialty,
      category: row.category,
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
  const { title, specialty, category, difficulty, isLocked, prerequisiteCaseId, metadata, thumbnailUrl, duration } =
    req.body;
  if (!title) return res.status(400).json({ message: 'Title is required' });
  db.run(
    `INSERT INTO cases (title, specialty, category, difficulty, isLocked, prerequisiteCaseId, metadata, thumbnailUrl, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      specialty || null,
      category || null,
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
  const { title, specialty, category, difficulty, isLocked, prerequisiteCaseId, metadata, thumbnailUrl, duration } =
    req.body;
  db.run(
    `UPDATE cases
     SET title = ?, specialty = ?, category = ?, difficulty = ?, isLocked = ?, prerequisiteCaseId = ?, metadata = ?, thumbnailUrl = ?, duration = ?
     WHERE id = ?`,
    [
      title,
      specialty || null,
      category || null,
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

// Case Steps Management
app.get('/api/admin/cases/:id/steps', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  db.all(`SELECT * FROM case_steps WHERE caseId = ? ORDER BY stepIndex ASC`, [id], (err, steps) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    const stepIds = steps.map((s) => s.id);
    if (stepIds.length === 0) return res.json([]);
    const placeholders = stepIds.map(() => '?').join(',');
    db.all(`SELECT * FROM case_step_options WHERE stepId IN (${placeholders})`, stepIds, (err2, options) => {
      if (err2) return res.status(500).json({ message: 'Database error' });
      db.all(`SELECT * FROM investigations WHERE stepId IN (${placeholders})`, stepIds, (err3, investigations) => {
        if (err3) return res.status(500).json({ message: 'Database error' });
        db.all(`SELECT * FROM xrays WHERE stepId IN (${placeholders})`, stepIds, (err4, xrays) => {
          if (err4) return res.status(500).json({ message: 'Database error' });
          const stepsDto = steps.map((s) => ({
            id: s.id,
            stepIndex: s.stepIndex,
            type: s.type,
            content: s.content ? JSON.parse(s.content) : null,
            question: s.question,
            explanationOnFail: s.explanationOnFail,
            maxScore: s.maxScore,
            options: options.filter((o) => o.stepId === s.id).map((o) => ({
              id: o.id,
              label: o.label,
              isCorrect: !!o.isCorrect,
              feedback: o.feedback,
            })),
            investigations: investigations.filter((i) => i.stepId === s.id).map((i) => ({
              id: i.id,
              groupLabel: i.groupLabel,
              testName: i.testName,
              description: i.description,
              result: i.result,
              videoUrl: i.videoUrl,
            })),
            xrays: xrays.filter((x) => x.stepId === s.id).map((x) => {
              const xrayData = {
                id: x.id,
                label: x.label,
                icon: x.icon,
                imageUrl: x.imageUrl,
              };
              if (x.imageUrl) {
                console.log(`Loading xray: label=${x.label}, imageUrl length=${x.imageUrl.length}, preview=${x.imageUrl.substring(0, 50)}...`);
              } else {
                console.log(`Loading xray: label=${x.label}, imageUrl=null`);
              }
              return xrayData;
            }),
          }));
          res.json(stepsDto);
        });
      });
    });
  });
});

app.post('/api/admin/cases/:id/steps', authMiddleware('admin'), (req, res) => {
  const { id } = req.params;
  const { stepIndex, type, content, question, explanationOnFail, maxScore, options, investigations, xrays } = req.body;
  db.run(`INSERT INTO case_steps (caseId, stepIndex, type, content, question, explanationOnFail, maxScore) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, stepIndex, type, JSON.stringify(content), question || null, explanationOnFail || null, maxScore || 0],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      const stepId = this.lastID;
      if (options && options.length > 0) {
        const stmt = db.prepare(`INSERT INTO case_step_options (stepId, label, isCorrect, feedback) VALUES (?, ?, ?, ?)`);
        options.forEach((opt) => {
          stmt.run(stepId, opt.label, opt.isCorrect ? 1 : 0, opt.feedback || null);
        });
        stmt.finalize();
      }
      try {
        if (investigations && investigations.length > 0) {
          console.log(`Creating step ${stepId} with ${investigations.length} investigations`);
          const stmt = db.prepare(`INSERT INTO investigations (stepId, groupLabel, testName, description, result, videoUrl) VALUES (?, ?, ?, ?, ?, ?)`);
          investigations.forEach((inv) => {
            console.log(`  - Investigation: ${inv.groupLabel || 'no group'} / ${inv.testName || 'no name'}`);
            stmt.run(stepId, inv.groupLabel || '', inv.testName || '', inv.description || null, inv.result || null, inv.videoUrl || null);
          });
          stmt.finalize();
        } else {
          console.log(`Creating step ${stepId} with no investigations`);
        }
        if (xrays && xrays.length > 0) {
          console.log(`Creating step ${stepId} with ${xrays.length} xrays`);
          const stmt = db.prepare(`INSERT INTO xrays (stepId, label, icon, imageUrl) VALUES (?, ?, ?, ?)`);
          xrays.forEach((x) => {
            let imageUrl = x.imageUrl && x.imageUrl.trim() !== '' ? x.imageUrl : null;
            // Limit imageUrl size to prevent database errors (SQLite TEXT can handle large strings, but let's be safe)
            if (imageUrl && imageUrl.length > 10000000) { // 10MB limit
              console.warn(`X-ray imageUrl too large (${imageUrl.length} bytes), truncating`);
              imageUrl = imageUrl.substring(0, 10000000);
            }
            const logPreview = imageUrl && imageUrl.length > 100 ? imageUrl.substring(0, 100) + '...' : imageUrl;
            console.log(`  - Xray: label=${x.label || 'unnamed'}, imageUrl length=${imageUrl ? imageUrl.length : 0}, preview=${logPreview}`);
            stmt.run(stepId, x.label || '', x.icon || null, imageUrl);
          });
          stmt.finalize();
        } else {
          console.log(`Creating step ${stepId} with no xrays`);
        }
        res.json({ id: stepId, message: 'Step created' });
      } catch (err) {
        console.error('Error saving step data:', err);
        return res.status(500).json({ message: 'Error saving step: ' + err.message });
      }
    }
  );
});

app.put('/api/admin/steps/:stepId', authMiddleware('admin'), (req, res) => {
  const { stepId } = req.params;
  const { stepIndex, type, content, question, explanationOnFail, maxScore, options, investigations, xrays } = req.body;
  db.run(`UPDATE case_steps SET stepIndex = ?, type = ?, content = ?, question = ?, explanationOnFail = ?, maxScore = ? WHERE id = ?`,
    [stepIndex, type, JSON.stringify(content), question || null, explanationOnFail || null, maxScore || 0, stepId],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });

      // Delete existing related data first
      db.run(`DELETE FROM case_step_options WHERE stepId = ?`, [stepId], (err2) => {
        if (err2) {
          console.error('Error deleting options:', err2);
          return res.status(500).json({ message: 'Error deleting options' });
        }

        db.run(`DELETE FROM investigations WHERE stepId = ?`, [stepId], (err3) => {
          if (err3) {
            console.error('Error deleting investigations:', err3);
            return res.status(500).json({ message: 'Error deleting investigations' });
          }

          db.run(`DELETE FROM xrays WHERE stepId = ?`, [stepId], (err4) => {
            if (err4) {
              console.error('Error deleting xrays:', err4);
              return res.status(500).json({ message: 'Error deleting xrays' });
            }

            // Now insert new data
            try {
              // Insert options
              if (options && options.length > 0) {
                const stmt = db.prepare(`INSERT INTO case_step_options (stepId, label, isCorrect, feedback) VALUES (?, ?, ?, ?)`);
                options.forEach((opt) => {
                  stmt.run(stepId, opt.label, opt.isCorrect ? 1 : 0, opt.feedback || null);
                });
                stmt.finalize();
              }

              // Insert investigations
              if (investigations && investigations.length > 0) {
                console.log(`Inserting ${investigations.length} investigations for step ${stepId}`);
                const stmt = db.prepare(`INSERT INTO investigations (stepId, groupLabel, testName, description, result, videoUrl) VALUES (?, ?, ?, ?, ?, ?)`);
                investigations.forEach((inv) => {
                  console.log(`  - Investigation: ${inv.groupLabel || 'no group'} / ${inv.testName || 'no name'}`);
                  stmt.run(stepId, inv.groupLabel || '', inv.testName || '', inv.description || null, inv.result || null, inv.videoUrl || null);
                });
                stmt.finalize();
              } else {
                console.log(`No investigations to insert for step ${stepId}`);
              }

              // Insert xrays
              if (xrays && xrays.length > 0) {
                console.log(`Inserting ${xrays.length} xrays for step ${stepId}`);
                const stmt = db.prepare(`INSERT INTO xrays (stepId, label, icon, imageUrl) VALUES (?, ?, ?, ?)`);
                xrays.forEach((x) => {
                  let imageUrl = x.imageUrl && x.imageUrl.trim() !== '' ? x.imageUrl : null;
                  // Limit imageUrl size to prevent database errors
                  if (imageUrl && imageUrl.length > 10000000) { // 10MB limit
                    console.warn(`X-ray imageUrl too large (${imageUrl.length} bytes), truncating`);
                    imageUrl = imageUrl.substring(0, 10000000);
                  }
                  const logPreview = imageUrl && imageUrl.length > 100 ? imageUrl.substring(0, 100) + '...' : imageUrl;
                  console.log(`  - Xray: label=${x.label || 'unnamed'}, imageUrl length=${imageUrl ? imageUrl.length : 0}, preview=${logPreview}`);
                  stmt.run(stepId, x.label || '', x.icon || null, imageUrl);
                });
                stmt.finalize();
              } else {
                console.log(`No xrays to insert for step ${stepId}`);
              }

              res.json({ message: 'Updated' });
            } catch (err) {
              console.error('Error inserting step data:', err);
              return res.status(500).json({ message: 'Error updating step: ' + err.message });
            }
          });
        });
      });
    }
  );
});

app.delete('/api/admin/steps/:stepId', authMiddleware('admin'), (req, res) => {
  const { stepId } = req.params;
  db.run(`DELETE FROM case_steps WHERE id = ?`, [stepId], function (err) {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json({ message: 'Deleted' });
  });
});

// Leaderboard
app.get('/api/leaderboard', authMiddleware(), (req, res) => {
  db.all(`SELECT u.id, u.email, 
    COUNT(DISTINCT p.caseId) as casesCompleted,
    SUM(p.score) as totalScore
    FROM users u
    LEFT JOIN progress p ON u.id = p.userId AND p.isCompleted = 1
    WHERE u.role = 'student'
    GROUP BY u.id
    ORDER BY casesCompleted DESC, totalScore DESC
    LIMIT 100`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json(rows.map((row, index) => ({
      rank: index + 1,
      userId: row.id,
      email: row.email,
      casesCompleted: row.casesCompleted || 0,
      totalScore: row.totalScore || 0,
    })));
  });
});

// User Profile Stats
app.get('/api/profile/stats', authMiddleware(), (req, res) => {
  db.get(`SELECT COUNT(DISTINCT caseId) as casesCompleted, SUM(score) as totalScore FROM progress WHERE userId = ? AND isCompleted = 1`, [req.user.id], (err, stats) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    db.all(`SELECT COUNT(*) as rank FROM (
      SELECT u.id, COUNT(DISTINCT p.caseId) as casesCompleted, SUM(p.score) as totalScore
      FROM users u
      LEFT JOIN progress p ON u.id = p.userId AND p.isCompleted = 1
      WHERE u.role = 'student'
      GROUP BY u.id
      HAVING (casesCompleted > ? OR (casesCompleted = ? AND totalScore > ?))
    )`, [stats.casesCompleted || 0, stats.casesCompleted || 0, stats.totalScore || 0], (err2, rankRow) => {
      if (err2) return res.status(500).json({ message: 'Database error' });
      db.get(`SELECT membershipType, membershipExpiresAt FROM users WHERE id = ?`, [req.user.id], (err3, user) => {
        if (err3) return res.status(500).json({ message: 'Database error' });
        res.json({
          casesCompleted: stats.casesCompleted || 0,
          totalScore: stats.totalScore || 0,
          rank: (rankRow[0]?.rank || 0) + 1,
          membershipType: user.membershipType || 'free',
          membershipExpiresAt: user.membershipExpiresAt,
        });
      });
    });
  });
});

// Website Content Management
app.get('/api/admin/content', authMiddleware('admin'), (req, res) => {
  db.all(`SELECT * FROM website_content ORDER BY page, section`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json(rows);
  });
});

app.put('/api/admin/content', authMiddleware('admin'), (req, res) => {
  const { page, section, content } = req.body;
  if (!page || !section || content === undefined) {
    return res.status(400).json({ message: 'Page, section, and content are required' });
  }
  db.run(`INSERT OR REPLACE INTO website_content (page, section, content, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    [page, section, content],
    function (err) {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Updated' });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});


