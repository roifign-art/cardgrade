import React, { useEffect, useMemo, useRef, useState } from 'react';

const SHOTS = [
  {
    key: 'front_straight',
    title: 'Front Straight',
    purpose: 'Centering + corners',
    tip: 'צלם מלמעלה, ישר לחלוטין, רקע כהה, כל הקלף בתוך המסגרת.',
  },
  {
    key: 'front_tilt_left',
    title: 'Front Tilt Left',
    purpose: 'Surface scratches / print lines',
    tip: 'הטה את הקלף מעט שמאלה בזווית של בערך 30°–45° מול אור חזק.',
  },
  {
    key: 'front_tilt_right',
    title: 'Front Tilt Right',
    purpose: 'Surface confirmation',
    tip: 'הטה את הקלף מעט ימינה בזווית של בערך 30°–45° מול אור חזק.',
  },
  {
    key: 'top_edge_macro',
    title: 'Top Edge Macro',
    purpose: 'Top edge whitening / chipping',
    tip: 'קרב את המצלמה לחלק העליון של הקלף. פקס רק על הקצה העליון.',
  },
  {
    key: 'bottom_edge_macro',
    title: 'Bottom Edge Macro',
    purpose: 'Bottom edge whitening / chipping',
    tip: 'קרב את המצלמה לחלק התחתון של הקלף. פקס רק על הקצה התחתון.',
  },
  {
    key: 'back_straight',
    title: 'Back Straight',
    purpose: 'Back centering + corners + stains',
    tip: 'הפוך את הקלף וצלם ישר לגמרי, כל הגב בתוך המסגרת.',
  },
];

