import React, { useEffect, useMemo, useRef, useState } from "react";

const SHOTS = [
  { key: "front_straight", title: "Front Straight", purpose: "Centering + corners", tip: "צלם מלמעלה, ישר לחלוטין, עם כל הקלף בתוך המסגרת." },
  { key: "front_tilt_left", title: "Front Tilt Left", purpose: "Surface scratches / print lines", tip: "הטה את הקלף שמאלה בזווית של 30°–45° מול אור חזק." },
  { key: "front_tilt_right", title: "Front Tilt Right", purpose: "Surface confirmation", tip: "הטה את הקלף ימינה בזווית של 30°–45° מול אור חזק." },
  { key: "top_edge_macro", title: "Top Edge Macro", purpose: "Top edge whitening / chipping", tip: "קרב את המצלמה לקצה העליון. פוקוס רק על החלק העליון." },
  { key: "bottom_edge_macro", title: "Bottom Edge Macro", purpose: "Bottom edge whitening / chipping", tip: "קרב את המצלמה לקצה התחתון. פוקוס רק על החלק התחתון." },
  { key: "back_straight", title: "Back Straight", purpose: "Back centering + corners + stains", tip: "הפוך את הקלף וצלם ישר לחלוטין עם כל הגב בתוך המסגרת." },
];

