function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[error]', err);

  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'duplicate', message: 'This record already exists.' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'not_found' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }

  res.status(err.status || 500).json({
    error: err.publicCode || 'internal_error',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
}

module.exports = errorHandler;
