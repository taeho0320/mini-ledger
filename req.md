# 미니 가계부 (수입/지출 내역서) 요구사항 명세서 (`req.md`)

## 1. 프로젝트 개요
- **프로젝트명**: 미니 가계부 (Mini Ledger)
- **목적**: 날짜별 수입과 지출 내역을 기록·관리하고, 상단에 총 수입·총 지출·잔액을 실시간으로 집계하여 보여주는 웹 애플리케이션을 구축한다.
- **렌더링 방식**: Express + EJS 기반 서버 사이드 렌더링 (SSR)

---

## 2. 기술 스택 및 환경
- **Runtime**: Node.js (LTS 권장)
- **Web Framework**: Express
- **View Engine**: EJS (`views/` 디렉터리)
- **Database**: MySQL
- **DB Driver**: `mysql2` (`mysql2/promise` 커넥션 풀 사용)
- **기타 권장 패키지**: `dotenv` (DB 환경변수 관리)

---

## 3. 권장 디렉터리 구조
```text
project-root/
├── app.js                  # Express 앱 진입점 및 미들웨어/라우터 설정
├── package.json
├── .env                    # DB 접속 정보, PORT 등 환경변수
├── config/
│   └── db.js               # mysql2/promise Pool 설정
├── routes/
│   └── transactions.js     # 가계부 라우터 (조회, 등록, 수정, 삭제)
├── views/
│   ├── index.ejs           # 메인 가계부 페이지 (필터, 요약, 등록폼, 집계, 내역)
│   └── partials/           # 공통 헤더/푸터 등 (선택)
├── public/
│   └── css/
│       └── style.css       # 스타일시트
└── sql/
    └── schema.sql          # 테이블 생성 및 초기 샘플 데이터 SQL
```

---

## 4. 데이터베이스 설계
테이블 개수는 핵심 테이블 **`transactions` 1개** 구성을 기본으로 하며, 필요 시 카테고리 관리를 위한 `categories` 테이블을 추가해 최대 2개까지 확장할 수 있다.

### 4.1 `transactions` 테이블 (필수)
| 컬럼명 | 데이터 타입 | 제약조건 | 설명 |
|---|---|---|---|
| `id` | `INT` | `PRIMARY KEY AUTO_INCREMENT` | 거래 고유 번호 |
| `type` | `ENUM('수입', '지출')` | `NOT NULL` | 거래 구분 (`수입` 또는 `지출`) |
| `category` | `VARCHAR(50)` | `NOT NULL` | 카테고리 (예: 급여, 용돈, 식비, 교통, 주거, 쇼핑 등) |
| `amount` | `INT UNSIGNED` | `NOT NULL` | 금액 (0보다 큰 정수, 원 단위) |
| `description` | `VARCHAR(255)` | `DEFAULT ''` | 상세 내용 / 메모 |
| `trans_date` | `DATE` | `NOT NULL` | 거래 발생 날짜 (`YYYY-MM-DD`) |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | 데이터 생성 일시 |

### 4.2 DDL 예시
```sql
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
```

> **[선택 확장 - 2개 테이블 구성 시]**  
> 카테고리 목록을 DB에서 동적으로 관리하려면 `categories (id, type, name)` 테이블을 추가하여 폼의 `<select>` 옵션을 조회해 렌더링할 수 있다. (단, 1개 테이블 구성 시 EJS 뷰 또는 상수 배열로 기본 카테고리 목록 제공)

---

## 5. 기능 요구사항

### 5.1 상단 요약 대시보드
- 선택된 조회 월(또는 전체) 기준으로 아래 3개 지표를 상단 카드 형태로 표시한다.
  - **총 수입**: 해당 기간 `type = '수입'` 금액의 합계
  - **총 지출**: 해당 기간 `type = '지출'` 금액의 합계
  - **잔액**: `총 수입 - 총 지출` (적자 시 `-` 부호 및 강조 색상 표시)
