-- ============================================================================
-- FinCard - Componente de Datos & SQL Avanzado
-- Tabla origen: transactions (Amazon Redshift, ~500M registros)
-- ============================================================================

-- ============================================================================
-- CONSULTA 1: Liquidación mensual por aliado (últimos 12 meses) - Redshift
-- ============================================================================
-- Notas de diseño para Redshift:
--   * Filtro sargable sobre transaction_date (permite pruning de zonas).
--   * DATE_TRUNC para agrupar por mes sin funciones sobre la columna filtrada.
--   * Recomendado en la DDL: DISTKEY(partner_id) SORTKEY(transaction_date)
--     para colocar los datos del mismo aliado en el mismo slice y podar bloques.

SELECT
    t.partner_id,
    t.partner_name,
    TO_CHAR(DATE_TRUNC('month', t.transaction_date), 'YYYY-MM') AS year_month,
    SUM(t.points_earned)                                        AS total_earned,
    SUM(t.points_redeemed)                                      AS total_redeemed,
    SUM(t.points_earned) - SUM(t.points_redeemed)               AS net_owed,
    COUNT(*)                                                    AS total_transactions,
    COUNT(DISTINCT t.member_id)                                 AS unique_members
FROM transactions t
WHERE t.transaction_date >= DATE_TRUNC('month', DATEADD(month, -11, CURRENT_DATE))
  AND t.transaction_date <  DATEADD(month, 1, DATE_TRUNC('month', CURRENT_DATE))
GROUP BY t.partner_id, t.partner_name, DATE_TRUNC('month', t.transaction_date)
ORDER BY t.partner_id, year_month;


-- ============================================================================
-- CONSULTA 2: La misma liquidación optimizada para Athena / Parquet
-- ============================================================================
-- DDL sugerida de la tabla externa (ver plan de particionamiento más abajo):
--
-- CREATE EXTERNAL TABLE fincard_loyalty.transactions_parquet (
--     transaction_id  STRING,
--     member_id       STRING,
--     points_earned   INT,
--     points_redeemed INT,
--     transaction_date DATE,
--     partner_name    STRING,
--     processed_at    TIMESTAMP
-- )
-- PARTITIONED BY (year INT, month INT, partner_id STRING)
-- STORED AS PARQUET
-- LOCATION 's3://fincard-transactions/'
-- TBLPROPERTIES ('parquet.compression' = 'SNAPPY');
--
-- La consulta filtra por las COLUMNAS DE PARTICIÓN (year, month, partner_id
-- opcional), de modo que Athena solo lee los prefijos de S3 involucrados en
-- lugar de escanear la tabla completa.

SELECT
    partner_id,
    partner_name,
    date_format(date_trunc('month', transaction_date), '%Y-%m') AS year_month,
    SUM(points_earned)                                          AS total_earned,
    SUM(points_redeemed)                                        AS total_redeemed,
    SUM(points_earned) - SUM(points_redeemed)                   AS net_owed,
    COUNT(*)                                                    AS total_transactions,
    COUNT(DISTINCT member_id)                                   AS unique_members
FROM fincard_loyalty.transactions_parquet
WHERE (year * 100 + month) >= CAST(date_format(date_add('month', -11, current_date), '%Y%m') AS INTEGER)
  AND (year * 100 + month) <= CAST(date_format(current_date, '%Y%m') AS INTEGER)
GROUP BY partner_id, partner_name, date_trunc('month', transaction_date)
ORDER BY partner_id, year_month;

