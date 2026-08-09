import React, { useState } from "react";
import Auth from "./Auth";
import TicTacToe from "./TicTacToe";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));

  // If we have a token, show Game. If not, show Login.
  return (
    <div style={{ textAlign: "center", fontFamily: "Arial" }}>
      {!token ? (
        <Auth onLogin={(tok) => setToken(tok)} />
      ) : (
        <TicTacToe token={token} onLogout={() => {
            localStorage.removeItem("token");
            setToken(null);
        }} />
      )}
    </div>
  );
}

export default App;