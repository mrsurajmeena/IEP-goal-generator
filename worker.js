import { onRequestPost } from "./functions/api/generate.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // AI generation endpoint
    if (url.pathname === "/api/generate") {
      if (request.method !== "POST") {
        return new Response(
          JSON.stringify({
            error: "Method not allowed."
          }),
          {
            status: 405,
            headers: {
              "Content-Type": "application/json",
              "Allow": "POST"
            }
          }
        );
      }

      return onRequestPost({
        request,
        env,
        waitUntil: ctx.waitUntil.bind(ctx)
      });
    }

    // Everything else = website files
    return env.ASSETS.fetch(request);
  }
};
