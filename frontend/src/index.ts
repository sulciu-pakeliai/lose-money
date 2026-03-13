import { serve } from "bun";
import index from "./index.html";

const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";

const server = serve({
  routes: {
    "/api/*": async req => {
      const incomingURL = new URL(req.url);
      const targetURL = new URL(`${incomingURL.pathname}${incomingURL.search}`, backendOrigin);
      try {
        return await fetch(new Request(targetURL, req));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Backend is unavailable";
        return Response.json(
          {
            error: `Backend proxy failed for ${targetURL.pathname}: ${message}`,
          },
          { status: 502 },
        );
      }
    },

    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Frontend server running at ${server.url} -> proxying API to ${backendOrigin}`);
