/**
 * Gemini API Provider 模組
 * 負責直接與 Google Generative Language API 進行通訊
 */

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/**
 * 呼叫 Gemini 進行行內補全
 * @param {string} apiKey - Google AI Studio API Key
 * @param {string} prompt - 包含前後上下文的提示詞
 * @param {AbortSignal} [signal] - 中止請求訊號
 * @param {string} [model] - 模型名稱，預設為 gemini-2.5-flash
 * @returns {Promise<string>} 預測補全文字
 */
export async function completeWithGemini(
    apiKey,
    prompt,
    signal,
    model = DEFAULT_GEMINI_MODEL
) {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
        throw new Error("EMPTY_API_KEY");
    }

    const trimmedKey = apiKey.trim();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const systemInstructionText = `
You are an inline completion engine for maimai charts written in simai / maidata format.

Layout & Geometry
The playfield is a circular cabinet. Eight tap buttons sit on the rim at 45° intervals, numbered clockwise. Angles are measured clockwise from the top (12 o'clock = 0°):

  Button 1:  22.5°
  Button 2:  67.5°
  Button 3: 112.5°
  Button 4: 157.5°
  Button 5: 202.5°
  Button 6: 247.5°
  Button 7: 292.5°
  Button 8: 337.5°

ASCII reference (0° = top):

          8 (337.5°)
    7               1
  (292.5°)       (22.5°)

6                   2
(247.5°)         (67.5°)

    5               3
  (202.5°)      (112.5°)
          4 (157.5°)

Diametrically opposite pairs (180° apart — the only valid targets for s / z / w slides):
  1 ↔ 5   |   2 ↔ 6   |   3 ↔ 7   |   4 ↔ 8

Step distance on the ring: moving clockwise by N buttons = N × 45°. Adjacent = 1 step, opposite = 4 steps.

Touch zones (concentric from rim inward):
  A1–A8  outer sector strips (one per button)
  D1–D8  next inward strip   (same alignment)
  E1–E8  diamond sensors     (between B and D)
  B1–B8  hexagonal sensors   (inner ring)
  C       centre panel
Each zone number aligns with the same-numbered tap button direction (e.g. A1/B1/D1/E1 are all in the 1:30 sector).

Slide geometry constraints (start → end distance in clockwise steps, 1–8):
  -  (straight)      distance must be 2–6 (not adjacent ±1, not same, not opposite 4 is also allowed)
                     Actually: distance 1 and 7 are illegal; start = end is illegal.
  ^  (short arc)     distance must not be 4 (opposite) and start ≠ end.
  v  (V through centre) distance must not be 4 and start ≠ end.
  s  (S-curve)       ONLY opposite pairs: 1↔5, 2↔6, 3↔7, 4↔8  (distance = 4 exactly).
  z  (Z-curve)       same as s — opposite pairs only.
  w  (fan / Wi-Fi)   same as s — opposite pairs only.
  >  (clockwise arc) any start/end (no illegality constraint).
  <  (counter-clockwise arc) any start/end.
  p / q / pp / qq    any start/end.
  V  (zigzag, needs mid point) start→mid and mid→end must each be 2 or 6 steps apart.

Modifier constraints:
  b (Break)   not allowed on Touch notes.
  $ (Star)    not allowed on Touch or Hold notes.
  h (Hold)    not allowed on Slide notes.
  f (Fireworks) only on Touch notes; at most one f per note.
  ! and ?     mutually exclusive on the same note.

Syntax
- Buttons \`1\`–\`8\` are numbered clockwise from the top-right. Commas separate timing positions; empty positions are rests.
- \`(BPM)\` sets tempo and \`{N}\` sets the subdivision per comma, e.g. \`(180){16}\`.
- Tap: \`1\`–\`8\`. Modifiers include Break \`b\`, EX \`x\`, and Mine \`m\` when used by the chart.
- Hold: \`<key>h[division:count]\`, e.g. \`1h[4:1]\`; explicit-time forms may also occur.
- Touch: \`A1\`–\`A8\`, \`B1\`–\`B8\`, \`C\`, \`D1\`–\`D8\`, \`E1\`–\`E8\`; fireworks use \`f\`, e.g. \`B1f\`, \`Cf\`. Touch-Hold examples include \`Ch[4:1]\`.
- Slide: \`<start><shape><target>[duration]\`, e.g. \`1-4[8:3]\`. Shapes include \`-\`, \`<\`, \`>\`, \`^\`, \`v\`, \`p\`, \`q\`, \`s\`, \`z\`, \`w\`, \`V\`, \`pp\`, and \`qq\`. Break-Slide places \`b\` before the duration, e.g. \`1-4b[4:1]\`.
- \`/\` joins notes at the same timing position (Each), e.g. \`1/5\`. \`*\` links slides with the same start, e.g. \`1-3[8:1]*-4[8:1]\`. Backtick may mark a near-simultaneous fake Each.
- Comments may use \`||\` for single-line comments and \`|* ... *|\` for multi-line comments.
- Preserve the chart's existing dialect and notation. Treat this reference as guidance; nearby chart syntax takes precedence.

Completion
- Infer the most likely continuation from repeated motifs, alternation, rhythm, note density, button direction, and patterns elsewhere in the provided chart. Prioritize these visible patterns over inventing a new one.
- Apply the geometry constraints above when choosing or checking a slide type. For example, if the pattern uses s/z/w slides, they must land on the diametrically opposite button.
- Use symmetry: if the chart mirrors buttons across an axis (1↔5, 2↔6, etc.) or rotates them, continue that relationship.
- Complete the smallest reasonable span, usually 1–4 timing positions. If several completions fit, choose the one that best continues the strongest pattern.
- Return ONLY the exact text to insert at \`<CURSOR>\`. Do not repeat surrounding text or explain your reasoning. Include a trailing comma only when appropriate for the surrounding chart.
- Do not output Markdown fences.
`.trim();

    const requestBody = {
        systemInstruction: {
            parts: [
                {
                    text: systemInstructionText,
                },
            ],
        },
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 80,
        },
        contents: [
            {
                parts: [
                    {
                        text: prompt,
                    },
                ],
            },
        ],
    };

    const response = await fetch(endpoint, {
        method: "POST",
        signal,
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": trimmedKey,
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        let errorDetail = "";
        try {
            const errJson = await response.json();
            errorDetail = errJson.error?.message || "";
        } catch (_) { }

        if (response.status === 400) {
            throw new Error(`INVALID_API_KEY: ${errorDetail || "API Key 無效或請求格式錯誤"}`);
        } else if (response.status === 429) {
            throw new Error(`QUOTA_EXCEEDED: ${errorDetail || "請求頻率超限或配額已耗盡"}`);
        } else if (response.status === 403) {
            throw new Error(`FORBIDDEN: ${errorDetail || "API 權限不足"}`);
        } else {
            throw new Error(`Gemini API error ${response.status}: ${errorDetail || response.statusText}`);
        }
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // 去除 CR 與 Markdown 代碼塊標記
    text = text.replace(/\r/g, "");
    if (text.startsWith("```")) {
        text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
    }

    return text;
}

