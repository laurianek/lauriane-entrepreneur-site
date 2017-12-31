const shortid = require('shortid');
const Observable = require('rxjs').Observable;
const rp = require('request-promise');
const cheerio = require('cheerio');
const WebSocket = require('ws');

const openRequests = {};
let wss;

function init(server) {
  wss = new WebSocket.Server({
    path: '/api/socket',
    server: server
  });

  setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) {
        console.log('ws:', 'closed web socket because heart beat drop');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping(null, false, true);
    })
  }, 10000);

  wss.on('connection', handleConnection);
}

function handleConnection(ws) {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      switch (data.type) {
        case 'get_asins_details': return getAsinDetails(ws, data);
        default:
          // no default
      }
    } catch (e) {
      console.log('client sent bad request', msg);
      sendError(ws, 'Please sent json formatted request or a correct type');
    }
  });

  //send immediately a feedback to the incoming connection
  ws.send(JSON.stringify({
    type: 'comms',
    message: 'Hi there, I am the Asin websocket server.\nYou\'re connected!'
  }));
}

function sendError(ws, msg) {
  const errMsg = { type:'error', error: true, message: msg};
  ws.send(JSON.stringify(errMsg));
}

function getAsinDetails(ws, data) {
  const asins = data.asins;
  const url = data.url;
  if (!asins || !url) return sendError(ws, 'Asins and url are required');

  console.log('ws:',url);
  processAsins(ws, asins, url);
}

function getPrice($el) {
  const inter = $el.text().trim().replace(/\s+/g, ' ').split('FREE')[0]
    .match(/£\d+.?\d+\b/g);
  if (!inter || inter.length === 0) return undefined;
  return inter.reduce((total, price) => Number(price.substring(1)) + total, 0);
}

function processAsins(ws, asins, url) {
  let $;
  let i = 0;
  const numberOfAsins = asins.length;
  Observable.from(asins)
    .mergeMap(asin =>
      Observable.fromPromise(rp(url + '/' + asin)).map(body => ({ body, asin })))
    .map(({ body, asin }) => {
      $ = cheerio.load(body);
      const $dp = $('#dp');
      if (!$dp[0]) {
        console.log('ws:','processing item:', asin);
        throw new Error('Not on product page');
      }

      let description;
      const site = 'amazon.co.uk';
      let price;
      let category;
      let rank;

      description = $dp.find('#title #productTitle').text()
        .trim().replace(/\d+[^\s]*\s/g, '').substring(0, 50);

      const $tempPrice = $dp.find('#price #priceblock_ourprice_lbl');
      const $salePrice = $dp.find('#price #priceblock_saleprice_lbl');
      const $dealPrice = $dp.find('#price #priceblock_dealprice_lbl');
      let buyBoxPrice = $dp.find('#buybox #soldByThirdParty')[0];

      if ($dealPrice[0]) price = $dealPrice;
      else if ($salePrice[0]) price = $salePrice;
      else price = $tempPrice;

      if (price[0]) price = getPrice(price.next());
      else price = undefined;

      if (buyBoxPrice) {
        buyBoxPrice = getPrice($(buyBoxPrice));
        price = buyBoxPrice && (buyBoxPrice > price) ? buyBoxPrice : price;
      }

      $dp.find('td.label').each((i, item) => {
        if ($(item).text().toLowerCase() !== 'best sellers rank') return;
        $(item).next().text().split('(')[0].split(' in ')
          .forEach((text, i) => {
            if (i === 0) rank = parseInt(text.match(/\d+/g).join(''));
            if (i === 1) category = text.trim().toLowerCase();
          });
      });
      (() => {
        let $dpOddDetails;
        if (!rank || !category) {
          $('.bucket').each((i, item) => {
            if ($(item).find('h2').text().toLowerCase() === 'product details') $dpOddDetails = $(item);
          });
        }
        if (!$dpOddDetails) return;
        $dpOddDetails.find('li').each((i, li) => {
          const d = $(li).text().trim().split(':').map(a => a.trim());
          if (d[0].toLowerCase() === 'amazon bestsellers rank') {
            d[1].split('(')[0].split(' in ').forEach((text, i) => {
              if (i === 0) rank = parseInt(text.match(/\d+/g).join(''));
              if (i === 1) category = text.trim().toLowerCase();
            });
          }
        });
      })();

      // clear memory...
      $('html').empty();
      $ = undefined;

      return { description, asin, site, price, category, rank };
    })
    .subscribe(
      details => {
        if (!details.asin) return;
        details.type = 'asin_detail';
        ws.send(JSON.stringify(details));
        console.log('ws:','completing…', ++i, 'out of', numberOfAsins);
      },
      (e) => {
        console.error('ws:', e);
        sendError(ws, 'there was an error in getting asin details');
      },
      () => {
        ws.send(JSON.stringify({type: 'asins_details_completed'}));
        console.log('ws:','completed');
    })
}

module.exports = init;
