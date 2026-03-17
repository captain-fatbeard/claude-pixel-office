import { auth, signIn } from "../../auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/");

  const params = await searchParams;
  const error = params?.error;

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #2a2a3a;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          font-family: 'Courier New', monospace;
          color: #e0e0e0;
        }
        .login-box {
          text-align: center;
          padding: 40px;
          border: 2px solid #333;
          border-radius: 8px;
          background: #333346;
        }
        h1 {
          font-size: 24px;
          color: #7c83ff;
          margin-bottom: 8px;
        }
        p {
          font-size: 13px;
          color: #888;
          margin-bottom: 24px;
        }
        .error {
          color: #ff6b6b;
          margin-bottom: 16px;
          font-size: 13px;
        }
        button {
          background: #7c83ff;
          color: #fff;
          border: none;
          padding: 12px 32px;
          font-size: 15px;
          font-family: 'Courier New', monospace;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background: #6a71ee;
        }
      `}</style>
      <div className="login-box">
        <h1>Claude Pixel Office</h1>
        <p>Sign in with your @signifly.com account</p>
        {error && (
          <div className="error">
            {error === "AccessDenied"
              ? "Access denied — only @signifly.com accounts are allowed."
              : "Something went wrong. Please try again."}
          </div>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button type="submit">Sign in with Google</button>
        </form>
      </div>
    </>
  );
}
