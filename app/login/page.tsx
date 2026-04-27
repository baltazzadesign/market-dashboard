"use client";

import { useState } from "react";

export default function LoginPage() {
  const [code, setCode] = useState("");

  function handleLogin() {
    if (code === "balta260427") {
      document.cookie = "access=balta260427; path=/; max-age=86400";
      window.location.href = "/";
    } else {
      alert("코드 틀림");
    }
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#020617",
        color: "white",
      }}
    >
      <div
        style={{
          padding: 30,
          borderRadius: 16,
          background: "rgba(255,255,255,0.05)",
        }}
      >
        <h2 style={{ marginBottom: 20 }}>접근 코드 입력</h2>

        <input
          type="password"
          placeholder="코드 입력"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{
            padding: 10,
            width: 200,
            marginBottom: 10,
          }}
        />

        <br />

        <button onClick={handleLogin} style={{ padding: "10px 20px" }}>
          입장
        </button>
      </div>
    </div>
  );
}