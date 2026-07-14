# ADR-002: Emulación local de S3/Glue y persistencia JSON

**Estado:** Aceptada · **Fecha:** 2026-07-13

## Contexto
El enunciado permite emular S3 y Glue localmente. Se evaluaron: LocalStack, SQLite y archivos JSON/filesystem.

## Decisión
- **S3** → `FsStorageAdapter`: replica el layout `fincard-transactions/{year}/{month}/{partner_id}/` sobre el filesystem y escribe el manifest por batch.
- **Glue** → `JsonCatalogAdapter`: persiste base de datos `fincard_loyalty`, tabla `transactions` (columnas + metadatos) y particiones registradas en un JSON.
- **Repositorio** → `JsonTransactionRepository`: tablas `transactions` y `transactions_flagged` en JSON.

## Alternativas descartadas
- **LocalStack**: fidelidad alta pero añade Docker-compose y tiempo de arranque; no aporta a lo evaluado (diseño y reglas).
- **SQLite**: mejor para volumen, pero introduce dependencia nativa; el volumen de la prueba no lo justifica y el puerto permite migrar después.

## Consecuencias
- (+) `npm install && npm run dev` funciona sin ningún servicio externo.
- (+) Los artefactos generados (particiones, manifest, catálogo) son inspeccionables a simple vista, útil para revisar la prueba.
- (−) Sin concurrencia real ni transaccionalidad; aceptable para el alcance. En producción el repositorio sería PostgreSQL/Redshift detrás del mismo puerto.
