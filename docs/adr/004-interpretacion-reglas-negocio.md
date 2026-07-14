# ADR-004: Interpretación y prioridad de las reglas de negocio

**Estado:** Aceptada · **Fecha:** 2026-07-13

## Contexto
RF-05 define RN-01…RN-04 pero deja ambigüedades: qué transacciones exactas se flagean en RN-01/RN-02, y si una transacción flageada por una regla cuenta en los agregados de otra.

## Decisión
1. **Orden de evaluación:** RN-04 → RN-01 → RN-03 → RN-02. Primero saneamos fechas (una fecha futura no debería consumir cupo diario), luego límites por miembro, luego frecuencia, y por último la métrica agregada del aliado.
2. **Una sola bandera por transacción**: se marca con la primera regla que incumple y deja de contar para los agregados de las reglas siguientes.
3. **RN-01**: se procesa en orden de archivo acumulando neto (earned − redeemed) por miembro/día; la transacción cuyo acumulado supere 10.000 se flagea (exactamente 10.000 es válido). Las siguientes que sigan excediendo también se flagean.
4. **RN-02**: por aliado/día se permiten `floor(total × 0.30)` transacciones con redención; las redenciones excedentes (en orden de archivo) se flagean. Exactamente 30% es válido ("más del 30%").
5. **RN-03**: de la sexta transacción en adelante (mismo miembro+aliado+día) se flagea ("más de 5").
6. **RN-04**: se compara contra la fecha del servidor (`Clock` inyectable); el límite inferior es exactamente 2 años calendario atrás, inclusive.

## Consecuencias
- (+) Comportamiento determinista y unit-testeado por regla (ver `tests/business-rules.test.ts`).
- (+) Las flageadas van a `transactions_flagged` con regla y motivo, y quedan fuera de la liquidación, como exige RF-05.
- (−) Otras interpretaciones eran defendibles (p. ej. flagear todo el día del aliado en RN-02); se optó por la de menor daño al aliado y se deja registrada.
