import { useState } from "react";

type AccessGateProps = {
  onGuest: () => void;
  onLogin: (username: string, password: string) => void;
};

export function AccessGate({ onGuest, onLogin }: AccessGateProps) {
  const [mode, setMode] = useState<"choice" | "login">("choice");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main style={{
      minHeight: "100vh",
      background: "#090909",
      color: "white",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "Arial"
    }}>
      <h1>MEHMET IPA</h1>
      <p>Devam etmek için giriş türünü seç.</p>

      {mode === "choice" ? (
        <>
          <button onClick={onGuest} style={buttonStyle}>
            Misafir Girişi
          </button>
          <button onClick={() => setMode("login")} style={buttonStyle}>
            Üye Girişi
          </button>
        </>
      ) : (
        <>
          <input
            placeholder="Kullanıcı adı"
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Şifre"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
          />
          <button
            onClick={() => onLogin(username, password)}
            style={buttonStyle}
          >
            Giriş Yap
          </button>
          <button onClick={() => setMode("choice")} style={buttonStyle}>
            Geri
          </button>
        </>
      )}
    </main>
  );
}

const buttonStyle = {
  width: "100%",
  maxWidth: 320,
  padding: 18,
  margin: 10,
  borderRadius: 12,
  background: "#2563eb",
  color: "white",
  border: "none",
  fontSize: 17
};

const inputStyle = {
  width: "100%",
  maxWidth: 285,
  padding: 16,
  margin: 8,
  borderRadius: 10,
  fontSize: 16
};