- 금액은 천 단위 콤마 포맷(예: `1,250,000원`)으로 출력한다.

### 5.2 월별 조회 필터
- 상단 또는 내역 영역에 월별 필터 UI (`<input type="month">` 또는 연/월 선택 드롭다운)를 제공한다.
- Query String 기반 조회: `GET /?month=YYYY-MM`
  - `month` 파라미터가 없으면 **현재 연월(예: `2026-11`)** 을 기본값으로 조회한다.
  - `month=all` 등 전체 기간 조회 옵션을 추가로 둘 수 있다.
- 이전 달 / 다음 달 이동 버튼 또는 월 선택 변경 시 즉시 해당 월의 요약·카테고리 집계·거래 내역이 갱신된다.

### 5.3 수입/지출 내역 등록
- 사용자가 아래 항목을 입력해 내역을 등록할 수 있어야 한다.
  - **구분 (`type`)**: 수입 / 지출 선택 (라디오 버튼 또는 셀렉트)
  - **카테고리 (`category`)**: 구분에 맞는 카테고리 선택 또는 입력 (예: 수입 - 급여, 부수입, 용돈 / 지출 - 식비, 교통, 쇼핑, 공과금, 기타)
  - **금액 (`amount`)**: 1 이상의 숫자 입력
  - **날짜 (`trans_date`)**: 기본값 오늘 날짜 (`YYYY-MM-DD`)
  - **내용 (`description`)**: 거래 메모 (선택 또는 필수)
- 등록 완료 후 현재 조회 중이던 월(또는 등록한 거래의 월 `/?month=YYYY-MM`)로 리다이렉트한다 (PRG 패턴: Post-Redirect-Get).

### 5.4 거래 내역 목록 조회
- 선택된 월의 거래 내역을 **날짜 내림차순 (`trans_date DESC, id DESC`)** 으로 출력한다.
- 표시 항목: 날짜, 구분(수입/지출 배지), 카테고리, 내용, 금액, 관리(수정/삭제)
- 수입은 파란색/초록색 계열, 지출은 빨간색 계열로 시각적으로 구분한다.
- 조회 결과가 없을 경우 안내 문구("해당 월의 거래 내역이 없습니다.")를 표시한다.

### 5.5 거래 내역 수정 및 삭제
- **삭제**: 각 행의 삭제 버튼 클릭 시 확인(`confirm`) 후 해당 `id` 레코드를 삭제하고, 보고 있던 월 페이지로 리다이렉트한다.
- **수정**: 각 행의 수정 버튼으로 수정 폼/모달 또는 수정 페이지를 열어 `type`, `category`, `amount`, `description`, `trans_date`를 변경할 수 있다.

### 5.6 카테고리별 합계 조회 (SQL 집계 활용)
- 선택된 월 기준으로 카테고리별 총액을 계산하여 요약 테이블 또는 사이드/하단 영역에 표시한다.
- 구분(`수입`/`지출`) + 카테고리(`category`)별 합계 금액과 건수, 비중(%) 등을 함께 표시한다.

---

## 6. SQL 집계 쿼리 명세
월별 조회 시 `month` (`YYYY-MM`) 값으로부터 시작일(`YYYY-MM-01`)과 다음 달 1일 범위를 계산하여 인덱스를 타도록 조회하는 것을 권장한다.

### 6.1 월별 총 수입 / 총 지출 집계 (`SUM`)
```sql
SELECT
  COALESCE(SUM(CASE WHEN type = '수입' THEN amount ELSE 0 END), 0) AS total_income,
  COALESCE(SUM(CASE WHEN type = '지출' THEN amount ELSE 0 END), 0) AS total_expense
FROM transactions
WHERE trans_date >= ? AND trans_date < DATE_ADD(?, INTERVAL 1 MONTH);
```
- 또는 `GROUP BY type` 활용:
```sql
SELECT
  type,
  COALESCE(SUM(amount), 0) AS total_amount
FROM transactions
WHERE trans_date >= ? AND trans_date < DATE_ADD(?, INTERVAL 1 MONTH)
GROUP BY type;
```

