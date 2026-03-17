import Script from "next/script";
import { auth, signOut } from "../auth";

export default async function Home() {
  const session = await auth();

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #2a2a3a;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          font-family: 'Courier New', monospace;
          color: #e0e0e0;
        }
        canvas {
          border: 2px solid #333;
          border-radius: 4px;
          image-rendering: pixelated;
          background: #f2ede8;
        }
        .bottom-bar {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 13px;
          color: #666;
        }
        .logout-btn {
          background: none;
          border: 1px solid #555;
          color: #888;
          padding: 4px 12px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
          border-radius: 3px;
          cursor: pointer;
        }
        .logout-btn:hover {
          border-color: #888;
          color: #ccc;
        }
      `}</style>
      <canvas id="canvas" width="1600" height="900"></canvas>
      <div className="bottom-bar">
        <span id="status">connecting...</span>
        {session?.user && (
          <>
            <span>{session.user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="logout-btn" type="submit">
                Sign out
              </button>
            </form>
          </>
        )}
      </div>
      <Script src="/office.js" strategy="afterInteractive" />
    </>
  );
}
