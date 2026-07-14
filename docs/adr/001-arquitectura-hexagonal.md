# ADR-001: Arquitectura Hexagonal (Ports & Adapters)

**Estado:** Aceptada · **Fecha:** 2026-07-13

## Contexto
El módulo debe integrarse con S3 y Glue Data Catalog, pero el enunciado permite emularlos localmente para desarrollo. Las reglas de negocio (RN-01…RN-04) y el cálculo de liquidación son el corazón del sistema y deben ser testeables sin infraestructura.

## Decisión
Arquitectura hexagonal con tres capas:
- **Dominio**: modelos, validación, reglas de negocio y liquidación en TypeScript puro. Define los puertos `StoragePort`, `CatalogPort`, `TransactionRepository` y `Clock`.
- **Aplicación**: casos de uso que orquestan dominio y puertos.
- **Infraestructura**: adapters locales (filesystem para S3, JSON para Glue y para el repositorio) y Fastify como adapter de entrada.

## Consecuencias
- (+) Pasar a AWS real = escribir 2 adapters con los SDK oficiales y cambiar el wiring en `main.ts`; nada más se toca.
- (+) Las reglas de negocio se testean con dobles en memoria, rápido y sin mocks de red.
- (+) `Clock` inyectable hace deterministas las pruebas de RN-04.
- (−) Más archivos/indirección que un CRUD plano; se acepta como costo del desacople que el propio enunciado valora.