### 6.2 월별 카테고리별 합계 집계 (`SUM`, `GROUP BY`)
```sql
SELECT
  type,
  category,
  SUM(amount) AS category_total,
  COUNT(*) AS item_count
FROM transactions
WHERE trans_date >= ? AND trans_date < DATE_ADD(?, INTERVAL 1 MONTH)
GROUP BY type, category
ORDER BY type ASC, category_total DESC;
```

### 6.3 월별 거래 내역 목록 조회
```sql
SELECT
  id,
  type,
  category,
  amount,
  description,
  DATE_FORMAT(trans_date, '%Y-%m-%d') AS trans_date
FROM transactions
WHERE trans_date >= ? AND trans_date < DATE_ADD(?, INTERVAL 1 MONTH)
ORDER BY trans_date DESC, id DESC;
```

---

## 7. 라우팅 (Endpoint) 설계

| Method | Path | 설명 | 응답/동작 |
|---|---|---|---|
| `GET` | `/` | 메인 가계부 페이지 조회 (`?month=YYYY-MM`) | `views/index.ejs` 렌더링 (요약, 카테고리 집계, 목록 전달) |
| `POST` | `/transactions` | 새 수입/지출 내역 등록 | DB INSERT 후 `/?month=YYYY-MM` 리다이렉트 |
| `GET` | `/transactions/:id/edit` | (선택) 수정 페이지 렌더링 또는 모달 방식 사용 시 생략 | `views/edit.ejs` 렌더링 |
| `POST` | `/transactions/:id/update` | 기존 거래 내역 수정 | DB UPDATE 후 `/?month=YYYY-MM` 리다이렉트 |
| `POST` | `/transactions/:id/delete` | 기존 거래 내역 삭제 | DB DELETE 후 `/?month=YYYY-MM` 리다이렉트 |

---

## 8. 유효성 검증 및 예외/보안 요구사항
1. **SQL Injection 방지**: 모든 SQL 쿼리에 `mysql2` Prepared Statement(`?` 바인딩)를 사용한다.
2. **XSS 방지**: EJS 템플릿 출력 시 `<%= value %>` 이스케이프 문법을 사용한다.
3. **입력값 검증**:
   - `type`: `'수입'` 또는 `'지출'`만 허용
   - `category`: 빈 문자열 불가 (trim 후 길이 1~50자)
   - `amount`: 양의 정수(`> 0`)만 허용 (`NaN`, 음수, 0 차단)
   - `trans_date`: 유효한 `YYYY-MM-DD` 형식 확인
   - `month` 필터: `^\d{4}-(0[1-9]|1[0-2])$` 정규식 검증, 유효하지 않으면 현재 월로 fallback
4. **에러 처리**: DB 오류 또는 잘못된 요청 시 적절한 상태 코드 및 사용자 안내 처리 (서버 비정상 종료 방지).

---

## 9. 완료 기준 (Acceptance Criteria)
- [ ] `transactions` 테이블 생성 SQL이 정상 동작하고 샘플 데이터 조회가 가능하다.
- [ ] 메인 페이지 접속 시 기본으로 이번 달 내역과 상단 `총 수입`, `총 지출`, `잔액`이 정확히 계산되어 표시된다.
- [ ] 월별 필터 변경 시 해당 월의 요약 금액, 카테고리별 합계(`SUM` + `GROUP BY`), 거래 목록이 모두 일관되게 갱신된다.
- [ ] 수입/지출 내역 추가, 수정, 삭제 후 상단 요약과 카테고리별 합계가 즉시 반영된다.
- [ ] 내역이 0건인 월을 조회해도 오류 없이 `총 수입 0원 / 총 지출 0원 / 잔액 0원`이 표시된다.
