# 🎮 Real-Time Multiplayer Tic-Tac-Toe

A full-stack, real-time multiplayer Tic-Tac-Toe game with user accounts, a live leaderboard, in-game chat, and idle-timeout handling. 🚀

- 💻 **Frontend:** React (Create React App)
- ⚙️ **Backend:** Node.js, Express, Socket.IO
- 🗄️ **Database:** SQLite3
- 🔐 **Auth:** JWT + bcrypt password hashing

## ✨ Features

- 🔑 **Register / log in** with a username and password (passwords hashed with bcrypt).
- ⚡ **Real-time gameplay** over WebSockets — two players compete, others join as spectators.
- 💬 **Live in-game chat** to communicate with opponents and spectators.
- ⏳ **Idle-timeout detection** with a "stay or quit" prompt to keep games active.
- 🏆 **Win/loss tracking** and a persistent leaderboard saved in SQLite.
- 🔄 **Reconnect handling** — refreshing the page restores your session and game role.

## 📂 Project Structure

```text
├── 📁 public/             # Static assets (index.html, favicon)
├── 📁 src/                # React frontend
│   ├── 📄 App.js          # Root component — toggles Auth / Game view
│   ├── 📄 Auth.js         # Login / Register form
│   ├── 📄 TicTacToe.js    # Game board, chat, leaderboard, socket logic
│   ├── 📄 index.js
│   └── 📄 App.css / index.css
├── 📄 server.js           # Express + Socket.IO backend
├── 🗄️ tictactoe.db        # SQLite database (created automatically)
├── 📦 package.json
├── 📖 Readme.md
└── ⚙️ .env.example        # Template for environment variables
```

## 🚀 Getting Started

### 1. 📥 Clone and install dependencies
```bash
git clone <your-repo-url>
cd <repo-folder>
npm install
```

### 2. ⚙️ Set up environment variables
Copy the example file and fill in your own values:
```bash
copy .env.example .env
```
> 🔑 Make sure to define a `JWT_SECRET` and set `REACT_APP_BACKEND_URL=http://localhost:8082`.

### 3. 🟢 Run the backend
```bash
node server.js
```
The server starts on **port 8082** 🔌 and initializes the database automatically.

### 4. 🔵 Run the frontend
In a separate terminal:
```bash
npm start
```
The React app runs on **port 3000** 🖥️ (or 3001) and connects to the backend.

### 5. 🕹️ Play
Open `http://localhost:3000` in two different browser windows 🌐 and register two accounts to play against each other.

## ⚠️ Notes / Known Limitations
- 🛑 **No rate limiting:** Auth endpoints are open for local testing; add `express-rate-limit` for production.
- 🧠 **In-memory state:** Active game logic is held in server memory—restarting the server resets the current match.
- 🏠 **Single Game Instance:** This version supports one global game room. A **scaled version** would utilize **Socket.io Rooms** to allow players to create/join separate match IDs, supporting thousands of concurrent games in private or public lobbies.

## 🛠️ Tech Stack Details

| Layer | Technology / Library |
| :--- | :--- |
| **Frontend Framework** | ⚛️ React 18 (Create React App) |
| **Backend Framework** | 🟢 Node.js / Express |
| **Database** | 🗄️ SQLite3 |
| **Real-time Communication** | ⚡ Socket.IO (Client & Server) |
| **HTTP Client** | 📡 Axios |
| **Authentication** | 🔑 JSON Web Tokens (JWT) |
| **Password Hashing** | 🔒 bcryptjs |