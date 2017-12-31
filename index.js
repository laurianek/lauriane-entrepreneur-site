const express = require('express');
const http = require('http');
const app = express();
const api = require('./api');
const webSocketApi = require('./api/asinSocketHandler');

const server = http.createServer(app);
app.set('port', (process.env.PORT || 5000));
webSocketApi(server);

app.use(express.static(__dirname + '/public'));
app.use('/api', api);

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function(request, response) {
  response.render('pages/index');
});

server.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
