const express = require('express');
const router = express.Router();

/* server home page. */
router.get('/', (req, res, next) => {
  res.status(200).send('Data Shape Server')
});

module.exports = router;