-- ----------------------------------------------------------------------------
-- 2.b) Estrategias de reducción de costos en Athena ($5.00/TB escaneado)
-- ----------------------------------------------------------------------------
-- 1. PARTICIONAMIENTO: particionar por year/month/partner_id hace que un
--    reporte mensual de un aliado lea solo su prefijo de S3. Con 12 meses y
--    ~4 años de historia, una consulta mensual pasa de escanear 100% de los
--    datos a ~2% (1/48 meses). Complemento: "partition projection" para
--    evitar el costo y la latencia de MSCK REPAIR / Glue crawlers.
--
-- 2. FORMATO COLUMNAR + COMPRESIÓN (Parquet + Snappy): Athena cobra por bytes
--    leídos; Parquet permite leer SOLO las columnas de la consulta (aquí 5 de
--    9) y comprime 3-10x frente a CSV. Efecto combinado típico: >90% menos
--    bytes escaneados. Adicional: los footers de Parquet traen estadísticas
--    min/max por row group que permiten "predicate pushdown".
--
-- 3. ARCHIVOS DEL TAMAÑO CORRECTO + BUCKETING: consolidar archivos pequeños a
--    128-512 MB (menos overhead por objeto S3) y aplicar bucketing por
--    member_id para consultas de un solo miembro. Complementos operativos:
--    - CTAS para materializar agregados mensuales que se consultan a diario
--      (se paga una vez el escaneo, no en cada dashboard).
--    - Workgroups con límite de bytes escaneados por consulta como control
--      presupuestal ("circuit breaker" de costos).
--
-- 4. (Bonus) LIFECYCLE en S3: mover particiones > 24 meses a S3 Glacier si el
--    negocio solo liquida con 2 años de historia (alineado con RN-04).
--
-- ----------------------------------------------------------------------------
-- 2.c) Plan de particionamiento sugerido
-- ----------------------------------------------------------------------------
--   s3://fincard-transactions/year=2026/month=07/partner_id=PART01/*.parquet
--
--   * year, month: alineados con el patrón de consulta dominante (reportes
--     mensuales, últimos 12 meses). Evita particionar por día: con ~500M de
--     filas generaría demasiadas particiones/archivos pequeños.
--   * partner_id: cardinalidad baja y controlada (decenas/cientos de aliados)
--     y aparece en el WHERE de casi todos los reportes de liquidación.
--   * NO particionar por member_id (cardinalidad alta = millones de prefijos).
--   * Configurar partition projection:
--       'projection.year.type'='integer', 'projection.year.range'='2024,2030',
--       'projection.month.type'='integer', 'projection.month.range'='1,12',
--       'projection.partner_id.type'='injected'
--
-- ----------------------------------------------------------------------------
-- 2.d) ¿Por qué Parquet vs CSV?
-- ----------------------------------------------------------------------------
--   * Columnar: una consulta que usa 5 de 9 columnas solo lee esas 5; en CSV
--     siempre se lee la fila completa.
--   * Comprimido y binario: 3-10x menos bytes en S3 => menos $/TB escaneado
--     y menos tiempo de I/O.
--   * Tipado + estadísticas: min/max por row group habilita predicate
--     pushdown (salta bloques completos sin leerlos); CSV obliga a parsear
--     texto y castear en cada consulta.
--   * Splittable de forma segura: paraleliza mejor en el motor Presto/Trino
--     de Athena.
--   Ejemplo: 1 TB CSV ≈ $5.00 por consulta full-scan; el mismo dataset en
--   Parquet+Snappy (~150 GB) leyendo 5/9 columnas ≈ $0.40, y con partición
--   mensual por aliado, centavos.


-- ============================================================================
-- CONSULTA 3: Detección de anomalías (>50% de variación vs mes anterior)
-- ============================================================================
-- Compara el neto liquidado del mes actual (mes calendario anterior completo
-- se puede obtener moviendo el ancla) contra el mes inmediatamente anterior
-- por aliado, usando ABS para capturar subidas y caídas significativas.

WITH monthly AS (
    SELECT
        partner_id,
        partner_name,
        DATE_TRUNC('month', transaction_date)         AS month_start,
        SUM(points_earned) - SUM(points_redeemed)     AS net_points
    FROM transactions
    WHERE transaction_date >= DATE_TRUNC('month', DATEADD(month, -1, CURRENT_DATE))
      AND transaction_date <  DATEADD(month, 1, DATE_TRUNC('month', CURRENT_DATE))
    GROUP BY partner_id, partner_name, DATE_TRUNC('month', transaction_date)
),
paired AS (
    SELECT
        partner_id,
        partner_name,
        month_start,
        net_points,
        LAG(net_points)  OVER (PARTITION BY partner_id ORDER BY month_start) AS prev_net,
        LAG(month_start) OVER (PARTITION BY partner_id ORDER BY month_start) AS prev_month_start
    FROM monthly
)
SELECT
    partner_id,
    partner_name,
    TO_CHAR(month_start, 'YYYY-MM')                       AS current_month,
    net_points                                            AS current_net,
    TO_CHAR(prev_month_start, 'YYYY-MM')                  AS prev_month,
    prev_net,
    ROUND(
        100.0 * (net_points - prev_net) / NULLIF(ABS(prev_net), 0),
        2
    )                                                     AS pct_change
FROM paired
WHERE prev_net IS NOT NULL
  AND ABS(net_points - prev_net) > 0.5 * ABS(NULLIF(prev_net, 0))
ORDER BY ABS(100.0 * (net_points - prev_net) / NULLIF(ABS(prev_net), 0)) DESC;
