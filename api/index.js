const express = require('express');
const apiApp = express();
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');

const auth = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const asin = require('./asinHandler');


//https://lauriane-enterpreneur.herokuapp.com/


//api wide middleware
apiApp.use(morgan('combined'));
apiApp.use(cors());
apiApp.use(bodyParser.json());
apiApp.disable('x-powered-by');

apiApp.get('/', (req, res) => res.send('this amz chrome ext api v1'));
apiApp.get('/asins', asin.getAsinDetails);
apiApp.get('/asins-status', asin.getRequestStatus);
apiApp.use(errorHandler);


module.exports = apiApp;