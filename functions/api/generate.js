export async function onRequestPost(context) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  try {
    // ---------------------------------------------------------
    // 1. Read the teacher's submitted information
    // ---------------------------------------------------------
    const body = await context.request.json();

    const requiredFields = [
      "domain",
      "task",
      "baseline",
      "objective"
    ];

    for (const field of requiredFields) {
      if (!body[field] || !String(body[field]).trim()) {
        return new Response(
          JSON.stringify({
            error: `Please complete the required field: ${field}`
          }),
          {
            status: 400,
            headers
          }
        );
      }
    }

    // ---------------------------------------------------------
    // 2. Get Gemini API key from Cloudflare Secret
    // ---------------------------------------------------------
    const apiKey = context.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "GEMINI_API_KEY has not been configured in Cloudflare yet."
        }),
        {
          status: 500,
          headers
        }
      );
    }

    // Current Gemini model
    const model = "gemini-3.8-flash";

    // ---------------------------------------------------------
    // 3. Privacy filter
    //
    // Direct identifiers are NOT sent to Gemini.
    // ---------------------------------------------------------
    const educationalData = {
      special_need: body.specialNeed || "",
      degree_of_disability: body.degree || "",
      associated_conditions: body.associated || "",
      languages: body.languages || "",
      significant_information: body.significant || "",

      special_education_services: body.services || "",
      cbse_relaxations: body.relaxations || "",

      class_section: body.classSection || "",

      area_domain: body.domain || "",
      task_skill_activity: body.task || "",
      baseline: body.baseline || "",
      desired_objective: body.objective || "",

      setting: Array.isArray(body.setting)
        ? body.setting
        : [],

      tlm: body.tlm || "",
      teaching_strategies: body.strategies || "",
      teaching_procedure: body.procedure || "",
      adaptations: body.adaptations || "",
      current_evaluation: body.evaluation || ""
    };

    // ---------------------------------------------------------
    // 4. IEP expert instructions
    // ---------------------------------------------------------
    const systemInstruction = `
You are an experienced Special Educator assisting a teacher
with drafting an Individualised Education Plan (IEP).

The teacher is using a CBSE-style IEP format.

Your job is to analyse the teacher-provided information and draft
a meaningful annual goal and progressive short-term goals.

IMPORTANT RULES:

1. Use ONLY information provided by the teacher.
2. Never invent assessment scores, diagnoses, disability severity,
   medical conditions, legal rights, or CBSE entitlements.
3. Do not make diagnostic or clinical decisions.
4. Use respectful, child-centred, non-stigmatising language.
5. The annual goal must directly relate to the student's baseline
   and the desired skill.
6. Create EXACTLY FOUR short-term goals.
7. Short-term goals must progress logically from the baseline
   toward the annual goal.
8. Every short-term goal must include:
   - suggested timeframe
   - observable skill/behaviour
   - measurable criterion
   - measurement method
9. Do NOT automatically assume 80% or 90% accuracy.
10. Use numbers/percentages/frequencies/durations supplied by
    the teacher whenever appropriate.
11. Do not invent a prompting level unless the teacher provides it.
12. Suggested timeframes are professional suggestions only and
    are NOT mandatory CBSE timelines.
13. Suggest practical TLM, teaching strategies, teaching procedure,
    adaptations/accommodations/modifications, and evaluation.
14. Keep goals realistic for school implementation.
15. Make the goals observable and measurable.
16. Do not include student names or other direct identifiers in
    the generated goal text.
17. The teacher/Special Educator must review the generated content
    before putting it into the official IEP.

Goal-writing structure where appropriate:

Condition → Skill/Behaviour → Criterion → Measurement → Timeframe

Return ONLY valid JSON matching the requested schema.
`;

    // ---------------------------------------------------------
    // 5. Gemini REST API request
    // ---------------------------------------------------------
    const geminiURL =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const geminiResponse = await fetch(geminiURL, {
      method: "POST",

      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: systemInstruction
            }
          ]
        },

        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Teacher-provided IEP information:\n\n" +
                  JSON.stringify(
                    educationalData,
                    null,
                    2
                  )
              }
            ]
          }
        ],

        generationConfig: {
          responseMimeType: "application/json",

          responseSchema: {
            type: "object",

            properties: {
              annual_goal: {
                type: "string"
              },

              short_term_goals: {
                type: "array",

                items: {
                  type: "object",

                  properties: {
                    timeframe: {
                      type: "string"
                    },

                    goal: {
                      type: "string"
                    },

                    measurement: {
                      type: "string"
                    }
                  },

                  required: [
                    "timeframe",
                    "goal",
                    "measurement"
                  ]
                }
              },

              timeframe_note: {
                type: "string"
              },

              tlm: {
                type: "string"
              },

              teaching_strategies: {
                type: "string"
              },

              teaching_procedure: {
                type: "string"
              },

              adaptations: {
                type: "string"
              },

              evaluation: {
                type: "string"
              }
            },

            required: [
              "annual_goal",
              "short_term_goals",
              "timeframe_note",
              "tlm",
              "teaching_strategies",
              "teaching_procedure",
              "adaptations",
              "evaluation"
            ]
          },

          // Lower reasoning level keeps testing economical.
          thinkingConfig: {
            thinkingLevel: "low"
          }
        }
      })
    });

    // ---------------------------------------------------------
    // 6. Read Gemini response
    // ---------------------------------------------------------
    const result = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const message =
        result?.error?.message ||
        "Gemini API returned an error.";

      return new Response(
        JSON.stringify({
          error: message
        }),
        {
          status: geminiResponse.status,
          headers
        }
      );
    }

    // Gemini places generated text inside:
    // candidates[0].content.parts[0].text
    let outputText = "";

    const parts =
      result?.candidates?.[0]?.content?.parts;

    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (
          typeof part.text === "string"
        ) {
          outputText += part.text;
        }
      }
    }

    outputText = outputText.trim();

    if (!outputText) {
      return new Response(
        JSON.stringify({
          error:
            "Gemini returned an empty response."
        }),
        {
          status: 502,
          headers
        }
      );
    }

    // ---------------------------------------------------------
    // 7. Parse structured JSON
    // ---------------------------------------------------------
    let generated;

    try {
      generated = JSON.parse(outputText);
    } catch (error) {
      return new Response(
        JSON.stringify({
          error:
            "Gemini returned an unexpected format. Please try again."
        }),
        {
          status: 502,
          headers
        }
      );
    }

    // ---------------------------------------------------------
    // 8. Return generated goals to browser
    // ---------------------------------------------------------
    return new Response(
      JSON.stringify(generated),
      {
        status: 200,
        headers
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          "Unexpected server error while generating IEP goals."
      }),
      {
        status: 500,
        headers
      }
    );
  }
}
