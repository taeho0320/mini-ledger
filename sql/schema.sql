CREATE DATABASE IF NOT EXISTS mini_ledger
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE mini_ledger;

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('수입', '지출') NOT NULL,
  category VARCHAR(50) NOT NULL,
  amount INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  trans_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trans_date (trans_date),
  INDEX idx_type_date (type, trans_date)
);

-- 샘플 데이터 (필요 시 실행)
INSERT INTO transactions (type, category, amount, description, trans_date)
SELECT * FROM (
  SELECT '수입' AS type, '급여' AS category, 3200000 AS amount, '11월 월급' AS description, '2026-11-10' AS trans_date
  UNION ALL SELECT '수입', '부수입', 150000, '중고 물품 판매', '2026-11-15'
  UNION ALL SELECT '지출', '식비', 12000, '점심 김치찌개', '2026-11-18'
  UNION ALL SELECT '지출', '교통', 65000, '교통카드 충전', '2026-11-03'
  UNION ALL SELECT '지출', '주거/통신', 98000, '휴대폰 및 인터넷 요금', '2026-11-12'
  UNION ALL SELECT '지출', '식비', 45000, '주말 장보기', '2026-11-21'
  UNION ALL SELECT '수입', '급여', 3200000, '10월 월급', '2026-10-10'
  UNION ALL SELECT '지출', '식비', 38000, '저녁 회식', '2026-10-22'
  UNION ALL SELECT '지출', '문화/여가', 18000, '영화 관람', '2026-10-25'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM transactions LIMIT 1);
