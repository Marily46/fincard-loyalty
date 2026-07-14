import type { FastifyInstance } from 'fastify';
import { FileLevelError, type UploadTransactionsUseCase } from '../../application/upload-transactions.usecase.js';

export async function registerTransactionRoutes(
  app: FastifyInstance,
  uploadTransactions: UploadTransactionsUseCase,
): Promise<void> {
  app.post('/api/v1/transactions/upload', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({
        message: 'Se requiere un archivo CSV en el campo "file" (multipart/form-data)',
      });
    }
    if (!file.filename.toLowerCase().endsWith('.csv') && file.mimetype !== 'text/csv') {
      return reply.code(400).send({
        message: `El archivo debe ser CSV; se recibió "${file.filename}" (${file.mimetype})`,
      });
    }

    const buffer = await file.toBuffer();

    try {
      const result = await uploadTransactions.execute(buffer, file.filename);
      // Si hubo filas rechazadas, RF-01 exige 400 con el detalle por fila.
      // Las filas válidas del mismo archivo sí quedan procesadas (ver ADR-003).
      const statusCode = result.status === 'processed' ? 201 : 400;
      return reply.code(statusCode).send(result);
    } catch (error) {
      if (error instanceof FileLevelError) {
        return reply.code(400).send({ message: error.message, errors: error.details });
      }
      throw error;
    }
  });
}
