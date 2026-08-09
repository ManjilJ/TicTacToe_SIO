import React, { useState } from "react";
import axios from "axios";

const Auth = ({ onLogin }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const endpoint = isRegister ? "/register" : "/login";
 
    let BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

    try {
      const res = await axios.post(`${BACKEND_URL}${endpoint}`, {
        username,
        password,
      });

      if (!isRegister) {
        // Login successful: Save token and notify parent
        localStorage.setItem("token", res.data.token);
        onLogin(res.data.token);
      } else {
        // Registration successful: Switch to login view
        setIsRegister(false);
        setError("Account created! Please log in.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "An error occurred");
    }
  };

  return (
    <div style={{ marginTop: "50px" }}>
      <h2>{isRegister ? "Register" : "Login"}</h2>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Username"
          onChange={(e) => setUsername(e.target.value)}
        />
        <br /><br />
        <input
          type="password"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <br /><br />
        <button type="submit">{isRegister ? "Sign Up" : "Log In"}</button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <p onClick={() => setIsRegister(!isRegister)} style={{ cursor: "pointer", color: "blue" }}>
        {isRegister ? "Already have an account? Log In" : "Need an account? Register"}
      </p>
    </div>
  );
};

export default Auth;