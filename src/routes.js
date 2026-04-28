export async function routes(fastify) {
  fastify.get("/api/health", async () => {
    return {
      status: "ok",
      twilio: process.env.TWILIO_ACCOUNT_SID ? "configured" : "missing",
    };
  });

  fastify.get("/api/hello", async () => {
    return { message: "Hello from Fastify!" };
  });
}
