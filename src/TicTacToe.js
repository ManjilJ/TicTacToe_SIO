import React, { useEffect, useState, useCallback } from "react";
import io from "socket.io-client";
import axios from "axios";

let BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const TicTacToe = ({ token, onLogout }) => {
  const [socket, setSocket] = useState(null);
  const [board, setBoard] = useState(Array(9).fill(null));
  const [winner, setWinner] = useState(null);
  const [role, setRole] = useState(null);
  const [stats, setStats] = useState({ username: "", wins: 0, losses: 0, draws: 0 });
  const [leaderboard, setLeaderboard] = useState([]);
  const [whoseTurn, setWhoseTurn] = useState("X");
  const [opponentLeft, setOpponentLeft] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [countdown, setCountdown] = useState(30);

  const handleQuitGame = useCallback(() => {
    if (socket) socket.emit("quitGame");
    setShowIdleModal(false);
  }, [socket]);

  useEffect(() => {
    let timer;
    if (showIdleModal) {
      setCountdown(30);
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            handleQuitGame();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showIdleModal, handleQuitGame]);

  // 1. Fetch User Stats (REST API) — now runs once on login only.
  // Live updates after a win arrive via the "statsUpdated" socket event below.
  useEffect(() => {
    if (!token) return;
    axios
      .get(`${BACKEND_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setStats(res.data))
      .catch((err) => console.error("Failed to fetch stats"));
  }, [token]);

  // Same for the leaderboard — once on login, then pushed via "leaderboardUpdated".
  useEffect(() => {
    if (!token) return;
    axios
      .get(`${BACKEND_URL}/leaderboard`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setLeaderboard(res.data))
      .catch((err) => console.error("Failed to fetch leaderboard"));
  }, [token]);

  // 2. Connect Socket (Real-time)
  useEffect(() => {
    const newSocket = io(BACKEND_URL, {
      auth: { token },
    });

    setSocket(newSocket);

    newSocket.on("init", (data) => {
      setBoard(data.state.board);
      setRole(data.role); // Initial role assignment
      setWhoseTurn(data.state.isXNext ? "X" : "O");
    });

    newSocket.on("update", (state) => {
      setBoard(state.board);
      setWinner(state.winner);
      setWhoseTurn(state.isXNext ? "X" : "O");

      // Check current role from server players list to handle swaps/joins/quits
      if (state.players && state.players[newSocket.id]) {
        setRole(state.players[newSocket.id].role);

        const myRole = state.players?.[newSocket.id]?.role;
        if (myRole === "Player 1" || myRole === "Player 2") {
          const opponentRole = myRole === "Player 1" ? "Player 2" : "Player 1";
          const opponentStillIn = Object.values(state.players || {}).some(p => p.role === opponentRole);
          setOpponentLeft(!opponentStillIn);
        } else {
          setOpponentLeft(false);
        }
      }
    });

    newSocket.on("reset", (state) => {
      setBoard(state.board);
      setWinner(null);
    });

    // Chat listener
    newSocket.on("chat", (msgData) => {
      setChatMessages((prev) => [...prev, msgData]);
    });
    // Join not possible
    newSocket.on("joinFailed", (data) => {
      alert(data.message);
    });

    // live stats/leaderboard push 
    newSocket.on("statsUpdated", (newStats) => {
      setStats(newStats);
    });
    newSocket.on("leaderboardUpdated", (newLeaderboard) => {
      setLeaderboard(newLeaderboard);
    });

    newSocket.on("idleTimeout", () => {
      setRole(role => {
        setWhoseTurn(turn => {
          const isMyTurn = (role === "Player 1" && turn === "X") ||
            (role === "Player 2" && turn === "O");
          if (isMyTurn) setShowIdleModal(true);
          return turn;
        });
        return role;
      });
    });

    return () => newSocket.disconnect();
  }, [token]);

  const handleMove = (index) => {
    if (socket) socket.emit("move", { index });
  };

  const handleReset = () => {
    if (socket) socket.emit("reset");
  };

  const handleJoinGame = () => {
    if (socket) socket.emit("joinGame");
  };

  const handleSendChat = () => {
    if (chatInput.trim() && socket) {
      socket.emit("chat", { sender: stats.username || role || "Player", text: chatInput.trim() });
      setChatInput("");
    }
  };

  const getWinningLine = (squares) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
      [0, 4, 8], [2, 4, 6]             // Diagonals
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return lines[i];
      }
    }
    return null;
  };

  const renderWinningLine = () => {
    if (!winner || winner === "Draw") return null;

    const winnerLine = getWinningLine(board);
    if (!winnerLine) return null;

    let lineStyle = {
      position: "absolute",
      backgroundColor: "green",
      zIndex: 1,
      borderRadius: "5px"
    };

    const [a, , c] = winnerLine;
    let animClass = "draw-line-horiz";

    if (a === 0 && c === 2)
      lineStyle = { ...lineStyle, top: "15%", left: "0", width: "100%", height: "5px" };
    if (a === 3 && c === 5)
      lineStyle = { ...lineStyle, top: "48%", left: "0", width: "100%", height: "5px" };
    if (a === 6 && c === 8)
      lineStyle = { ...lineStyle, top: "82%", left: "0", width: "100%", height: "5px" };

    if (a === 0 && c === 6) {
      lineStyle = { ...lineStyle, left: "15%", top: "0", width: "5px", height: "100%" };
      animClass = "draw-line-vert";
    }
    if (a === 1 && c === 7) {
      lineStyle = { ...lineStyle, left: "48%", top: "0", width: "5px", height: "100%" };
      animClass = "draw-line-vert";
    }
    if (a === 2 && c === 8) {
      lineStyle = { ...lineStyle, left: "82%", top: "0", width: "5px", height: "100%" };
      animClass = "draw-line-vert";
    }

    if (a === 0 && c === 8)
      lineStyle = { ...lineStyle, top: "0", left: "0", width: "141.4%", height: "5px", transform: "rotate(45deg)", transformOrigin: "top left" };
    if (a === 2 && c === 6)
      lineStyle = { ...lineStyle, top: "0", right: "0", width: "141.4%", height: "5px", transform: "rotate(-45deg)", transformOrigin: "top right" };

    return <div className={animClass} style={lineStyle}></div>;
  };

  return (
    <div>
      {showIdleModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ background: "white", padding: "20px", borderRadius: "8px", textAlign: "center", width: "300px" }}>
            <h3>Idle Detected</h3>
            <p>You have been idle for few minutes. Do you want to stay in the game?</p>
            <div style={{ fontSize: "20px", fontWeight: "bold", margin: "10px 0" }}>{countdown}s</div>
            <button onClick={() => setShowIdleModal(false)} style={{ margin: "5px", padding: "10px 20px" }}>Stay</button>
            <button onClick={handleQuitGame} style={{ margin: "5px", padding: "10px 20px" }}>Quit</button>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes zoomOutScreen {
            0% { transform: scale(15); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          .cell-anim {
            display: inline-block;
            animation: zoomOutScreen 0.6s ease-out forwards;
          }
          @keyframes drawLineHoriz {
            0% { clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); }
            100% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
          }
          .draw-line-horiz {
            animation: drawLineHoriz 0.5s ease-out forwards;
          }
          @keyframes drawLineVert {
            0% { clip-path: polygon(0 0, 100% 0, 100% 0, 0 0); }
            100% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
          }
          .draw-line-vert {
            animation: drawLineVert 0.5s ease-out forwards;
          }
        `}
      </style>

      {/* TOP STATUS BAR WITH NEW BUTTONS */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "20px", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <span>Username: <strong>{stats.username}</strong></span>
        <span>Role: <strong>{role}</strong></span>
        <span>My Wins: <strong>{stats.wins}</strong></span>
        <span style={{ color: whoseTurn === "X" ? "blue" : "red" }}>Turn is of: <strong>{whoseTurn === "X" ? "Player 1" : "Player 2"}</strong></span>

        <span>
          {role === "Spectator"
            ? "You are watching as a Spectator."
            : opponentLeft
              ? "Opponent has left the game."
              : ((role === "Player 1" && whoseTurn === "X") || (role === "Player 2" && whoseTurn === "O"))
                ? `Your turn`
                : `Opponent waiting...`}
        </span>
        {/* Action Buttons Container */}
        <div style={{ display: "flex", gap: "10px" }}>
          {(role === "Player 1" || role === "Player 2") && (
            <button onClick={handleQuitGame} style={{ backgroundColor: "#ff4d4d", color: "white", border: "none", padding: "5px 10px", borderRadius: "4px", cursor: "pointer" }}>
              Quit Playing
            </button>
          )}
          {role === "Spectator" && (
            <button onClick={handleJoinGame} style={{ backgroundColor: "#4CAF50", color: "white", border: "none", padding: "5px 10px", borderRadius: "4px", cursor: "pointer" }}>
              Join Game
            </button>
          )}
          <button onClick={onLogout} style={{ padding: "5px 10px", cursor: "pointer" }}>Logout</button>
        </div>
      </div>

      <h1>Tic-Tac-Toe</h1>
      {winner && <h2 style={{ color: "green" }}>Game of : {winner}</h2>}

      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative" }}>
          {renderWinningLine()}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 100px)",
            gap: "10px",
            justifyContent: "center"
          }}>
            {board.map((cell, i) => (
              <button
                key={i}
                onClick={() => handleMove(i)}
                style={{ width: "100px", height: "100px", fontSize: "24px", overflow: "visible" }}
              >
                {cell && <span className="cell-anim">{cell}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {winner && <button onClick={handleReset} style={{ marginTop: "20px" }}>Reset Game</button>}

      {/* Chat Box Section */}
      <div style={{ marginTop: "30px", maxWidth: "320px" }}>
        <h3>Chat</h3>
        <div style={{
          height: "120px",
          overflowY: "auto",
          border: "1px solid #ccc",
          padding: "5px",
          marginBottom: "10px",
          backgroundColor: "#f9f9f9"
        }}>

          {chatMessages.length === 0 ? (
            <span style={{ color: "#888", fontSize: "14px" }}>No messages yet...</span>
          ) : (
            chatMessages.map((msg, index) => (
              <div key={index} style={{ fontSize: "14px", marginBottom: "4px" }}>
                <strong>{msg.sender}: </strong> {msg.text}
              </div>
            ))
          )}
        </div>
        <div style={{ display: "flex", gap: "5px" }}>
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type a message..."
            style={{ flex: 1, resize: "none", height: "40px", padding: "5px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendChat();
              }
            }}
          />
          <button onClick={handleSendChat} style={{ padding: "0 10px" }}>Send</button>
        </div>
      </div>

      <h2>Leaderboard</h2>
      <ul>
        {leaderboard.map((entry, index) => (
          <li key={index}>{entry.username}: {entry.wins} wins</li>
        ))}
      </ul>
    </div>
  );
};

export default TicTacToe;
