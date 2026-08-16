require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000", "http://localhost:3001"];

const io = socketIo(server, {
  cors: {
    origin: process.env.REACT_APP_BACKEND_URL ? allowedOrigins : "*"
  }
});

// Middleware
app.use(cors({
  origin: process.env.REACT_APP_BACKEND_URL ? allowedOrigins : "*"
}));

app.use(express.json());

// --- DATABASE SETUP (SQLite3) ---
const db = new sqlite3.Database("./tictactoe.db", (err) => {
  if (err) return console.error(err.message);
  console.log("Connected to SQLite database.");
});

// Create Users Table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0
)`);

// --- DB HELPER FUNCTIONS ---
const runQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const getQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// --- REST API: AUTHENTICATION ---
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.trim() === "" || username.includes(" ")) {
    return res.status(400).json({ error: "Invalid username (no spaces allowed) or password" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO users (username, password) VALUES (?, ?)`;
    await runQuery(sql, [username, hashedPassword]);
    res.json({ message: "User created" });
  } catch (err) {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const user = await getQuery(`SELECT * FROM users WHERE username = ?`, [username]);
    if (!user) return res.status(400).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, username });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/me", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getQuery(`SELECT id, username, wins, losses, draws FROM users WHERE id = ?`, [decoded.id]);
    res.json(user);
  } catch (err) {
    res.status(401).json({ error: "Invalid Token" });
  }
});

