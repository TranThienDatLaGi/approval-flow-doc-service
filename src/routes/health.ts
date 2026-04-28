import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async () => {
    return {
      status: 'ok',
      service: 'approval-flow-doc-service',
      timestamp: new Date().toISOString(),
    };
  });
}
