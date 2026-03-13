import React, { useEffect, useMemo, useRef, useState } from "react";

const SHOTS = [
  {
    key: "front_straight",
    title: "Front Straight",
    purpose: "Centering + corners",
    tip: "צלם מלמעלה, ישר לחלוטין, עם כל הקלף בתוך המסגרת.",
  },
  {
    key: "front_tilt_left",
    title: "Front Tilt Left",
    purpose: "Surface scratches / print lines",
    tip: "הטה את הקלף שמאלה בזווית של 30°–45° מול אור חזק.",
  },
  {
    key: "front_tilt_right",
    title: "Front Tilt Right",
    purpose: "Surface confirmation",
    tip: "הטה את הקלף ימינה בזווית של 30°–45° מול אור חזק.",
  },
  {
    key: "top_edge_macro",
    title: "Top Edge Macro",
    purpose: "Top edge whitening / chipping",
    tip: "קרב את המצלמה לקצה העליון. פוקוס רק על החלק העליון.",
  },
  {
    key: "bottom_edge_macro",
    title: "Bottom Edge Macro",
    purpose: "Bottom edge whitening / chipping",
    tip: "קרב את המצלמה לקצה התחתון. פוקוס רק על החלק התחתון.",
  },
  {
    key: "back_straight",
    title: "Back Straight",
    purpose: "Back centering + corners + stains",
    tip: "הפוך את הקלף וצלם ישר לחלוטין עם כל הגב בתוך המסגרת.",
  },
];

