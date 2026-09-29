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

    // Required goal-generation fields
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
    // 2. Get the secret API key from Cloudflare
    // ---------------------------------------------------------
    const apiKey = context.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "OPENAI_API_KEY has not been configured in Cloudflare yet."
        }),
        {
          status: 500,
          headers
        }
      );
    }

    // We use GPT-6 Luna for efficient, repeatable generation.
    // You can change this later through a Cloudflare variable.
    const model = context.env.OPENAI_MODEL || "gpt-6-luna";

    // ---------------------------------------------------------
    // 3. IMPORTANT PRIVACY STEP
    //
    // Direct identifiers are deliberately NOT sent to the AI.
    //
    // We do NOT accept/send:
    // - Student name / ID
    // - Date of birth
    // - Parent name
    // - Address / contact number
    // - School name / school ID
    // - IEP number
    // - SET name
    //
    // Only information relevant to educational goal generation
    // is included below.
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
    // 4. Expert IEP instruction for the model
    // ---------------------------------------------------------
    const instructions = `
You are an experienced Special Educator assisting a teacher in
drafting an Individualised Education Plan (IEP).

The teacher is using a CBSE-style IEP format.

Your task is to analyse the information supplied by the teacher
and draft an educationally meaningful annual goal and progressive
short-term goals.

IMPORTANT RULES:

1. Use ONLY information supplied by the teacher.
2. Do not invent assessment scores, diagnoses, disability severity,
   medical conditions, legal rights, or CBSE entitlements.
3. Do not assume a student's ability that is not stated.
4. Do not make clinical or diagnostic decisions.
5. The teacher/SET remains responsible for finalising the IEP.
6. Use respectful, child-centred and non-stigmatising language.
7. Goals must be observable and measurable.
8. The annual goal must be directly connected to the baseline and
   desired objective.
9. Create exactly FOUR short-term goals.
10. The short-term goals must show a logical progression from the
    student's baseline toward the annual goal.
11. Each short-term goal must contain:
    - a suggested timeframe
    - an observable behaviour/skill
    - a measurable criterion
    - an appropriate measurement method
12. Do NOT automatically assume 80% or 90% accuracy unless the
    available information supports such a criterion.
13. Where the teacher has supplied a percentage, frequency, count,
    duration, prompting level or similar baseline, use it when
    designing the progression.
14. Timeframes are professional suggestions only. They are NOT
    presented as mandatory CBSE timelines.
15. Suggest realistic TLM, teaching strategies, teaching procedure,
    adaptations and evaluation methods when the supplied information
    supports them.
16. Keep the suggestions practical for school implementation.
17. Distinguish an annual goal from short-term objectives.
18. Do not include the student's name or any direct identifier in
    the generated text.

Goal-writing approach:

- Condition, when relevant
- Target skill/behaviour
- Criterion
- Measurement
- Independence/prompting, only when supported by the information
- Timeframe

Return ONLY JSON that matches the supplied schema.
`;

    // ---------------------------------------------------------
    // 5. Create the OpenAI Responses API request
    // ---------------------------------------------------------
    const openAIResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,

          // Prevent the response from being stored as a response
          // object for later retrieval.
          store: false,

          reasoning: {
            effort: "low"
          },

          instructions,

          input:
            "Teacher-provided IEP information:\n\n" +
            JSON.stringify(educationalData, null, 2),

          // Structured Outputs makes the returned JSON predictable.
          text: {
            format: {
              type: "json_schema",
              name: "iep_goal_generation",
              strict: true,

              schema: {
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
                      ],
                      additionalProperties: false
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
                ],

                additionalProperties: false
              }
            }
          }
        })
      }
    );

    // ---------------------------------------------------------
    // 6. Read the OpenAI response
    // ---------------------------------------------------------
    const result = await openAIResponse.json();

    if (!openAIResponse.ok) {
      const message =
        result?.error?.message ||
        "The AI service returned an error.";

      return new Response(
        JSON.stringify({
          error: message
        }),
        {
          status: openAIResponse.status,
          headers
        }
      );
    }

    let outputText = "";

    if (typeof result.output_text === "string") {
      outputText = result.output_text;
    }

    // Fallback parser if output_text is unavailable.
    if (!outputText && Array.isArray(result.output)) {
      for (const item of result.output) {
        if (!Array.isArray(item.content)) continue;

        for (const part of item.content) {
          if (
            part.type === "output_text" &&
            typeof part.text === "string"
          ) {
            outputText += part.text;
          }
        }
      }
    }

    outputText = outputText.trim();

    if (!outputText) {
      return new Response(
        JSON.stringify({
          error: "The AI returned an empty response."
        }),
        {
          status: 502,
          headers
        }
      );
    }

    // ---------------------------------------------------------
    // 7. Parse the structured JSON returned by the model
    // ---------------------------------------------------------
    let generated;

    try {
      generated = JSON.parse(outputText);
    } catch (error) {
      return new Response(
        JSON.stringify({
          error:
            "The AI returned an unexpected format. Please try again."
        }),
        {
          status: 502,
          headers
        }
      );
    }

    // ---------------------------------------------------------
    // 8. Return the generated IEP suggestions to the browser
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
          "Unexpected server error while generating the IEP goals."
      }),
      {
        status: 500,
        headers
      }
    );
  }
}