export default function CardPregraderApp() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [activeShot, setActiveShot] = useState("front_straight");
  const [shots, setShots] = useState({});
  const [analysis, setAnalysis] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [points, setPoints] = useState([]);
  const [autoChecks, setAutoChecks] = useState({});
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  async function startCamera() {
    try {
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreamReady(true);
      }
    } catch (e) {
      setCameraError("לא הצלחתי לגשת למצלמה. אפשר להעלות תמונה ידנית לכל שלב.");
      setStreamReady(false);
    }
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject;
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const url = canvas.toDataURL("image/jpeg", 0.96);
    saveShot(activeShot, url);
  }

  function saveShot(key, url) {
    const nextShots = { ...shots, [key]: url };
    setShots(nextShots);
    setAnalysis(null);
    setPoints([]);
    runAutoFrameChecks(key, url);
    const next = nextMissingShot(nextShots);
    if (next) setActiveShot(next);
  }

  function uploadForShot(key, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => saveShot(key, String(reader.result));
    reader.readAsDataURL(file);
  }

  function resetAll() {
    setShots({});
    setAnalysis(null);
    setPoints([]);
    setAutoChecks({});
    setActiveShot("front_straight");
  }

  function clearShot(key) {
    const nextShots = { ...shots };
    delete nextShots[key];
    setShots(nextShots);

    const nextChecks = { ...autoChecks };
    delete nextChecks[key];
    setAutoChecks(nextChecks);

    setAnalysis(null);
    setPoints([]);
    setActiveShot(key);
  }

  function onOverlayClick(e) {
    if (activeShot !== "front_straight" && activeShot !== "back_straight") return;
    if (!shots[activeShot]) return;
    if (points.length >= 4) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPoints((prev) => [...prev, { x, y }]);
  }

  function undoPoint() {
    setPoints((prev) => prev.slice(0, -1));
  }

  function runAutoFrameChecks(key, url) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = Math.min(800, img.width);
      canvas.height = Math.round((canvas.width / img.width) * img.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let total = 0;
      let edgeBrightness = 0;
      let centerBrightness = 0;
      let detail = 0;

      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
          const idx = (y * canvas.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const bright = (r + g + b) / 3;
          total += bright;

          const left = data[idx - 4];
          const right = data[idx + 4];
          const up = data[idx - canvas.width * 4];
          const down = data[idx + canvas.width * 4];
          detail += Math.abs(bright - (left + right + up + down) / 4);

          const isEdge =
            x < canvas.width * 0.12 ||
            x > canvas.width * 0.88 ||
            y < canvas.height * 0.12 ||
            y > canvas.height * 0.88;

          const isCenter =
            x > canvas.width * 0.3 &&
            x < canvas.width * 0.7 &&
            y > canvas.height * 0.3 &&
            y < canvas.height * 0.7;

          if (isEdge) edgeBrightness += bright;
          if (isCenter) centerBrightness += bright;
        }
      }

      const pixels = (canvas.width - 2) * (canvas.height - 2);
      const avgBrightness = total / pixels;
      const avgDetail = detail / pixels;
      const edgeVsCenter = centerBrightness === 0 ? 1 : edgeBrightness / centerBrightness;

      const notes = [];
      if (avgBrightness < 70) notes.push("צריך יותר אור");
      if (avgDetail < 8) notes.push("התמונה מעט רכה, תתקרב או תייצב");
      if (edgeVsCenter > 1.15) notes.push("יש סיכוי לחיתוך בקצוות, תכלול את כל הקלף");
      if (edgeVsCenter < 0.82 && (key === "front_tilt_left" || key === "front_tilt_right")) {
        notes.push("הברק לא תופס את המשטח, שנה זווית לאיתור שריטות");
      }
      if (!notes.length) notes.push("צילום נראה טוב");

      setAutoChecks((prev) => ({
        ...prev,
        [key]: {
          avgBrightness: Number(avgBrightness.toFixed(1)),
          avgDetail: Number(avgDetail.toFixed(1)),
          notes,
        },
      }));
    };
    img.src = url;
  }

  function analyzeCard() {
    const missing = SHOTS.filter((s) => !shots[s.key]).map((s) => s.key);
    if (missing.length) return;

    const backCheck = autoChecks.back_straight || {};
    const tiltLeft = autoChecks.front_tilt_left || {};
    const tiltRight = autoChecks.front_tilt_right || {};
    const topEdge = autoChecks.top_edge_macro || {};
    const bottomEdge = autoChecks.bottom_edge_macro || {};

    const frontGeometry = computeGeometryFromPoints(points);
    const centeringFront = frontGeometry?.score ?? 92;
    const cornersFront = frontGeometry?.cornerScore ?? 90;

    const backSubscore = scoreFromPhotoQuality(backCheck.avgBrightness, backCheck.avgDetail);
    const surfaceSubscore = surfaceScoreFromTilts(tiltLeft, tiltRight);
    const edgeSubscore = edgeScoreFromMacros(topEdge, bottomEdge);

    const centeringScore = clamp(Math.round(centeringFront * 0.78 + backSubscore * 0.22), 60, 100);
    const cornersScore = clamp(Math.round(cornersFront * 0.75 + backSubscore * 0.25), 60, 100);
    const edgesScore = clamp(edgeSubscore, 55, 100);
    const surfaceScore = clamp(surfaceSubscore, 50, 100);

    const predicted = weightedGrade({
      centering: centeringScore,
      corners: cornersScore,
      edges: edgesScore,
      surface: surfaceScore,
    });

    setAnalysis({
      centeringScore,
      cornersScore,
      edgesScore,
      surfaceScore,
      predicted,
    });
  }

  const currentShot = SHOTS.find((s) => s.key === activeShot);
  const missingShots = SHOTS.filter((s) => !shots[s.key]);
  const readyForAnalyze = SHOTS.every((s) => Boolean(shots[s.key]));
  const needsPoints =
    (activeShot === "front_straight" || activeShot === "back_straight") &&
    shots[activeShot];

  const guidance = useMemo(() => {
    if (!shots[activeShot]) {
      return currentShot.tip;
    }
    if ((activeShot === "front_straight" || activeShot === "back_straight") && points.length < 4) {
      return "אחרי הצילום, סמן 4 פינות לקבלת חישוב גיאומטרי מדויק יותר.";
    }
    if (autoChecks[activeShot]?.notes?.length) {
      return autoChecks[activeShot].notes.join(" · ");
    }
    return "הצילום נראה תקין. אפשר להמשיך לצילום הבא.";
  }, [activeShot, shots, points, autoChecks, currentShot]);

  return (
    <div className="app-shell">
      <div className="top-stripe" />

      <div className="container">
        <header className="hero">
          <div>
            <div className="kicker">BARÇA CARD PRE-GRADER</div>
            <h1>Sports Card Pre-Grader Pro</h1>
            <p>
              כלי פרה-גריידינג עם הנחיה בזמן צילום, בדיקת מרכוז, פינות, קצוות,
              משטח, ופלט של דירוג צפוי.
            </p>
          </div>

          <div className="hero-actions">
            <button className="btn secondary" onClick={startCamera}>Restart Camera</button>
            <button className="btn primary" onClick={resetAll}>New Session</button>
          </div>
        </header>

        <div className="main-grid">
          <div className="left-col">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <div className="label-small">Current shot</div>
                  <h2>{currentShot.title}</h2>
                  <div className="sub">{currentShot.purpose}</div>
                </div>
                <div className="badge-count">{Object.keys(shots).length}/{SHOTS.length} captured</div>
              </div>

              {!shots[activeShot] ? (
                <>
                  <div className="camera-wrap">
                    {cameraError ? (
                      <div className="camera-error">{cameraError}</div>
                    ) : (
                      <>
                        <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
                        <CaptureOverlay shotKey={activeShot} />
                        <button
                          onClick={capture}
                          disabled={!streamReady}
                          aria-label="Capture photo"
                          className="capture-button"
                        >
                          <span>📸</span>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="info-box blue">
                    <div className="info-title">הנחיה לצילום</div>
                    <div>{guidance}</div>
                  </div>

                  <div className="row-actions">
                    <label className="btn upload">
                      Upload for this shot
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => uploadForShot(activeShot, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div className="preview-wrap" onClick={onOverlayClick}>
                    <img src={shots[activeShot]} alt={activeShot} className="preview-image" draggable={false} />
                    <CaptureOverlay shotKey={activeShot} subtle />

                    {points.map((p, idx) => (
                      <div
                        key={idx}
                        className="point-dot"
                        style={{ left: p.x, top: p.y }}
                      >
                        {idx + 1}
                      </div>
                    ))}

                    {points.length > 1 && (
                      <svg className="svg-overlay">
                        {points.map((p, i) => {
                          if (i === points.length - 1) return null;
                          const n = points[i + 1];
                          return <line key={i} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="#EDBB00" strokeWidth="3" />;
                        })}
                        {points.length === 4 && (
                          <line x1={points[3].x} y1={points[3].y} x2={points[0].x} y2={points[0].y} stroke="#EDBB00" strokeWidth="3" />
                        )}
                      </svg>
                    )}
                  </div>

                  <div className="two-col">
                    <div className="info-box garnet">
                      <div className="info-title">צילום זה</div>
                      <div>{currentShot.tip}</div>
                    </div>
                    <div className="info-box gold">
                      <div className="info-title">פעולה מומלצת</div>
                      <div>{guidance}</div>
                    </div>
                  </div>

                  <div className="row-actions">
                    {needsPoints && (
                      <>
                        <button className="btn secondary" onClick={undoPoint}>Undo point</button>
                        <button className="btn secondary" onClick={() => setPoints([])}>Clear points</button>
                      </>
                    )}
                    <button className="btn secondary" onClick={() => clearShot(activeShot)}>Retake shot</button>
                    <button
                      className="btn primary"
                      onClick={() => {
                        const next = nextMissingShot(shots);
                        if (next) setActiveShot(next);
                      }}
                    >
                      Next missing shot
                    </button>
                  </div>
                </>
              )}
              <canvas ref={canvasRef} style={{ display: "none" }} />
            </section>

            <section className="panel">
              <div className="panel-head">
                <h3>Shot checklist</h3>
                <button className="btn primary" onClick={analyzeCard} disabled={!readyForAnalyze}>
                  Analyze card
                </button>
              </div>

              <div className="shot-grid">
                {SHOTS.map((shot) => {
                  const done = Boolean(shots[shot.key]);
                  const isActive = activeShot === shot.key;

                  return (
                    <button
                      key={shot.key}
                      className={`shot-card ${isActive ? "active" : ""} ${done ? "done" : ""}`}
                      onClick={() => setActiveShot(shot.key)}
                    >
                      <div className="shot-card-top">
                        <div className="shot-title">{shot.title}</div>
                        <div className="status-pill">{done ? "Done" : "Missing"}</div>
                      </div>
                      <div className="shot-purpose">{shot.purpose}</div>
                      {autoChecks[shot.key]?.notes?.[0] && (
                        <div className="shot-note">{autoChecks[shot.key].notes[0]}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="right-col">
            <section className="panel">
              <h3>Live guidance</h3>
              <div className="stack">
                <GuideCard label="Current focus" value={currentShot.title} />
                <GuideCard label="Purpose" value={currentShot.purpose} />
                <GuideCard
                  label="What still needs capture"
                  value={missingShots.length ? missingShots.map((s) => s.title).join(", ") : "הכל מוכן לניתוח"}
                />
                <GuideCard label="Immediate suggestion" value={guidance} />
              </div>
            </section>

            <section className="panel">
              <h3>Predicted result</h3>
              {!analysis ? (
                <div className="empty-box">
                  תצלם את כל 6 התמונות, סמן 4 פינות לפחות ב־Front Straight, ואז לחץ Analyze card לקבלת ציון צפוי.
                </div>
              ) : (
                <>
                  <div className="score-grid">
                    <ScoreCard label="Centering" value={analysis.centeringScore} />
                    <ScoreCard label="Corners" value={analysis.cornersScore} />
                    <ScoreCard label="Edges" value={analysis.edgesScore} />
                    <ScoreCard label="Surface" value={analysis.surfaceScore} />
                  </div>

                  <div className="hero-result">
                    <div className="hero-small">Expected grade</div>
                    <div className="hero-big">{analysis.predicted.band}</div>
                    <div className="hero-mid">Overall score: {analysis.predicted.overall}/100</div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function CaptureOverlay({ shotKey, subtle = false }) {
  const style = {
    position: "absolute",
    border: subtle ? "3px solid rgba(255,255,255,0.45)" : "3px solid rgba(255,255,255,0.9)",
    borderRadius: 18,
    boxShadow: subtle ? "0 0 0 9999px rgba(0,0,0,0.08)" : "0 0 0 9999px rgba(0,0,0,0.28)",
    pointerEvents: "none",
  };

  if (shotKey === "front_straight" || shotKey === "back_straight") {
    return <div style={{ ...style, width: "56%", height: "78%", left: "22%", top: "11%" }} />;
  }
  if (shotKey === "top_edge_macro") {
    return <div style={{ ...style, width: "70%", height: "16%", left: "15%", top: "16%" }} />;
  }
  if (shotKey === "bottom_edge_macro") {
    return <div style={{ ...style, width: "70%", height: "16%", left: "15%", bottom: "16%" }} />;
  }
  return <div style={{ ...style, width: "62%", height: "74%", left: "19%", top: "13%", transform: "rotate(3deg)" }} />;
}

function GuideCard({ label, value }) {
  return (
    <div className="guide-card">
      <div className="guide-label">{label}</div>
      <div className="guide-value">{value}</div>
    </div>
  );
}

function ScoreCard({ label, value }) {
  return (
    <div className="score-card">
      <div className="score-label">{label}</div>
      <div className="score-value">{value}</div>
    </div>
  );
}

function nextMissingShot(shots) {
  const next = SHOTS.find((s) => !shots[s.key]);
  return next?.key || null;
}

function computeGeometryFromPoints(points) {
  if (points.length !== 4) return null;

  const sorted = [...points].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);

  const [tl, tr] = top;
  const [bl, br] = bottom;

  const topWidth = dist(tl, tr);
  const bottomWidth = dist(bl, br);
  const leftHeight = dist(tl, bl);
  const rightHeight = dist(tr, br);

  const horiz = ratio(topWidth, bottomWidth);
  const vert = ratio(leftHeight, rightHeight);
  const score = Math.round(((horiz + vert) / 2) * 100);

  const angles = [
    angleDeg(tr, tl, bl),
    angleDeg(tl, tr, br),
    angleDeg(tl, bl, br),
    angleDeg(tr, br, bl),
  ];

  const avgDev = angles.reduce((sum, a) => sum + Math.abs(90 - a), 0) / 4;
  const cornerScore = clamp(Math.round(100 - avgDev * 4.8), 55, 100);

  return { score, cornerScore };
}

function scoreFromPhotoQuality(brightness = 100, detail = 10) {
  const brightScore = clamp(Math.round(brightness / 2.4), 55, 100);
  const detailScore = clamp(Math.round(60 + detail * 3), 55, 100);
  return Math.round(brightScore * 0.35 + detailScore * 0.65);
}

function surfaceScoreFromTilts(left = {}, right = {}) {
  const leftDetail = left.avgDetail ?? 10;
  const rightDetail = right.avgDetail ?? 10;
  const leftBrightness = left.avgBrightness ?? 100;
  const rightBrightness = right.avgBrightness ?? 100;

  const reflectionPenalty = Math.abs(leftBrightness - rightBrightness) < 8 ? 10 : 0;
  const scratchRisk = clamp(Math.round((leftDetail + rightDetail) * 2.2), 0, 40);
  return clamp(96 - scratchRisk - reflectionPenalty, 50, 100);
}

function edgeScoreFromMacros(top = {}, bottom = {}) {
  const topDetail = top.avgDetail ?? 10;
  const bottomDetail = bottom.avgDetail ?? 10;
  const topBrightness = top.avgBrightness ?? 100;
  const bottomBrightness = bottom.avgBrightness ?? 100;

  const wearRisk = clamp(Math.round((topDetail + bottomDetail) * 1.6), 0, 35);
  const whiteningRisk = clamp(Math.round((Math.max(topBrightness, bottomBrightness) - 110) / 3), 0, 15);

  return clamp(97 - wearRisk - whiteningRisk, 55, 100);
}

function weightedGrade(scores) {
  const overall = Math.round(
    scores.centering * 0.24 +
    scores.corners * 0.24 +
    scores.edges * 0.24 +
    scores.surface * 0.28
  );

  let band = "Likely PSA 7–8";
  if (overall >= 97 && minScore(scores) >= 93) band = "Likely PSA 10";
  else if (overall >= 92 && minScore(scores) >= 86) band = "Likely PSA 9";
  else if (overall >= 87) band = "Likely PSA 8–9";
  else if (overall >= 80) band = "Likely PSA 7–8";
  else band = "Likely PSA 6–7";

  return { overall, band };
}

function minScore(scores) {
  return Math.min(scores.centering, scores.corners, scores.edges, scores.surface);
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function ratio(a, b) {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return max === 0 ? 0 : min / max;
}

function angleDeg(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag1 = Math.hypot(ab.x, ab.y);
  const mag2 = Math.hypot(cb.x, cb.y);
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
