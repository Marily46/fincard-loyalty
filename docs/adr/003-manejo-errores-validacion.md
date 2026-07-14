# ADR-003: 400 con procesamiento parcial en la carga

**Estado:** Aceptada · **Fecha:** 2026-07-13

## Contexto
RF-01 exige responder `400 Bad Request` con detalle por fila cuando hay errores de validación. RF-02 exige un manifest con "total de filas válidas" y "total de filas rechazadas", lo que implica que un archivo con errores parciales **sí** se procesa parcialmente. Ambos requisitos parecen tensionar entre sí.

## Decisión
- Errores **a nivel de archivo** (no es CSV, faltan columnas, archivo vacío): `400` y no se procesa nada.
- Errores **a nivel de fila**: las filas válidas se procesan (S3 + catálogo + repositorio + manifest) y la respuesta es `400` incluyendo el detalle de errores por fila **y** el resumen de lo procesado (`batch_id`, contadores, flageadas).
- Archivo 100% válido: `201 Created`.

## Consecuencias
- (+) Cumple literalmente ambos requerimientos (400 detallado + manifest con rechazadas).
- (+) El aliado no pierde el trabajo de todo el archivo por unas filas malas y recibe la información exacta para corregirlas.
- (−) Un `400` con efectos secundarios es poco convencional (un `207 Multi-Status` sería alternativa); se privilegió la literalidad del enunciado y se documenta aquí la decisión.