const COLORS = {
  navy: "#0A2342",
  blue: "#004D98",
  garnet: "#A50044",
  gold: "#EDBB00",
  cream: "#F6F2EA",
  white: "#FFFFFF",
  textDark: "#10233B",
  softBlue: "#D9E7F7",
  softGarnet: "#F3D7E3",
  softGold: "#FFF4BF",
  border: "#204A7A",
};

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
      if (
        edgeVsCenter < 0.82 &&
        (key === "front_tilt_left" || key === "front_tilt_right")
      ) {
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

    const frontCheck = autoChecks.front_straight || {};
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

    const centeringScore = clamp(
      Math.round(centeringFront * 0.78 + backSubscore * 0.22),
      60,
      100
    );
    const cornersScore = clamp(
      Math.round(cornersFront * 0.75 + backSubscore * 0.25),
      60,
      100
    );
    const edgesScore = clamp(edgeSubscore, 55, 100);
    const surfaceScore = clamp(surfaceSubscore, 50, 100);

    const predicted = weightedGrade({
      centering: centeringScore,
      corners: cornersScore,
      edges: edgesScore,
      surface: surfaceScore,
    });

    const action = actionDecision(
      predicted.overall,
      predicted.band,
      surfaceScore,
      edgesScore
    );

    setAnalysis({
      centeringScore,
      cornersScore,
      edgesScore,
      surfaceScore,
      predicted,
      action,
      frontGeometry,
      weaknesses: buildWeaknesses({
        frontCheck,
        backCheck,
        tiltLeft,
        tiltRight,
        topEdge,
        bottomEdge,
        frontGeometry,
        edgesScore,
        surfaceScore,
      }),
      nextBestRetake: suggestedRetake({
        frontCheck,
        backCheck,
        tiltLeft,
        tiltRight,
        topEdge,
        bottomEdge,
        frontGeometry,
      }),
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
      if (activeShot === "front_straight") {
        return "תתחיל בצילום ישר של חזית הקלף. זה הבסיס לכל ההערכה.";
      }
      if (activeShot === "front_tilt_left" || activeShot === "front_tilt_right") {
        return "הצילומים האלכסוניים קריטיים לאיתור שריטות ו-print lines.";
      }
      if (activeShot === "top_edge_macro" || activeShot === "bottom_edge_macro") {
        return "צילום מאקרו של הקצוות יעזור למצוא whitening ו-chipping.";
      }
      return "צלם גם את גב הקלף כדי לזהות מרכוז/כתמים/שחיקה בגב.";
    }

    if ((activeShot === "front_straight" || activeShot === "back_straight") && points.length < 4) {
      return "אחרי הצילום, סמן 4 פינות לקבלת חישוב גיאומטרי מדויק יותר.";
    }

    if (autoChecks[activeShot]?.notes?.length) {
      return autoChecks[activeShot].notes.join(" · ");
    }

    return "הצילום נראה תקין. אפשר להמשיך לצילום הבא.";
  }, [activeShot, shots, points, autoChecks]);

  return (
    <div style={styles.page}>
      <div style={styles.topBar} />
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>BARÇA CARD PRE-GRADER</div>
            <h1 style={styles.title}>Sports Card Pre-Grader Pro</h1>
            <p style={styles.subtitle}>
              כלי פרה-גריידינג עם הנחיה בזמן צילום, בדיקת מרכוז, פינות, קצוות,
              משטח, ופלט של דירוג צפוי.
            </p>
          </div>

          <div style={styles.headerButtons}>
            <button style={styles.secondaryBtn} onClick={startCamera}>
              Restart Camera
            </button>
            <button style={styles.primaryBtn} onClick={resetAll}>
              New Session
            </button>
          </div>
        </header>

        <div style={styles.grid}>
          <div style={styles.leftCol}>
            <section style={styles.card}>
              <div style={styles.sectionHeader}>
                <div>
                  <div style={styles.smallLabel}>Current shot</div>
                  <h2 style={styles.sectionTitle}>{currentShot.title}</h2>
                  <div style={styles.sectionSub}>{currentShot.purpose}</div>
                </div>

                <div style={styles.counterBadge}>
                  {Object.keys(shots).length}/{SHOTS.length} captured
                </div>
              </div>

              {!shots[activeShot] ? (
                <>
                  <div style={styles.cameraWrap}>
                    {cameraError ? (
                      <div style={styles.cameraError}>{cameraError}</div>
                    ) : (
                      <>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          style={styles.video}
                        />
                        <CaptureOverlay shotKey={activeShot} />

                        <button
                          onClick={capture}
                          disabled={!streamReady}
                          aria-label="Capture photo"
                          style={{
                            ...styles.captureBtn,
                            opacity: streamReady ? 1 : 0.4,
                            cursor: streamReady ? "pointer" : "not-allowed",
                          }}
                        >
                          <span style={styles.captureBtnInner}>📸</span>
                        </button>
                      </>
                    )}
                  </div>

                  <div style={styles.infoBoxBlue}>
                    <div style={styles.infoTitle}>הנחיה לצילום</div>
                    <div style={styles.infoText}>{currentShot.tip}</div>
                    <div style={{ ...styles.infoText, marginTop: 8 }}>{guidance}</div>
                  </div>

                  <div style={styles.actionRow}>
                    <label style={styles.uploadBtn}>
                      Upload for this shot
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => uploadForShot(activeShot, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.previewWrap} onClick={onOverlayClick}>
                    <img
                      src={shots[activeShot]}
                      alt={activeShot}
                      style={styles.previewImg}
                      draggable={false}
                    />
                    <CaptureOverlay shotKey={activeShot} subtle />

                    {points.map((p, idx) => (
                      <div
                        key={idx}
                        style={{
                          ...styles.point,
                          left: p.x,
                          top: p.y,
                        }}
                      >
                        {idx + 1}
                      </div>
                    ))}

                    {points.length > 1 && (
                      <svg style={styles.svgOverlay}>
                        {points.map((p, i) => {
                          if (i === points.length - 1) return null;
                          const n = points[i + 1];
                          return (
                            <line
                              key={i}
                              x1={p.x}
                              y1={p.y}
                              x2={n.x}
                              y2={n.y}
                              stroke={COLORS.gold}
                              strokeWidth="3"
                            />
                          );
                        })}
                        {points.length === 4 && (
                          <line
                            x1={points[3].x}
                            y1={points[3].y}
                            x2={points[0].x}
                            y2={points[0].y}
                            stroke={COLORS.gold}
                            strokeWidth="3"
                          />
                        )}
                      </svg>
                    )}
                  </div>

                  <div style={styles.twoCols}>
                    <div style={styles.infoBoxGarnet}>
                      <div style={styles.infoTitle}>צילום זה</div>
                      <div style={styles.infoText}>{currentShot.tip}</div>
                      {autoChecks[activeShot]?.notes?.length ? (
                        <div style={{ ...styles.infoText, marginTop: 8 }}>
                          {autoChecks[activeShot].notes.join(" · ")}
                        </div>
                      ) : null}
                    </div>

                    <div style={styles.infoBoxGold}>
                      <div style={styles.infoTitle}>פעולה מומלצת</div>
                      <div style={styles.infoText}>{guidance}</div>
                      {needsPoints && (
                        <div style={{ ...styles.infoText, marginTop: 8 }}>
                          סמן 4 פינות לפי הסדר: שמאל עליון, ימין עליון, שמאל
                          תחתון, ימין תחתון.
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={styles.actionRow}>
                    {needsPoints && (
                      <>
                        <button style={styles.secondaryBtn} onClick={undoPoint}>
                          Undo point
                        </button>
                        <button
                          style={styles.secondaryBtn}
                          onClick={() => setPoints([])}
                        >
                          Clear points
                        </button>
                      </>
                    )}

                    <button
                      style={styles.secondaryBtn}
                      onClick={() => clearShot(activeShot)}
                    >
                      Retake shot
                    </button>

                    <button
                      style={styles.primaryBtn}
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

            <section style={styles.card}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitleSmall}>Shot checklist</h2>
                <button
                  style={{
                    ...styles.primaryBtn,
                    opacity: readyForAnalyze ? 1 : 0.4,
                    cursor: readyForAnalyze ? "pointer" : "not-allowed",
                  }}
                  onClick={analyzeCard}
                  disabled={!readyForAnalyze}
                >
                  Analyze card
                </button>
              </div>

              <div style={styles.shotGrid}>
                {SHOTS.map((shot) => {
                  const done = Boolean(shots[shot.key]);
                  const isActive = activeShot === shot.key;

                  return (
                    <button
                      key={shot.key}
                      onClick={() => setActiveShot(shot.key)}
                      style={{
                        ...styles.shotCard,
                        borderColor: isActive ? COLORS.gold : COLORS.border,
                        background: done
                          ? "linear-gradient(135deg, rgba(0,77,152,0.16), rgba(165,0,68,0.12))"
                          : COLORS.white,
                      }}
                    >
                      <div style={styles.shotCardTop}>
                        <div style={styles.shotTitle}>{shot.title}</div>
                        <div
                          style={{
                            ...styles.statusBadge,
                            background: done ? COLORS.gold : COLORS.softBlue,
                            color: COLORS.navy,
                          }}
                        >
                          {done ? "Done" : "Missing"}
                        </div>
                      </div>

                      <div style={styles.shotPurpose}>{shot.purpose}</div>

                      {autoChecks[shot.key]?.notes?.[0] && (
                        <div style={styles.shotNote}>
                          {autoChecks[shot.key].notes[0]}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <div style={styles.rightCol}>
            <section style={styles.card}>
              <h2 style={styles.sectionTitleSmall}>Live guidance</h2>
              <div style={styles.stack}>
                <GuideCard label="Current focus" value={currentShot.title} />
                <GuideCard label="Purpose" value={currentShot.purpose} />
                <GuideCard
                  label="What still needs capture"
                  value={
                    missingShots.length
                      ? missingShots.map((s) => s.title).join(", ")
                      : "הכל מוכן לניתוח"
                  }
                />
                <GuideCard label="Immediate suggestion" value={guidance} />
              </div>
            </section>

            <section style={styles.card}>
              <h2 style={styles.sectionTitleSmall}>Predicted result</h2>

              {!analysis ? (
                <div style={styles.emptyState}>
                  תצלם את כל 6 התמונות, סמן 4 פינות לפחות ב־Front Straight,
                  ואז לחץ Analyze card לקבלת ציון צפוי.
                </div>
              ) : (
                <>
                  <div style={styles.resultGrid}>
                    <ScoreCard label="Centering" value={analysis.centeringScore} />
                    <ScoreCard label="Corners" value={analysis.cornersScore} />
                    <ScoreCard label="Edges" value={analysis.edgesScore} />
                    <ScoreCard label="Surface" value={analysis.surfaceScore} />
                  </div>

                  <div style={styles.heroResult}>
                    <div style={styles.heroSmall}>Expected grade</div>
                    <div style={styles.heroBig}>{analysis.predicted.band}</div>
                    <div style={styles.heroMid}>
                      Overall score: {analysis.predicted.overall}/100
                    </div>
                    <div style={styles.heroAction}>{analysis.action}</div>
                  </div>

                  <div style={styles.infoBoxBlue}>
                    <div style={styles.infoTitle}>Main weaknesses</div>
                    <div style={styles.infoText}>
                      {analysis.weaknesses.join(" · ")}
                    </div>
                  </div>

                  <div style={styles.infoBoxGold}>
                    <div style={styles.infoTitle}>
                      Best retake to improve confidence
                    </div>
                    <div style={styles.infoText}>{analysis.nextBestRetake}</div>
                  </div>
                </>
              )}
            </section>

            <section style={styles.card}>
              <h2 style={styles.sectionTitleSmall}>What I improved</h2>
              <div style={styles.stack}>
                <MiniNote text="עיצוב מלא בלי Tailwind, כדי שהאתר ייראה טוב מיידית." />
                <MiniNote text="כותרות גדולות וברורות עם היררכיה ויזואלית נוחה." />
                <MiniNote text="פלטת צבעים של ברצלונה: כחול, גרנט, זהב ורקע בהיר לקריאות." />
                <MiniNote text="כפתור צילום ברור ופשוט בתוך המצלמה עם אייקון 📸." />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function CaptureOverlay({ shotKey, subtle = false }) {
  const common = {
    position: "absolute",
    border: `3px solid ${subtle ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.9)"}`,
    borderRadius: 18,
    boxShadow: subtle
      ? "0 0 0 9999px rgba(0,0,0,0.08)"
      : "0 0 0 9999px rgba(0,0,0,0.28)",
    pointerEvents: "none",
  };

  if (shotKey === "front_straight" || shotKey === "back_straight") {
    return (
      <div
        style={{
          ...common,
          width: "56%",
          height: "78%",
          left: "22%",
          top: "11%",
        }}
      />
    );
  }

  if (shotKey === "top_edge_macro") {
    return (
      <div
        style={{
          ...common,
          width: "70%",
          height: "16%",
          left: "15%",
          top: "16%",
        }}
      />
    );
  }

  if (shotKey === "bottom_edge_macro") {
    return (
      <div
        style={{
          ...common,
          width: "70%",
          height: "16%",
          left: "15%",
          bottom: "16%",
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...common,
        width: "62%",
        height: "74%",
        left: "19%",
        top: "13%",
        transform: "rotate(3deg)",
      }}
    />
  );
}

function GuideCard({ label, value }) {
  return (
    <div style={styles.guideCard}>
      <div style={styles.guideLabel}>{label}</div>
      <div style={styles.guideValue}>{value}</div>
    </div>
  );
}

function ScoreCard({ label, value }) {
  return (
    <div style={styles.scoreCard}>
      <div style={styles.scoreLabel}>{label}</div>
      <div style={styles.scoreValue}>{value}</div>
    </div>
  );
}

function MiniNote({ text }) {
  return <div style={styles.miniNote}>{text}</div>;
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

  const avgDev =
    angles.reduce((sum, a) => sum + Math.abs(90 - a), 0) / 4;
  const cornerScore = clamp(Math.round(100 - avgDev * 4.8), 55, 100);

  return {
    score,
    cornerScore,
    angles: angles.map((a) => Number(a.toFixed(1))),
    avgDev: Number(avgDev.toFixed(2)),
  };
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
  const whiteningRisk = clamp(
    Math.round((Math.max(topBrightness, bottomBrightness) - 110) / 3),
    0,
    15
  );

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

function actionDecision(overall, band, surface, edges) {
  if (band === "Likely PSA 10" || (band === "Likely PSA 9" && overall >= 94)) {
    return "SEND — נראה כמו מועמד חזק מאוד לדירוג, בתנאי שהשווי מצדיק את העמלה.";
  }
  if (surface < 82 || edges < 82) {
    return "BORDERLINE — לפני משלוח כדאי לעשות בדיקת loupe ידנית לשריטות/whitening.";
  }
  if (overall >= 86) {
    return "MAYBE — מועמד סביר, אבל לא בטוח ששווה כלכלית בלי פער יפה בין RAW ל-PSA.";
  }
  return "SKIP — כרגע עדיף לא לשלוח אלא אם זה קלף נדיר מאוד או אישי.";
}

function buildWeaknesses(ctx) {
  const out = [];
  if (!ctx.frontGeometry) out.push("לא סומנו 4 פינות ב-Front Straight, לכן המרכוז פחות מדויק");
  if ((ctx.tiltLeft.avgDetail ?? 0) > 12 || (ctx.tiltRight.avgDetail ?? 0) > 12) {
    out.push("יש סיכון ל-surface marks או print lines בזוויות האלכסוניות");
  }
  if ((ctx.topEdge.avgBrightness ?? 0) > 125 || (ctx.bottomEdge.avgBrightness ?? 0) > 125) {
    out.push("יש סיכוי ל-whitening באחד הקצוות");
  }
  if ((ctx.backCheck.avgDetail ?? 99) < 7) {
    out.push("צילום הגב רך מדי ועלול להסתיר כתמים או פינות רכות");
  }
  if (ctx.frontGeometry?.avgDev > 3) {
    out.push("הגיאומטריה של הפינות מצביעה על חיתוך או שחיקה קלה");
  }
  if (ctx.edgesScore < 84) out.push("הקצוות כרגע הם נקודת החולשה המרכזית");
  if (ctx.surfaceScore < 84) out.push("המשטח כרגע הוא הסיכון המרכזי לציון נמוך יותר");
  return out.length ? out : ["לא זוהתה חולשה ברורה בצילומים הנוכחיים"];
}

function suggestedRetake(ctx) {
  if (!ctx.frontGeometry) {
    return "Front Straight — סמן 4 פינות כדי לשפר את אמינות חישוב המרכוז והפינות.";
  }
  if ((ctx.tiltLeft.avgDetail ?? 0) > 12) {
    return "Front Tilt Left — נסה אור חזק יותר וזווית מעט שונה כדי לאשר אם יש שריטות או רק השתקפות.";
  }
  if ((ctx.tiltRight.avgDetail ?? 0) > 12) {
    return "Front Tilt Right — נסה זווית מעט פתוחה יותר כדי לבדוק print lines.";
  }
  if ((ctx.topEdge.avgBrightness ?? 0) > 125) {
    return "Top Edge Macro — התקרב יותר ושמור פוקוס רק על הקצה העליון.";
  }
  if ((ctx.bottomEdge.avgBrightness ?? 0) > 125) {
    return "Bottom Edge Macro — צלם שוב עם פחות החזר אור ויותר חדות.";
  }
  if ((ctx.backCheck.avgDetail ?? 99) < 7) {
    return "Back Straight — הגב לא חד מספיק כדי לאשר corners ו-stains.";
  }
  return "הסט הנוכחי טוב. אם תרצה להעלות ביטחון, בצע מאקרו נוסף לכל אחת מ-4 הפינות.";
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

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #0A2342 0%, #0D2D56 20%, #F6F2EA 20%, #F6F2EA 100%)",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    color: COLORS.textDark,
  },
  topBar: {
    height: 10,
    background: `linear-gradient(90deg, ${COLORS.garnet}, ${COLORS.blue}, ${COLORS.gold}, ${COLORS.garnet})`,
  },
  container: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "24px 16px 40px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 24,
  },
  kicker: {
    color: COLORS.gold,
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: "clamp(32px, 5vw, 54px)",
    lineHeight: 1.02,
    color: COLORS.white,
    fontWeight: 900,
  },
  subtitle: {
    marginTop: 12,
    maxWidth: 760,
    color: "#E8EEF7",
    fontSize: "clamp(15px, 2vw, 18px)",
    lineHeight: 1.6,
  },
  headerButtons: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.35fr 0.85fr",
    gap: 20,
  },
  leftCol: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  rightCol: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  card: {
    background: COLORS.white,
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 10px 28px rgba(10,35,66,0.12)",
    border: `1px solid rgba(0,77,152,0.15)`,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  smallLabel: {
    color: COLORS.garnet,
    fontWeight: 800,
    fontSize: 13,
    marginBottom: 6,
  },
  sectionTitle: {
    margin: 0,
    fontSize: "clamp(28px, 4vw, 36px)",
    lineHeight: 1.05,
    color: COLORS.navy,
    fontWeight: 900,
  },
  sectionTitleSmall: {
    margin: 0,
    fontSize: "clamp(22px, 3vw, 28px)",
    lineHeight: 1.1,
    color: COLORS.navy,
    fontWeight: 900,
  },
  sectionSub: {
    marginTop: 8,
    color: COLORS.blue,
    fontWeight: 700,
    fontSize: 15,
  },
  counterBadge: {
    background: `linear-gradient(135deg, ${COLORS.gold}, #ffd85b)`,
    color: COLORS.navy,
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 900,
    fontSize: 14,
  },
  cameraWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "4 / 3",
    borderRadius: 24,
    overflow: "hidden",
    background: "#000",
    marginBottom: 16,
    border: `3px solid ${COLORS.blue}`,
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  cameraError: {
    color: COLORS.white,
    padding: 24,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 1.6,
  },
  captureBtn: {
    position: "absolute",
    left: "50%",
    bottom: 16,
    transform: "translateX(-50%)",
    width: 74,
    height: 74,
    borderRadius: "50%",
    border: `4px solid ${COLORS.gold}`,
    background: COLORS.white,
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    zIndex: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  captureBtnInner: {
    fontSize: 30,
    lineHeight: 1,
  },
  previewWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "4 / 3",
    borderRadius: 24,
    overflow: "hidden",
    background: "#d9d9d9",
    marginBottom: 16,
    cursor: "crosshair",
    border: `3px solid ${COLORS.blue}`,
  },
  previewImg: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    background: "#f0f0f0",
  },
  point: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: COLORS.garnet,
    color: COLORS.white,
    border: `2px solid ${COLORS.white}`,
    transform: "translate(-50%, -50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 900,
    zIndex: 20,
  },
  svgOverlay: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryBtn: {
    background: `linear-gradient(135deg, ${COLORS.garnet}, ${COLORS.blue})`,
    color: COLORS.white,
    border: "none",
    borderRadius: 14,
    padding: "12px 16px",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
  },
  secondaryBtn: {
    background: COLORS.softBlue,
    color: COLORS.navy,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: "12px 16px",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
  },
  uploadBtn: {
    background: COLORS.softGold,
    color: COLORS.navy,
    border: `1px solid ${COLORS.gold}`,
    borderRadius: 14,
    padding: "12px 16px",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
  },
  infoBoxBlue: {
    background: "linear-gradient(135deg, #EAF3FF, #DCEBFF)",
    border: `1px solid rgba(0,77,152,0.22)`,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  infoBoxGarnet: {
    background: "linear-gradient(135deg, #FBEAF0, #F5D9E5)",
    border: `1px solid rgba(165,0,68,0.18)`,
    borderRadius: 18,
    padding: 16,
  },
  infoBoxGold: {
    background: "linear-gradient(135deg, #FFF7D6, #FFF1B2)",
    border: `1px solid rgba(237,187,0,0.35)`,
    borderRadius: 18,
    padding: 16,
  },
  infoTitle: {
    color: COLORS.navy,
    fontWeight: 900,
    fontSize: 17,
    marginBottom: 8,
  },
  infoText: {
    color: COLORS.textDark,
    fontSize: 15,
    lineHeight: 1.7,
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 16,
  },
  shotGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  shotCard: {
    textAlign: "left",
    borderWidth: 2,
    borderStyle: "solid",
    borderRadius: 18,
    padding: 14,
    cursor: "pointer",
  },
  shotCardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "flex-start",
    marginBottom: 8,
  },
  shotTitle: {
    fontWeight: 900,
    color: COLORS.navy,
    fontSize: 16,
  },
  shotPurpose: {
    color: COLORS.blue,
    fontSize: 14,
    lineHeight: 1.5,
    fontWeight: 700,
  },
  shotNote: {
    marginTop: 8,
    color: COLORS.garnet,
    fontSize: 13,
    lineHeight: 1.5,
    fontWeight: 700,
  },
  statusBadge: {
    borderRadius: 999,
    padding: "6px 10px",
    fontWeight: 900,
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  guideCard: {
    background: COLORS.cream,
    borderRadius: 18,
    padding: 14,
    border: `1px solid rgba(0,77,152,0.12)`,
  },
  guideLabel: {
    color: COLORS.garnet,
    fontWeight: 900,
    fontSize: 13,
    marginBottom: 6,
  },
  guideValue: {
    color: COLORS.textDark,
    fontSize: 15,
    lineHeight: 1.7,
    fontWeight: 700,
  },
  emptyState: {
    background: COLORS.cream,
    borderRadius: 18,
    padding: 16,
    color: COLORS.textDark,
    fontSize: 15,
    lineHeight: 1.7,
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  scoreCard: {
    background: "linear-gradient(135deg, #EAF3FF, #FBEAF0)",
    borderRadius: 18,
    padding: 14,
    border: `1px solid rgba(0,77,152,0.12)`,
  },
  scoreLabel: {
    color: COLORS.garnet,
    fontWeight: 900,
    fontSize: 13,
    marginBottom: 6,
  },
  scoreValue: {
    color: COLORS.navy,
    fontWeight: 900,
    fontSize: 32,
    lineHeight: 1,
  },
  heroResult: {
    background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.blue}, ${COLORS.garnet})`,
    borderRadius: 22,
    padding: 18,
    color: COLORS.white,
    marginBottom: 16,
  },
  heroSmall: {
    fontSize: 13,
    fontWeight: 800,
    opacity: 0.85,
    marginBottom: 6,
  },
  heroBig: {
    fontSize: "clamp(28px, 4vw, 40px)",
    fontWeight: 900,
    lineHeight: 1.05,
  },
  heroMid: {
    fontSize: 15,
    marginTop: 8,
    opacity: 0.9,
    fontWeight: 700,
  },
  heroAction: {
    marginTop: 14,
    background: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 12,
    fontSize: 15,
    lineHeight: 1.6,
    fontWeight: 700,
  },
  miniNote: {
    background: "linear-gradient(135deg, #F7F2EA, #EAF3FF)",
    borderRadius: 16,
    padding: 14,
    color: COLORS.textDark,
    fontSize: 15,
    lineHeight: 1.7,
    fontWeight: 700,
    border: `1px solid rgba(0,77,152,0.1)`,
  },
};

if (typeof window !== "undefined") {
  const style = document.createElement("style");
  style.innerHTML = `
    * { box-sizing: border-box; }
    html, body, #__next { margin: 0; padding: 0; }
    button, input, textarea, select { font: inherit; }
    @media (max-width: 1100px) {
      body .__app_grid_override {
        grid-template-columns: 1fr !important;
      }
    }
    @media (max-width: 900px) {
      body .__two_cols_override,
      body .__shot_grid_override,
      body .__result_grid_override {
        grid-template-columns: 1fr !important;
      }
    }
  `;
  if (!document.getElementById("global-card-grader-style")) {
    style.id = "global-card-grader-style";
    document.head.appendChild(style);
  }
}
