"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const import_1 = require("./routes/import");
const generate_1 = require("./routes/generate");
const health_1 = require("./routes/health");
const app = (0, fastify_1.default)({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport: {
            target: 'pino-pretty',
            options: { colorize: true },
        },
    },
});
async function bootstrap() {
    // Plugins
    await app.register(cors_1.default, {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    });
    await app.register(multipart_1.default, {
        limits: {
            fileSize: 50 * 1024 * 1024, // 50MB
        },
    });
    // Routes
    await app.register(health_1.healthRoutes, { prefix: '/health' });
    await app.register(import_1.importRoutes, { prefix: '/import' });
    await app.register(generate_1.generateRoutes, { prefix: '/generate' });
    // Start server
    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';
    try {
        await app.listen({ port, host });
        app.log.info(`Doc Service running on http://${host}:${port}`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=index.js.map