-- Test cards for the ridership Postman collection (docs/postman/README.md).
-- Run it on a LOCAL development database only. Re-running it does nothing:
-- existing card numbers are skipped (balances are not reset).

INSERT INTO tbl_tarjeta_ciudadana (numero_tarjeta, saldo, estado_tarjeta) VALUES
    ('TEST-RID-0001', 100.00, 'ACTIVA'),
    ('TEST-RID-BLOCKED', 100.00, 'BLOQUEADA'),
    ('TEST-RID-POOR', 0.50, 'ACTIVA')
ON CONFLICT (numero_tarjeta) DO NOTHING;