export default function CardPregraderCameraTool() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [activeShot, setActiveShot] = useState('front_straight');
  const [shots, setShots] = useState({});
  const [analysis, setAnalysis] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [points, setPoints] = useState([]);
  const [autoChecks, setAutoChecks] = useState({});
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  async function startCamera() {
    try {
      setCameraError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
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
      setCameraError('לא הצלחתי לגשת למצלמה. אפשר להעלות תמונות ידנית לכל שלב.');
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
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const url = canvas.toDataURL('image/jpeg', 0.96);
    saveShot(activeShot, url);
  }

  function saveShot(key, url) {
    setShots((prev) => ({ ...prev, [key]: url }));
    setAnalysis(null);
    setPoints([]);
    runAutoFrameChecks(key, url);
    const next = nextMissingShot({ ...shots, [key]: url });
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
    setActiveShot('front_straight');
  }

  function clearShot(key) {
    setShots((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setAutoChecks((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setAnalysis(null);
    setPoints([]);
    setActiveShot(key);
  }

  function onOverlayClick(e) {
    if (activeShot !== 'front_straight' && activeShot !== 'back_straight') return;
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
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
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

          const isEdge = x < canvas.width * 0.12 || x > canvas.width * 0.88 || y < canvas.height * 0.12 || y > canvas.height * 0.88;
          const isCenter = x > canvas.width * 0.3 && x < canvas.width * 0.7 && y > canvas.height * 0.3 && y < canvas.height * 0.7;
          if (isEdge) edgeBrightness += bright;
          if (isCenter) centerBrightness += bright;
        }
      }

      const pixels = (canvas.width - 2) * (canvas.height - 2);
      const avgBrightness = total / pixels;
      const avgDetail = detail / pixels;
      const edgeVsCenter = edgeBrightness / centerBrightness;

      const notes = [];
      if (avgBrightness < 70) notes.push('צריך יותר אור');
      if (avgDetail < 8) notes.push('התמונה מעט רכה, תתקרב או תייצב');
      if (edgeVsCenter > 1.15) notes.push('יש סיכוי לחיתוך בקצוות, תכלול את כל הקלף');
      if (edgeVsCenter < 0.82 && (key === 'front_tilt_left' || key === 'front_tilt_right')) notes.push('הברק לא תופס את המשטח, שנה זווית לאיתור שריטות');
      if (!notes.length) notes.push('צילום נראה טוב');

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

    const centeringScore = clamp(Math.round((centeringFront * 0.78) + (backSubscore * 0.22)), 60, 100);
    const cornersScore = clamp(Math.round((cornersFront * 0.75) + (backSubscore * 0.25)), 60, 100);
    const edgesScore = clamp(edgeSubscore, 55, 100);
    const surfaceScore = clamp(surfaceSubscore, 50, 100);

    const predicted = weightedGrade({
      centering: centeringScore,
      corners: cornersScore,
      edges: edgesScore,
      surface: surfaceScore,
    });

    const action = actionDecision(predicted.overall, predicted.band, surfaceScore, edgesScore);

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
  const needsPoints = (activeShot === 'front_straight' || activeShot === 'back_straight') && shots[activeShot];
  const guidance = guidanceText(activeShot, autoChecks[activeShot], shots, points);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Sports Card Pre-Grader Pro</h1>
            <p className="text-zinc-600 mt-2 max-w-3xl">
              כלי פרה-גריידינג עם הנחיה בזמן צילום, בדיקת מרכוז, פינות, קצוות, משטח, ופלט של דירוג צפוי.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={startCamera} className="px-4 py-2 rounded-2xl bg-white shadow-sm">Restart Camera</button>
            <button onClick={resetAll} className="px-4 py-2 rounded-2xl bg-zinc-900 text-white">New Session</button>
          </div>
        </div>

        <div className="grid xl:grid-cols-[1.2fr_0.8fr] gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-sm p-4 md:p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-sm text-zinc-500">Current shot</div>
                  <h2 className="text-2xl font-semibold">{currentShot.title}</h2>
                  <p className="text-sm text-zinc-600 mt-1">{currentShot.purpose}</p>
                </div>
                <div className="px-3 py-1 rounded-full bg-zinc-100 text-sm">
                  {Object.keys(shots).length}/{SHOTS.length} captured
                </div>
              </div>

              {!shots[activeShot] ? (
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-3xl bg-black aspect-[4/3] flex items-center justify-center">
                    {cameraError ? (
                      <div className="text-white px-6 text-center">{cameraError}</div>
                    ) : (
                      <>
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        <CaptureOverlay shotKey={activeShot} />
                      </>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-100">
                    <div className="font-semibold mb-1">הנחיה לצילום</div>
                    <div className="text-sm leading-6">{currentShot.tip}</div>
                    {guidance && <div className="text-sm mt-2 text-zinc-700">{guidance}</div>}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button onClick={capture} disabled={!streamReady} className="px-4 py-2 rounded-2xl bg-zinc-900 text-white disabled:opacity-40">Capture</button>
                    <label className="px-4 py-2 rounded-2xl bg-zinc-200 cursor-pointer">
                      Upload for this shot
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadForShot(activeShot, e.target.files?.[0])} />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-3xl overflow-hidden bg-zinc-200">
                    <div className="relative aspect-[4/3] bg-zinc-100 select-none" onClick={onOverlayClick}>
                      <img src={shots[activeShot]} alt={activeShot} className="w-full h-full object-contain" draggable={false} />
                      <CaptureOverlay shotKey={activeShot} subtle />
                      {points.map((p, idx) => (
                        <div
                          key={idx}
                          className="absolute w-5 h-5 rounded-full bg-red-500 border-2 border-white -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ left: p.x, top: p.y }}
                        >
                          {idx + 1}
                        </div>
                      ))}
                      {points.length > 1 && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none">
                          {points.map((p, i) => {
                            if (i === points.length - 1) return null;
                            const n = points[i + 1];
                            return <line key={i} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="lime" strokeWidth="3" />;
                          })}
                          {points.length === 4 && <line x1={points[3].x} y1={points[3].y} x2={points[0].x} y2={points[0].y} stroke="lime" strokeWidth="3" />}
                        </svg>
                      )}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-zinc-100">
                      <div className="font-semibold mb-1">צילום זה</div>
                      <div className="text-sm leading-6">{currentShot.tip}</div>
                      {autoChecks[activeShot]?.notes?.length ? (
                        <div className="mt-2 text-sm text-zinc-700">
                          {autoChecks[activeShot].notes.join(' · ')}
                        </div>
                      ) : null}
                    </div>
                    <div className="p-4 rounded-2xl bg-zinc-100">
                      <div className="font-semibold mb-1">פעולה מומלצת</div>
                      <div className="text-sm leading-6">{guidance}</div>
                      {needsPoints && <div className="text-sm mt-2">סמן 4 פינות לפי הסדר: שמאל עליון, ימין עליון, שמאל תחתון, ימין תחתון.</div>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {needsPoints && (
                      <>
                        <button onClick={undoPoint} className="px-4 py-2 rounded-2xl bg-zinc-200">Undo point</button>
                        <button onClick={() => setPoints([])} className="px-4 py-2 rounded-2xl bg-zinc-200">Clear points</button>
                      </>
                    )}
                    <button onClick={() => clearShot(activeShot)} className="px-4 py-2 rounded-2xl bg-zinc-200">Retake shot</button>
                    <button
                      onClick={() => {
                        const next = nextMissingShot(shots);
                        if (next) setActiveShot(next);
                      }}
                      className="px-4 py-2 rounded-2xl bg-zinc-900 text-white"
                    >
                      Next missing shot
                    </button>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="bg-white rounded-3xl shadow-sm p-4 md:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Shot checklist</h2>
                <button onClick={analyzeCard} disabled={!readyForAnalyze} className="px-4 py-2 rounded-2xl bg-zinc-900 text-white disabled:opacity-40">
                  Analyze card
                </button>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {SHOTS.map((shot) => {
                  const done = Boolean(shots[shot.key]);
                  const isActive = activeShot === shot.key;
                  return (
                    <button
                      key={shot.key}
                      onClick={() => setActiveShot(shot.key)}
                      className={`text-left p-4 rounded-2xl border transition ${isActive ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white'} ${done ? 'ring-1 ring-emerald-400' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="font-semibold">{shot.title}</div>
                        <div className={`text-xs px-2 py-1 rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                          {done ? 'Done' : 'Missing'}
                        </div>
                      </div>
                      <div className="text-sm text-zinc-600">{shot.purpose}</div>
                      {autoChecks[shot.key]?.notes?.[0] && <div className="text-xs mt-2 text-zinc-500">{autoChecks[shot.key].notes[0]}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-sm p-4 md:p-5">
              <h2 className="text-xl font-semibold mb-3">Live guidance</h2>
              <div className="space-y-3">
                <GuideCard label="Current focus" value={currentShot.title} />
                <GuideCard label="Purpose" value={currentShot.purpose} />
                <GuideCard label="What still needs capture" value={missingShots.length ? missingShots.map((s) => s.title).join(', ') : 'הכל מוכן לניתוח'} />
                <GuideCard label="Immediate suggestion" value={guidance} />
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm p-4 md:p-5">
              <h2 className="text-xl font-semibold mb-3">Recommendations I added</h2>
              <div className="space-y-3 text-sm text-zinc-700 leading-6">
                <div className="p-3 rounded-2xl bg-zinc-100">Multi-shot workflow כדי שלא תפספס surface או edge issues שרואים רק בזוויות שונות.</div>
                <div className="p-3 rounded-2xl bg-zinc-100">Shot-by-shot feedback שמצביע איזה אזור או סוג צילום עדיין חלש.</div>
                <div className="p-3 rounded-2xl bg-zinc-100">Predicted grade band + action recommendation: Send / Borderline / Skip.</div>
                <div className="p-3 rounded-2xl bg-zinc-100">Retake suggestion שמחזיר אותך אוטומטית לצילום שהכי שווה לשפר.</div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm p-4 md:p-5">
              <h2 className="text-xl font-semibold mb-3">Predicted result</h2>
              {!analysis ? (
                <div className="text-sm text-zinc-600 leading-6">
                  תצלם את כל 6 התמונות, סמן 4 פינות לפחות ב-Front Straight, ואז לחץ Analyze card לקבלת ציון צפוי.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <ScoreCard label="Centering" value={analysis.centeringScore} />
                    <ScoreCard label="Corners" value={analysis.cornersScore} />
                    <ScoreCard label="Edges" value={analysis.edgesScore} />
                    <ScoreCard label="Surface" value={analysis.surfaceScore} />
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-900 text-white">
                    <div className="text-sm opacity-80 mb-1">Expected grade</div>
                    <div className="text-3xl font-bold">{analysis.predicted.band}</div>
                    <div className="text-sm mt-1">Overall score: {analysis.predicted.overall}/100</div>
                    <div className="text-sm mt-3">{analysis.action}</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-100">
                    <div className="font-semibold mb-2">Main weaknesses</div>
                    <div className="text-sm leading-6">{analysis.weaknesses.join(' · ')}</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-100">
                    <div className="font-semibold mb-2">Best retake to improve confidence</div>
                    <div className="text-sm leading-6">{analysis.nextBestRetake}</div>
                  </div>

                  <div className="text-xs text-zinc-500 leading-5">
                    זהו כלי פרה-סק्रीन חכם, לא תחליף לדירוג רשמי. הוא נותן החלטה מקדימה טובה יותר, אבל surface micro-scratches, ניקוי, ולפעמים פגמי הדפסה עדינים עדיין דורשים עין אנושית / צילום מקרו טוב יותר.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CaptureOverlay({ shotKey, subtle = false }) {
  const base = subtle ? 'border-white/45 shadow-[0_0_0_9999px_rgba(0,0,0,0.08)]' : 'border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]';

  if (shotKey === 'front_straight' || shotKey === 'back_straight') {
    return (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className={`w-[56%] h-[78%] rounded-2xl border-4 ${base}`} />
      </div>
    );
  }

  if (shotKey === 'top_edge_macro') {
    return (
      <div className="absolute inset-0 pointer-events-none flex items-start justify-center pt-[16%]">
        <div className={`w-[70%] h-[16%] rounded-2xl border-4 ${base}`} />
      </div>
    );
  }

  if (shotKey === 'bottom_edge_macro') {
    return (
      <div className="absolute inset-0 pointer-events-none flex items-end justify-center pb-[16%]">
        <div className={`w-[70%] h-[16%] rounded-2xl border-4 ${base}`} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div className={`w-[62%] h-[74%] rounded-2xl border-4 ${base} rotate-3`} />
    </div>
  );
}

function GuideCard({ label, value }) {
  return (
    <div className="p-3 rounded-2xl bg-zinc-100">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-sm leading-6">{value}</div>
    </div>
  );
}

function ScoreCard({ label, value }) {
  return (
    <div className="p-4 rounded-2xl bg-zinc-100">
      <div className="text-sm text-zinc-500 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function nextMissingShot(shots) {
  const next = SHOTS.find((s) => !shots[s.key]);
  return next?.key || null;
}

function guidanceText(activeShot, check, shots, points) {
  if (!shots[activeShot]) {
    if (activeShot === 'front_straight') return 'תתחיל בצילום ישר של חזית הקלף. זה הבסיס לכל ההערכה.';
    if (activeShot === 'front_tilt_left' || activeShot === 'front_tilt_right') return 'הצילומים האלכסוניים קריטיים לאיתור שריטות ו-print lines.';
    if (activeShot === 'top_edge_macro' || activeShot === 'bottom_edge_macro') return 'צילום מאקרו של הקצוות יעזור למצוא whitening ו-chipping.';
    return 'צלם גם את גב הקלף כדי לזהות מרכוז/כתמים/שחיקה בגב.';
  }

  if ((activeShot === 'front_straight' || activeShot === 'back_straight') && points.length < 4) {
    return 'אחרי הצילום, סמן 4 פינות לקבלת חישוב גיאומטרי מדויק יותר.';
  }

  if (check?.notes?.length) {
    return check.notes.join(' · ');
  }

  return 'הצילום נראה תקין. אפשר להמשיך לצילום הבא.';
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
  const avgDev = angles.reduce((s, a) => s + Math.abs(90 - a), 0) / 4;
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

  let band = 'Likely PSA 7–8';
  if (overall >= 97 && minScore(scores) >= 93) band = 'Likely PSA 10';
  else if (overall >= 92 && minScore(scores) >= 86) band = 'Likely PSA 9';
  else if (overall >= 87) band = 'Likely PSA 8–9';
  else if (overall >= 80) band = 'Likely PSA 7–8';
  else band = 'Likely PSA 6–7';

  return { overall, band };
}

function actionDecision(overall, band, surface, edges) {
  if (band === 'Likely PSA 10' || (band === 'Likely PSA 9' && overall >= 94)) {
    return 'SEND — נראה כמו מועמד חזק מאוד לדירוג, בתנאי שהשווי מצדיק את העמלה.';
  }
  if (surface < 82 || edges < 82) {
    return 'BORDERLINE — לפני משלוח כדאי לעשות בדיקת loupe ידנית לשריטות/whitening.';
  }
  if (overall >= 86) {
    return 'MAYBE — מועמד סביר, אבל לא בטוח ששווה כלכלית בלי פער יפה בין RAW ל-PSA.';
  }
  return 'SKIP — כרגע עדיף לא לשלוח אלא אם זה קלף נדיר מאוד או אישי.';
}

function buildWeaknesses(ctx) {
  const out = [];
  if (!ctx.frontGeometry) out.push('לא סומנו 4 פינות ב-Front Straight, לכן המרכוז פחות מדויק');
  if ((ctx.tiltLeft.avgDetail ?? 0) > 12 || (ctx.tiltRight.avgDetail ?? 0) > 12) out.push('יש סיכון ל-surface marks או print lines בזוויות האלכסוניות');
  if ((ctx.topEdge.avgBrightness ?? 0) > 125 || (ctx.bottomEdge.avgBrightness ?? 0) > 125) out.push('יש סיכוי ל-whitening באחד הקצוות');
  if ((ctx.backCheck.avgDetail ?? 99) < 7) out.push('צילום הגב רך מדי ועלול להסתיר כתמים או פינות רכות');
  if (ctx.frontGeometry?.avgDev > 3) out.push('הגיאומטריה של הפינות מצביעה על חיתוך או שחיקה קלה');
  if (ctx.edgesScore < 84) out.push('הקצוות כרגע הם נקודת החולשה המרכזית');
  if (ctx.surfaceScore < 84) out.push('המשטח כרגע הוא הסיכון המרכזי לציון נמוך יותר');
  return out.length ? out : ['לא זוהתה חולשה ברורה בצילומים הנוכחיים'];
}

function suggestedRetake(ctx) {
  if (!ctx.frontGeometry) return 'Front Straight — סמן 4 פינות כדי לשפר את אמינות חישוב המרכוז והפינות.';
  if ((ctx.tiltLeft.avgDetail ?? 0) > 12) return 'Front Tilt Left — נסה אור חזק יותר וזווית מעט שונה כדי לאשר אם יש שריטות או רק השתקפות.';
  if ((ctx.tiltRight.avgDetail ?? 0) > 12) return 'Front Tilt Right — נסה זווית מעט פתוחה יותר כדי לבדוק print lines.';
  if ((ctx.topEdge.avgBrightness ?? 0) > 125) return 'Top Edge Macro — התקרב יותר ושמור פוקוס רק על הקצה העליון.';
  if ((ctx.bottomEdge.avgBrightness ?? 0) > 125) return 'Bottom Edge Macro — צלם שוב עם פחות החזר אור ויותר חדות.';
  if ((ctx.backCheck.avgDetail ?? 99) < 7) return 'Back Straight — הגב לא חד מספיק כדי לאשר corners ו-stains.';
  return 'הסט הנוכחי טוב. אם תרצה להעלות ביטחון, בצע מאקרו נוסף לכל אחת מ-4 הפינות.';
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