app.get("/leaderboard", async (req, res) => {
  try {
    const leaderboard = await new Promise((resolve, reject) => {
      db.all(`SELECT username, wins FROM users ORDER BY wins DESC LIMIT 10`, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// --- SOCKET.IO SECURITY ---
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

// --- GAME LOGIC ---
let gameObject = {
  board: Array(9).fill(null),
  isXNext: true,
  players: {},
  winner: null,
};

let lastMoveTime = Date.now();
// const TURN_TIMEOUT = n * 60 * 1000;
const TURN_TIMEOUT = 1.5 * 60 * 1000;

setInterval(() => {
  const timeElapsed = Date.now() - lastMoveTime;
  if (timeElapsed > TURN_TIMEOUT) {
    io.emit("idleTimeout");
    console.log('Idle timeout broadcasted at:', new Date().toLocaleTimeString());

    // Add a small buffer to the lastMoveTime so it doesn't broadcast every 10 seconds
    // We add n seconds to the clock so it waits another n seconds before warning again
    lastMoveTime = Date.now() - (TURN_TIMEOUT - 6000);
  }
}, 25000);

io.on("connection", (socket) => {
  console.log(`Authenticated User Connected: ${socket.user.username}`);

  const currentUsername = socket.user.username;
  let assignedRole = null;

  // 1. RECONNECTION / REFRESH FIX: 
  // Check if this user was already in the game.
  for (const oldSocketId in gameObject.players) {
    if (gameObject.players[oldSocketId].username === currentUsername) {
      // Restore their role
      assignedRole = gameObject.players[oldSocketId].role;

      // Remove the old ghost socket entry immediately so logic is clean
      delete gameObject.players[oldSocketId];

      // Try to disconnect the old socket if it still exists
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) oldSocket.disconnect();

      console.log(`User ${currentUsername} reconnected. Restored role: ${assignedRole}`);
      break;
    }
  }

  // 2. NEW PLAYER: Assign role if they are not reconnecting
  if (!assignedRole) {
    const currentPlayers = Object.values(gameObject.players);
    const p1Exists = currentPlayers.some(p => p.role === "Player 1");
    const p2Exists = currentPlayers.some(p => p.role === "Player 2");

    assignedRole = "Spectator";
    if (!p1Exists) {
      assignedRole = "Player 1";
    } else if (!p2Exists) {
      assignedRole = "Player 2";
    }
  }

  // 3. Save player to game state
  gameObject.players[socket.id] = { username: currentUsername, role: assignedRole };

  // Send current board state immediately (Preserves board on refresh!)
  socket.emit("init", { state: gameObject, role: assignedRole });
  io.emit("update", gameObject);

  // --- MOVE LOGIC ---
  socket.on("move", async (data) => {
    const { index } = data;
    const playerRecord = gameObject.players[socket.id];

    if (!playerRecord || playerRecord.role === "Spectator") return;
    const currentPlayerRole = gameObject.isXNext ? "Player 1" : "Player 2";
    if (playerRecord.role !== currentPlayerRole) return;

    if (!gameObject.board[index] && !gameObject.winner) {
      gameObject.board[index] = playerRecord.role === "Player 1" ? "X" : "O";
      gameObject.isXNext = !gameObject.isXNext;

      lastMoveTime = Date.now();
      console.log(lastMoveTime)
      const winnerSymbol = checkWinner(gameObject.board);

      if (winnerSymbol) {
        const winnerRole = winnerSymbol === "X" ? "Player 1" : "Player 2";
        const winnerSocketId = Object.keys(gameObject.players).find(
          (key) => gameObject.players[key].role === winnerRole
        );
        gameObject.winner = gameObject.players[winnerSocketId]?.username || "Unknown";

        if (winnerSocketId) {
          const winnerUser = io.sockets.sockets.get(winnerSocketId)?.user;
          if (winnerUser) {
            try {
              await runQuery(`UPDATE users SET wins = wins + 1 WHERE id = ?`, [winnerUser.id]);

              // push fresh stats straight to the winner over the socket
              // (replaces the frontend's REST refetch on every "winner" change)
              const updatedUser = await getQuery(`SELECT id, username, wins, losses, draws FROM users WHERE id = ?`, [winnerUser.id]);
              io.to(winnerSocketId).emit("statsUpdated", updatedUser);

              // Push the refreshed leaderboard to everyone in the room
              const newLeaderboard = await new Promise((resolve, reject) => {
                db.all(`SELECT username, wins FROM users ORDER BY wins DESC LIMIT 10`, [], (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows);
                });
              });
              io.emit("leaderboardUpdated", newLeaderboard);
            } catch (e) {
              console.error("DB Update failed", e);
            }
          }
        }
      } else if (!gameObject.board.includes(null)) {
        gameObject.winner = "Draw";
      }

      io.emit("update", gameObject);
    }
  });

  // --- RESET LOGIC ---
  socket.on("reset", () => {
    const socketIds = Object.keys(gameObject.players);
    let p1SocketId = null;
    let p2SocketId = null;

    socketIds.forEach(id => {
      if (gameObject.players[id].role === "Player 1") p1SocketId = id;
      if (gameObject.players[id].role === "Player 2") p2SocketId = id;
    });

    if (p1SocketId && p2SocketId) {
      gameObject.players[p1SocketId].role = "Player 2";
      gameObject.players[p2SocketId].role = "Player 1";
    }

    gameObject.board = Array(9).fill(null);
    gameObject.isXNext = true;
    gameObject.winner = null;

    lastMoveTime = Date.now();

    io.emit("update", gameObject);
    io.emit("reset", gameObject);
  });

  // --- QUIT GAME ---
  socket.on("quitGame", () => {
    const playerRecord = gameObject.players[socket.id];

    if (playerRecord && (playerRecord.role === "Player 1" || playerRecord.role === "Player 2")) {
      playerRecord.role = "Spectator";

      // Explicitly quitting resets the board for the next person
      gameObject.board = Array(9).fill(null);
      gameObject.isXNext = true;
      gameObject.winner = null;
      lastMoveTime = Date.now();
      io.emit("update", gameObject);
      io.emit("reset", gameObject);
    }
  });

  // --- JOIN GAME ---
  socket.on("joinGame", () => {
    const playerRecord = gameObject.players[socket.id];

    if (playerRecord && playerRecord.role === "Spectator") {
      const currentPlayers = Object.values(gameObject.players);
      const p1Exists = currentPlayers.some(p => p.role === "Player 1");
      const p2Exists = currentPlayers.some(p => p.role === "Player 2");

      let didJoin = false;

      if (!p1Exists) {
        playerRecord.role = "Player 1";
        didJoin = true;
      } else if (!p2Exists) {
        playerRecord.role = "Player 2";
        didJoin = true;
      }

      if (didJoin) {
        // If a new player joins to play, we ensure the board is fresh
        gameObject.board = Array(9).fill(null);
        gameObject.isXNext = true;
        gameObject.winner = null;
        lastMoveTime = Date.now();
        io.emit("update", gameObject);
        io.emit("reset", gameObject);
      } else {
        socket.emit("joinFailed", { message: "Game is full. Please wait for a seat to open." });
      }
    }
  });

  socket.on("chat", (msgData) => {
    io.emit("chat", msgData);
  });

  // --- DISCONNECT WITH TIMEOUT (Fixes Refresh Clearing Board) ---
  socket.on("disconnect", () => {
    // We DO NOT clear the board here. 
    // We wait 5 seconds. If the player refreshed, they will reconnect
    // and the code at the top (Step 1) will handle it before this timeout finishes.

    setTimeout(() => {
      // If the socket ID is still in the list, it means they didn't reconnect
      // (or at least didn't reconnect efficiently).
      if (gameObject.players[socket.id]) {
        delete gameObject.players[socket.id];
        io.emit("update", gameObject);
      }
    }, 5000);
  });
});

function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (let i = 0; i < lines.length; i++) {
    const [a, b, c] = lines[i];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

server.listen(8082, () => {
  console.log("Server running on port 8082");
  console.log("Database: SQLite3 (tictactoe.db)");
});
