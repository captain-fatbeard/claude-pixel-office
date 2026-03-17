import Script from "next/script";

export default function Home() {
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
        h1 {
          font-size: 18px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #7c83ff;
          margin-bottom: 14px;
        }
        canvas {
          border: 2px solid #333;
          border-radius: 4px;
          image-rendering: pixelated;
          background: #f2ede8;
        }
        #status {
          margin-top: 10px;
          font-size: 13px;
          color: #666;
        }
      `}</style>
      <h1 id="office-title">Claude Pixel Office</h1>
      <canvas id="canvas" width="1600" height="900"></canvas>
      <div id="status">connecting...</div>
      <Script src="/office.js" strategy="afterInteractive" />
    </>
  );
}
