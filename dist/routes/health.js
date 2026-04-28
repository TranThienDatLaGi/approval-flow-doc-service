"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = healthRoutes;
async function healthRoutes(fastify) {
    fastify.get('/', async () => {
        return {
            status: 'ok',
            service: 'approval-flow-doc-service',
            timestamp: new Date().toISOString(),
        };
    });
}
//# sourceMappingURL=health.js.map