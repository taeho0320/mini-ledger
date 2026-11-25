require('dotenv').config();

const path = require('path');
const express = require('express');
const transactionsRouter = require('./routes/transactions');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.locals.formatNumber = (value) => Number(value || 0).toLocaleString('ko-KR');

app.use('/', transactionsRouter);

app.use((req, res) => {
  res.status(404).send('요청하신 페이지를 찾을 수 없습니다.');
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).send(
    status === 404
      ? err.message
      : '서버 처리 중 오류가 발생했습니다. 데이터베이스 연결 및 테이블 상태를 확인해 주세요.'
  );
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Mini Ledger server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
