const express = require('express');
const db = require('../config/db');

const router = express.Router();

const CATEGORIES_BY_TYPE = {
  수입: ['급여', '부수입', '용돈', '이자/배당', '기타수입'],
  지출: ['식비', '교통', '주거/통신', '쇼핑', '의료/건강', '문화/여가', '기타지출'],
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeMonth(rawMonth) {
  if (rawMonth === 'all') {
    return 'all';
  }
  if (typeof rawMonth === 'string' && MONTH_PATTERN.test(rawMonth.trim())) {
    return rawMonth.trim();
  }
  return getCurrentMonth();
}

function shiftMonth(month, delta) {
  if (!MONTH_PATTERN.test(month)) {
    return getCurrentMonth();
  }
  const [year, mon] = month.split('-').map(Number);
  const shifted = new Date(year, mon - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

function buildDateFilter(month) {
  if (month === 'all') {
    return { whereClause: '', params: [] };
  }
  const startDate = `${month}-01`;
  return {
    whereClause: 'WHERE trans_date >= ? AND trans_date < DATE_ADD(?, INTERVAL 1 MONTH)',
    params: [startDate, startDate],
  };
}

function isValidCalendarDate(dateStr) {
  if (!DATE_PATTERN.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

function validateTransactionInput(body) {
  const type = typeof body.type === 'string' ? body.type.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const rawAmount = typeof body.amount === 'string' ? body.amount.replace(/,/g, '').trim() : body.amount;
  const amount = Number(rawAmount);
  const transDate = typeof body.trans_date === 'string' ? body.trans_date.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (type !== '수입' && type !== '지출') {
    return { error: '구분은 수입 또는 지출만 선택할 수 있습니다.' };
  }
  if (!category || category.length > 50) {
    return { error: '카테고리를 1~50자 이내로 입력해 주세요.' };
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > 4294967295) {
    return { error: '금액은 1원 이상의 올바른 정수로 입력해 주세요.' };
  }
  if (!isValidCalendarDate(transDate)) {
    return { error: '유효한 날짜(YYYY-MM-DD)를 입력해 주세요.' };
  }
  if (description.length > 255) {
    return { error: '내용은 255자 이내로 입력해 주세요.' };
  }

  return {
    data: {
      type,
      category,
      amount,
      description,
      trans_date: transDate,
    },
  };
}

function enrichCategoryStats(rows, typeTotal) {
  return rows.map((row) => {
    const total = Number(row.category_total) || 0;
    const percent = typeTotal > 0 ? Math.round((total / typeTotal) * 100) : 0;
    return {
      category: row.category,
      total,
      count: Number(row.item_count) || 0,
      percent,
    };
  });
}

router.get('/', async (req, res, next) => {
  try {
    const currentMonth = getCurrentMonth();
    const month = normalizeMonth(req.query.month);
    const prevMonth = month === 'all' ? shiftMonth(currentMonth, -1) : shiftMonth(month, -1);
    const nextMonth = month === 'all' ? shiftMonth(currentMonth, 1) : shiftMonth(month, 1);
    const { whereClause, params } = buildDateFilter(month);

    const summarySql = `
      SELECT
        COALESCE(SUM(CASE WHEN type = '수입' THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = '지출' THEN amount ELSE 0 END), 0) AS total_expense
      FROM transactions
      ${whereClause}
    `;

    const categorySql = `
      SELECT
        type,
        category,
        SUM(amount) AS category_total,
        COUNT(*) AS item_count
      FROM transactions
      ${whereClause}
      GROUP BY type, category
      ORDER BY type ASC, category_total DESC
    `;

    const listSql = `
      SELECT
        id,
        type,
        category,
        amount,
        description,
        DATE_FORMAT(trans_date, '%Y-%m-%d') AS trans_date
      FROM transactions
      ${whereClause}
      ORDER BY trans_date DESC, id DESC
    `;

    const [[summaryRows], [categoryRows], [transactions]] = await Promise.all([
      db.execute(summarySql, params),
      db.execute(categorySql, params),
      db.execute(listSql, params),
    ]);

    const summaryRow = summaryRows[0] || {};
    const totalIncome = Number(summaryRow.total_income) || 0;
    const totalExpense = Number(summaryRow.total_expense) || 0;
    const balance = totalIncome - totalExpense;

    const incomeCategories = enrichCategoryStats(
      categoryRows.filter((row) => row.type === '수입'),
      totalIncome
    );
    const expenseCategories = enrichCategoryStats(
      categoryRows.filter((row) => row.type === '지출'),
      totalExpense
    );

    const error = typeof req.query.error === 'string' ? req.query.error : '';

    res.render('index', {
      month,
      prevMonth,
      nextMonth,
      currentMonth,
      today: getTodayDate(),
      summary: { totalIncome, totalExpense, balance },
      incomeCategories,
      expenseCategories,
      transactions,
      categoriesByType: CATEGORIES_BY_TYPE,
      error,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/transactions', async (req, res, next) => {
  try {
    const returnMonth = normalizeMonth(req.body.return_month);
    const validated = validateTransactionInput(req.body);

    if (validated.error) {
      return res.redirect(`/?month=${encodeURIComponent(returnMonth)}&error=${encodeURIComponent(validated.error)}`);
    }

    const { type, category, amount, description, trans_date } = validated.data;
    await db.execute(
      'INSERT INTO transactions (type, category, amount, description, trans_date) VALUES (?, ?, ?, ?, ?)',
      [type, category, amount, description, trans_date]
    );

    const targetMonth = req.body.return_month === 'all' ? 'all' : trans_date.slice(0, 7);
    res.redirect(`/?month=${encodeURIComponent(targetMonth)}`);
  } catch (err) {
    next(err);
  }
});

router.get('/transactions/:id/edit', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      const err = new Error('유효하지 않은 거래 번호입니다.');
      err.status = 404;
      return next(err);
    }

    const [rows] = await db.execute(
      `SELECT id, type, category, amount, description, DATE_FORMAT(trans_date, '%Y-%m-%d') AS trans_date
       FROM transactions
       WHERE id = ?`,
      [id]
    );

    if (rows.length === 0) {
      const err = new Error('해당 거래 내역을 찾을 수 없습니다.');
      err.status = 404;
      return next(err);
    }

    const returnMonth = normalizeMonth(req.query.month);

    res.render('edit', {
      transaction: rows[0],
      returnMonth,
      categoriesByType: CATEGORIES_BY_TYPE,
      error: '',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/transactions/:id/update', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      const err = new Error('유효하지 않은 거래 번호입니다.');
      err.status = 404;
      return next(err);
    }

    const returnMonth = normalizeMonth(req.body.return_month);
    const validated = validateTransactionInput(req.body);

    if (validated.error) {
      return res.status(400).render('edit', {
        transaction: {
          id,
          type: req.body.type === '수입' ? '수입' : '지출',
          category: req.body.category || '',
          amount: req.body.amount || '',
          description: req.body.description || '',
          trans_date: req.body.trans_date || getTodayDate(),
        },
        returnMonth,
        categoriesByType: CATEGORIES_BY_TYPE,
        error: validated.error,
      });
    }

    const { type, category, amount, description, trans_date } = validated.data;
    const [result] = await db.execute(
      `UPDATE transactions
       SET type = ?, category = ?, amount = ?, description = ?, trans_date = ?
       WHERE id = ?`,
      [type, category, amount, description, trans_date, id]
    );

    if (result.affectedRows === 0) {
      const err = new Error('수정할 거래 내역을 찾을 수 없습니다.');
      err.status = 404;
      return next(err);
    }

    const targetMonth = req.body.return_month === 'all' ? 'all' : trans_date.slice(0, 7);
    res.redirect(`/?month=${encodeURIComponent(targetMonth)}`);
  } catch (err) {
    next(err);
  }
});

router.post('/transactions/:id/delete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      const err = new Error('유효하지 않은 거래 번호입니다.');
      err.status = 404;
      return next(err);
    }

    const returnMonth = normalizeMonth(req.body.return_month);
    await db.execute('DELETE FROM transactions WHERE id = ?', [id]);
    res.redirect(`/?month=${encodeURIComponent(returnMonth)}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
