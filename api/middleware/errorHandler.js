
function errorHandler(err, req, res, next) {
  var errCode = err.code;
  console.error('Error handler: ' + err);

  if(!errCode) {
    return res.status(500).send('Server error occured');
  }

  res.status(400).send(err.message);
}

module.exports = errorHandler;