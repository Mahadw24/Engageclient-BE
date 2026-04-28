import Fastify from "fastify";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import rawBody from "fastify-raw-body";
import jwt from "@fastify/jwt";
import { connectDB } from "./db.js";
import { routes } from "./routes.js";
import { authRoutes } from "./routes/auth.js";
import { whatsappRoutes } from "./routes/whatsapp.js";
import { agencyRoutes } from "./routes/agencies.js";
import { flowRoutes } from "./routes/flows.js";
import { conversationRoutes } from "./routes/conversations.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { billingRoutes } from "./routes/billing.js";
import { adminRoutes } from "./routes/admin.js";

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: "http://localhost:5173" });
await fastify.register(formbody);
await fastify.register(rawBody, { field: 'rawBody', global: false, runFirst: true });
await fastify.register(jwt, { secret: process.env.JWT_SECRET || "engageclient-dev-secret" });

// Auth decorator — use in routes via { onRequest: [fastify.authenticate] }
fastify.decorate("authenticate", async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

await fastify.register(routes);
await fastify.register(authRoutes);
await fastify.register(whatsappRoutes);
await fastify.register(agencyRoutes);
await fastify.register(flowRoutes);
await fastify.register(conversationRoutes);
await fastify.register(dashboardRoutes);
await fastify.register(billingRoutes);
await fastify.register(adminRoutes);

try {
  await connectDB();
  await fastify.listen({ port: 3000 });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
